//! Model routing.
//!
//! Routing turns a `provider/model` api id into a runnable agent and owns the
//! provider fan-out so the rest of the crate stays provider-agnostic:
//!
//! - [`RoutedModel`] — the routed id bound to its provider client. One arm per
//!   wire protocol: Anthropic-native, OpenAI Responses, and OpenAI-compatible
//!   Chat Completions. Compatible providers live in a data registry keyed by
//!   name, so adding one is [`with_openai_provider`](ModelRouter::with_openai_provider).
//! - [`ProviderAgent`] — a built rig agent, with the same arms. Its
//!   [`run_stream`](ProviderAgent::run_stream) matches internally, so callers
//!   (e.g. `agent_loop`) hold one type and never fan out.
//!
//! Ids are addressed as `provider/model` (e.g. `anthropic/claude-opus-4-8`,
//! `groq/llama-3.3-70b`); routing picks the provider from the segment, never by
//! sniffing the id. Unroutable ids fall back to the default model.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use ai_toolset::{RequestContext, SearchableTool};
use ai_usage::{UsageContext, UsageRecorder};
use conation_env_var::{env_var, maybe_env_var};
use futures::StreamExt;
use rig_agent::agent::{Agent, AgentBuilder, MultiTurnStreamItem};
use rig_agent::streaming::StreamingPrompt;
use rig_agent::tool::server::ToolServerHandle;
use rig_core::completion::{CompletionModel, GetTokenUsage};
use rig_core::message::Message;
use rig_core::providers::{anthropic, openai};
use rig_core::streaming::StreamedAssistantContent;

use super::PredefinedModel;
use super::anthropic::AnthropicModel;
use super::openai::{OpenAiChatCompletionsModel, OpenAiResponsesModel};
use super::types::Model;
use crate::error::AgentError;
use crate::hook::{RegisterFn, StreamBridge, ToolRouter};
use crate::stream::{ChatCompletionStream, StreamPart};

env_var! {
    struct RoxApiKey;
}

maybe_env_var! {
    struct RoxModelFallbackChain;
}

maybe_env_var! {
    struct AnthropicApiKey;
}

maybe_env_var! {
    struct OpenaiApiKey;
}

maybe_env_var! {
    struct CerebrasApiKey;
}

/// Provider segment for native Anthropic.
const ANTHROPIC_PROVIDER: &str = "anthropic";
/// Provider segment the built-in OpenAI client is registered under.
const OPENAI_PROVIDER: &str = "openai";
/// Provider segment Cerebras is registered under (OpenAI-compatible Chat
/// Completions).
const CEREBRAS_PROVIDER: &str = "cerebras";
/// Cerebras inference endpoint (OpenAI-compatible Chat Completions API).
const CEREBRAS_BASE_URL: &str = "https://api.cerebras.ai/v1";
/// Provider segment Rox is registered under (OpenAI-compatible Chat Completions).
/// Default provider for Conation — https://api.rox.one/v1
const ROX_PROVIDER: &str = "rox";
/// Rox inference endpoint (OpenAI-compatible Chat Completions API).
const ROX_BASE_URL: &str = "https://api.rox.one/v1";
/// Default Rox/OmniRoute model sequence for Conation.
pub const DEFAULT_ROX_MODEL_CHAIN: &[&str] = &[
    "rox/gemini-2.5-flash",
    "rox/nemotron-3-ultra",
    "rox/gpt-5.6-luna",
];
/// First model in the default Conation sequence.
pub const DEFAULT_ROX_MODEL: &str = DEFAULT_ROX_MODEL_CHAIN[0];

/// What the server should do with a model failure before any output escaped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FailureDisposition {
    /// The request/configuration is invalid or unauthorized; surface it.
    Stop,
    /// Retry the same model once, then continue down the fallback chain.
    RetryThenFallback,
    /// Skip directly to the next configured model.
    Fallback,
}

/// Classify provider failures without relying on provider-specific message text.
pub(crate) fn classify_failure(error: &AgentError) -> FailureDisposition {
    if error.was_cancelled() {
        return FailureDisposition::Stop;
    }
    let Some(completion) = error.completion_error() else {
        return FailureDisposition::Stop;
    };

    if let Some(status) = completion.provider_response_status() {
        return classify_status(status.as_u16());
    }

    match completion {
        // No status means the request did not receive a usable HTTP response.
        rig_core::completion::CompletionError::HttpError(_)
        | rig_core::completion::CompletionError::ProviderError(_) => {
            FailureDisposition::RetryThenFallback
        }
        // A provider answered but its response could not be consumed. A second
        // model may still satisfy the same provider-neutral request.
        rig_core::completion::CompletionError::ResponseError(_)
        | rig_core::completion::CompletionError::JsonError(_)
        | rig_core::completion::CompletionError::ProviderResponse(_) => {
            FailureDisposition::Fallback
        }
        _ => FailureDisposition::Stop,
    }
}

/// Classify an HTTP response without coupling tests to a concrete HTTP client.
pub(crate) fn classify_status(status: u16) -> FailureDisposition {
    match status {
        404 | 422 => FailureDisposition::Fallback,
        408 | 409 | 425 | 429 | 500..=599 => FailureDisposition::RetryThenFallback,
        _ => FailureDisposition::Stop,
    }
}

/// A routed model id bound to the provider client that serves it.
pub(crate) enum RoutedModel<'a> {
    /// A model on Anthropic's native API.
    Anthropic(AnthropicModel<'a>),
    /// A model on the OpenAI-compatible Chat Completions API.
    OpenAiChatCompletions(OpenAiChatCompletionsModel<'a>),
    /// A model on OpenAI's Responses API.
    OpenAiResponses(OpenAiResponsesModel<'a>),
}

impl<'a> RoutedModel<'a> {
    /// Build the rig agent for this model, applying provider-specific thinking
    /// config. Pure construction — no model call is made here.
    pub(crate) fn into_agent(
        self,
        handle: ToolServerHandle,
        system_prompt: &str,
        max_turns: usize,
        max_tokens: u64,
    ) -> ProviderAgent {
        match self {
            RoutedModel::Anthropic(m) => {
                let thinking = m.thinking_params();
                ProviderAgent::Anthropic(Arc::new(build_agent(
                    m.completion(),
                    thinking,
                    handle,
                    system_prompt,
                    max_turns,
                    max_tokens,
                )))
            }
            RoutedModel::OpenAiChatCompletions(m) => {
                let thinking = m.thinking_params();
                ProviderAgent::OpenAiChatCompletions(Arc::new(build_agent(
                    m.completion(),
                    thinking,
                    handle,
                    system_prompt,
                    max_turns,
                    max_tokens,
                )))
            }
            RoutedModel::OpenAiResponses(m) => {
                let thinking = m.thinking_params();
                ProviderAgent::OpenAiResponses(Arc::new(build_agent(
                    m.completion(),
                    thinking,
                    handle,
                    system_prompt,
                    max_turns,
                    max_tokens,
                )))
            }
        }
    }
}

/// A built rig agent bound to the provider serving the session's model.
///
/// The two arms are different concrete `Agent<M>` types; [`run_stream`] hides
/// that behind one concrete [`ChatCompletionStream`], so callers never match.
///
/// [`run_stream`]: ProviderAgent::run_stream
#[derive(Clone)]
pub(crate) enum ProviderAgent {
    /// An agent over Anthropic's native completion model.
    Anthropic(Arc<Agent<anthropic::completion::CompletionModel>>),
    /// An agent over the OpenAI Chat Completions model.
    OpenAiChatCompletions(Arc<Agent<openai::completion::CompletionModel>>),
    /// An agent over the OpenAI Responses model.
    OpenAiResponses(Arc<Agent<openai::responses_api::ResponsesCompletionModel>>),
    /// Ordered server-side retry/fallback sequence.
    Fallback(Arc<[FallbackCandidate]>),
    /// A test-only agent over an arbitrary completion model (e.g. a scripted
    /// fake), type-erased so the enum itself stays non-generic.
    #[cfg(test)]
    Test(Arc<dyn DynStreamAgent>),
}

/// One concrete agent in an ordered fallback sequence.
#[derive(Clone)]
pub(crate) struct FallbackCandidate {
    model: String,
    agent: ProviderAgent,
}

impl ProviderAgent {
    /// Run the agentic loop and adapt rig's stream into the provider-agnostic
    /// [`StreamPart`] stream consumed by DCS. The provider fan-out is internal.
    #[allow(clippy::too_many_arguments)]
    pub(crate) async fn run_stream(
        &self,
        prompt: Message,
        history: Vec<Message>,
        max_turns: usize,
        routing: ToolRouter,
        loaded_buffer: Arc<Mutex<Vec<SearchableTool>>>,
        register_loaded: RegisterFn,
        recorder: Arc<dyn UsageRecorder>,
        usage_ctx: UsageContext,
        model: String,
        request_context: RequestContext,
    ) -> ChatCompletionStream<'static> {
        match self {
            ProviderAgent::Anthropic(agent) => {
                drive_stream(
                    agent,
                    prompt,
                    history,
                    max_turns,
                    routing,
                    loaded_buffer,
                    register_loaded,
                    recorder,
                    usage_ctx,
                    model,
                    request_context.clone(),
                )
                .await
            }
            ProviderAgent::OpenAiChatCompletions(agent) => {
                drive_stream(
                    agent,
                    prompt,
                    history,
                    max_turns,
                    routing,
                    loaded_buffer,
                    register_loaded,
                    recorder,
                    usage_ctx,
                    model,
                    request_context.clone(),
                )
                .await
            }
            ProviderAgent::OpenAiResponses(agent) => {
                drive_stream(
                    agent,
                    prompt,
                    history,
                    max_turns,
                    routing,
                    loaded_buffer,
                    register_loaded,
                    recorder,
                    usage_ctx,
                    model,
                    request_context.clone(),
                )
                .await
            }
            ProviderAgent::Fallback(candidates) => fallback_stream(
                candidates.clone(),
                prompt,
                history,
                max_turns,
                routing,
                loaded_buffer,
                register_loaded,
                recorder,
                usage_ctx,
                request_context,
            ),
            #[cfg(test)]
            ProviderAgent::Test(agent) => {
                agent
                    .run_stream_dyn(
                        prompt,
                        history,
                        max_turns,
                        routing,
                        loaded_buffer,
                        register_loaded,
                        recorder,
                        usage_ctx,
                        model,
                        request_context.clone(),
                    )
                    .await
            }
        }
    }
}

/// Routes model api-id strings to the provider client that serves them.
///
/// Holds native Anthropic and OpenAI Responses clients plus a registry of
/// OpenAI-compatible Chat Completions clients keyed by provider name. The
/// built-in [`OPENAI_PROVIDER`] always uses Responses; register compatible
/// providers with [`with_openai_provider`](Self::with_openai_provider).
#[derive(Clone)]
pub struct ModelRouter {
    anthropic: Arc<anthropic::Client>,
    anthropic_configured: bool,
    openai: Arc<openai::Client>,
    openai_configured: bool,
    openai_compatible: HashMap<String, Arc<openai::CompletionsClient>>,
    fallback_chain: Arc<[String]>,
}

impl ModelRouter {
    /// Build a router over native Anthropic and OpenAI Responses clients, with
    /// no OpenAI-compatible Chat Completions providers registered yet.
    pub fn new(anthropic: anthropic::Client, openai: openai::Client) -> Self {
        Self {
            anthropic: Arc::new(anthropic),
            anthropic_configured: true,
            openai: Arc::new(openai),
            openai_configured: true,
            openai_compatible: HashMap::new(),
            fallback_chain: DEFAULT_ROX_MODEL_CHAIN
                .iter()
                .map(|model| (*model).to_owned())
                .collect::<Vec<_>>()
                .into(),
        }
    }

    /// Build a router with the built-in providers from the environment.
    ///
    /// Requires `ROX_API_KEY`. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and
    /// `CEREBRAS_API_KEY` are optional and only arm their explicitly selected
    /// providers. Rox is the default provider for Conation
    /// (`https://api.rox.one/v1`).
    /// Chain [`with_openai_provider`](Self::with_openai_provider) to add more.
    pub fn try_from_env() -> Result<Self, AgentError> {
        let rox_key = RoxApiKey::new()?;
        let anthropic_key = AnthropicApiKey::new();
        let anthropic_configured = anthropic_key.is_some();
        let anthropic = anthropic::Client::builder()
            .api_key(
                anthropic_key
                    .as_ref()
                    .map(|key| key.as_ref().to_owned())
                    .unwrap_or_else(|| "unconfigured-anthropic-key".to_owned()),
            )
            .build()?;
        // Default base URL is api.openai.com; OpenAI's GPT models use
        // Responses API so reasoning models get max_output_tokens.
        let openai_key = OpenaiApiKey::new();
        let openai_configured = openai_key.is_some();
        let openai = openai::Client::builder()
            .api_key(
                openai_key
                    .as_ref()
                    .map(|key| key.as_ref().to_owned())
                    .unwrap_or_else(|| "unconfigured-openai-key".to_owned()),
            )
            .build()?;
        // Rox speaks the OpenAI Chat Completions API — default for Conation (conation.dev)
        let rox_key = rox_key.to_string();
        let mut with_rox = if rox_key.is_empty() || rox_key == "local-rox-key" {
            // Allow boot without real Rox key — default_model will still route to rox/* ids
            // but calls fail with an authentication error until the deployment
            // provides its server-side ROX_API_KEY.
            Self::new(anthropic, openai).with_openai_provider(
                ROX_PROVIDER,
                ROX_BASE_URL,
                "dummy-rox-key-for-routing",
            )
        } else {
            Self::new(anthropic, openai).with_openai_provider(ROX_PROVIDER, ROX_BASE_URL, &rox_key)
        }?;
        // A missing optional native-provider key must make that route
        // unavailable. Otherwise an explicitly selected model would send the
        // user's prompt to a provider with a dummy credential before failing.
        with_rox.anthropic_configured = anthropic_configured;
        with_rox.openai_configured = openai_configured;
        // Cerebras speaks the OpenAI Chat Completions API, so it rides the
        // compatible-provider registry when explicitly configured.
        let router = match CerebrasApiKey::new() {
            Some(key) => {
                with_rox.with_openai_provider(CEREBRAS_PROVIDER, CEREBRAS_BASE_URL, key.as_ref())?
            }
            None => with_rox,
        };

        match RoxModelFallbackChain::new() {
            Some(raw) => router.with_fallback_chain(parse_fallback_chain(raw.as_ref())?),
            None => Ok(router),
        }
    }

    /// The process-wide full router, built from the environment on first use.
    ///
    /// This is the only router the crate uses — every entry point routes through
    /// the same fully-populated instance, so a model id resolves identically
    /// everywhere. Register additional OpenAI-compatible providers here as they
    /// are added.
    pub(crate) fn shared() -> Result<&'static ModelRouter, AgentError> {
        static ROUTER: OnceLock<ModelRouter> = OnceLock::new();
        if let Some(router) = ROUTER.get() {
            return Ok(router);
        }
        let router = Self::try_from_env()?;
        Ok(ROUTER.get_or_init(|| router))
    }

    /// Register an already-built OpenAI-compatible Chat Completions client under
    /// `provider`.
    pub fn with_openai_client(
        mut self,
        provider: impl Into<String>,
        client: openai::CompletionsClient,
    ) -> Self {
        self.openai_compatible
            .insert(provider.into(), Arc::new(client));
        self
    }

    /// Register an OpenAI-compatible Chat Completions provider from a base URL
    /// and key.
    ///
    /// This is the whole cost of adding a provider — models served by it are
    /// then reachable as `provider/<model-id>`. The extension point for the
    /// open provider set (Cerebras is wired this way in [`try_from_env`]).
    ///
    /// [`try_from_env`]: Self::try_from_env
    pub fn with_openai_provider(
        self,
        provider: impl Into<String>,
        base_url: &str,
        api_key: &str,
    ) -> Result<Self, AgentError> {
        let client = openai::CompletionsClient::builder()
            .api_key(api_key)
            .base_url(base_url)
            .build()?;
        Ok(self.with_openai_client(provider, client))
    }

    /// Override the ordered model sequence used for default Rox requests.
    pub fn with_fallback_chain(mut self, models: Vec<String>) -> Result<Self, AgentError> {
        if models.is_empty() {
            return Err(AgentError::Other(anyhow::anyhow!(
                "Rox fallback chain must contain at least one model"
            )));
        }
        for model in &models {
            Model::try_from(model.as_str())?;
        }
        self.fallback_chain = models.into();
        Ok(self)
    }

    /// Route + build the agent in one step, falling back to the default model on
    /// an unroutable id.
    pub(crate) fn agent(
        &self,
        model: &str,
        handle: ToolServerHandle,
        system_prompt: &str,
        max_turns: usize,
        max_tokens: u64,
    ) -> ProviderAgent {
        let mut candidates = self
            .candidate_model_ids(model)
            .into_iter()
            .filter_map(|model| {
                let routed = self.route(&model).ok()?;
                let prompt = format!(
                    "{system_prompt}\n\nThe model currently serving this request is {model}. \
                     Trust this exact id when identifying yourself."
                );
                Some(FallbackCandidate {
                    model: model.clone(),
                    agent: routed.into_agent(handle.clone(), &prompt, max_turns, max_tokens),
                })
            })
            .collect::<Vec<_>>();

        match candidates.len() {
            0 => self
                .default_model()
                .into_agent(handle, system_prompt, max_turns, max_tokens),
            1 => candidates.pop().expect("one candidate").agent,
            _ => ProviderAgent::Fallback(candidates.into()),
        }
    }

    /// Route a `provider/model` id to the provider that serves it.
    ///
    /// Returns [`AgentError::UnknownModel`] if no provider claims it (and
    /// [`AgentError::MalformedModel`] if the id has no `provider/` segment).
    pub(crate) fn route<'a>(&self, model: &'a str) -> Result<RoutedModel<'a>, AgentError> {
        let parsed = Model::try_from(model)?;

        if parsed.provider() == ANTHROPIC_PROVIDER && self.anthropic_configured {
            return Ok(RoutedModel::Anthropic(AnthropicModel::new(
                parsed,
                self.anthropic.clone(),
            )));
        }
        if parsed.provider() == OPENAI_PROVIDER && self.openai_configured {
            return Ok(RoutedModel::OpenAiResponses(OpenAiResponsesModel::new(
                parsed,
                self.openai.clone(),
            )));
        }
        if let Some(client) = self.openai_compatible.get(parsed.provider()) {
            let client = Arc::clone(client);
            return Ok(RoutedModel::OpenAiChatCompletions(
                OpenAiChatCompletionsModel::new(parsed, client),
            ));
        }
        Err(AgentError::UnknownModel(model.to_string()))
    }

    /// Ordered ids to try for `requested`.
    pub(crate) fn candidate_model_ids(&self, requested: &str) -> Vec<String> {
        if let Some(position) = self
            .fallback_chain
            .iter()
            .position(|candidate| candidate == requested)
        {
            return self.fallback_chain[position..].to_vec();
        }
        if self.route(requested).is_ok() {
            return vec![requested.to_owned()];
        }
        self.fallback_chain.to_vec()
    }

    /// The fallback model: Conation default — Rox Gemini 2.5 Flash.
    /// Falls back to Anthropic Smart if Rox not registered (e.g. missing key).
    fn default_model(&self) -> RoutedModel<'static> {
        // Try Rox first — the Conation default.
        if let Some(client) = self.openai_compatible.get(ROX_PROVIDER) {
            let client = Arc::clone(client);
            // Parse DEFAULT_ROX_MODEL via Model::try_from to get bare id
            if let Ok(parsed) = Model::try_from(DEFAULT_ROX_MODEL) {
                return RoutedModel::OpenAiChatCompletions(OpenAiChatCompletionsModel::new(
                    parsed, client,
                ));
            }
        }
        // Fallback to Anthropic Smart
        RoutedModel::Anthropic(AnthropicModel::new(
            PredefinedModel::Smart.into(),
            self.anthropic.clone(),
        ))
    }
}

fn parse_fallback_chain(raw: &str) -> Result<Vec<String>, AgentError> {
    let models = raw
        .split(',')
        .map(str::trim)
        .filter(|model| !model.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if models.is_empty() {
        return Err(AgentError::Other(anyhow::anyhow!(
            "ROX_MODEL_FALLBACK_CHAIN must contain comma-separated provider/model ids"
        )));
    }
    for model in &models {
        Model::try_from(model.as_str())?;
    }
    Ok(models)
}

pub(crate) const MAX_SAME_MODEL_RETRIES: usize = 1;

/// Consume candidates in order, retrying only before any observable output.
#[allow(clippy::too_many_arguments)]
fn fallback_stream(
    candidates: Arc<[FallbackCandidate]>,
    prompt: Message,
    history: Vec<Message>,
    max_turns: usize,
    routing: ToolRouter,
    loaded_buffer: Arc<Mutex<Vec<SearchableTool>>>,
    register_loaded: RegisterFn,
    recorder: Arc<dyn UsageRecorder>,
    usage_ctx: UsageContext,
    request_context: RequestContext,
) -> ChatCompletionStream<'static> {
    Box::pin(async_stream::stream! {
        let mut final_error = None;

        for candidate in candidates.iter() {
            let mut retries = 0;
            'attempt: loop {
                let mut stream = candidate
                    .agent
                    .run_stream(
                        prompt.clone(),
                        history.clone(),
                        max_turns,
                        routing.clone(),
                        loaded_buffer.clone(),
                        register_loaded.clone(),
                        recorder.clone(),
                        usage_ctx.clone(),
                        candidate.model.clone(),
                        request_context.clone(),
                    )
                    .await;
                let mut emitted = false;

                while let Some(item) = stream.next().await {
                    match item {
                        Ok(part) => {
                            emitted = true;
                            yield Ok(part);
                        }
                        Err(error) if emitted => {
                            yield Err(error);
                            return;
                        }
                        Err(error) => {
                            let disposition = classify_failure(&error);
                            tracing::warn!(
                                model = %candidate.model,
                                ?disposition,
                                "model failed before producing output"
                            );
                            final_error = Some(error);
                            match disposition {
                                FailureDisposition::RetryThenFallback
                                    if retries < MAX_SAME_MODEL_RETRIES =>
                                {
                                    retries += 1;
                                    continue 'attempt;
                                }
                                FailureDisposition::RetryThenFallback
                                | FailureDisposition::Fallback => break 'attempt,
                                FailureDisposition::Stop => {
                                    yield Err(final_error.take().expect("failure was recorded"));
                                    return;
                                }
                            }
                        }
                    }
                }

                // A normally exhausted stream is success, even if the provider
                // returned no content. Never invent a retry without an error.
                return;
            }
        }

        if let Some(error) = final_error {
            yield Err(error);
        }
    })
}

/// Build a rig agent from a completion model and per-session config.
fn build_agent<M: CompletionModel>(
    model: M,
    thinking: Option<serde_json::Value>,
    handle: ToolServerHandle,
    system_prompt: &str,
    max_turns: usize,
    max_tokens: u64,
) -> Agent<M> {
    let mut builder = AgentBuilder::new(model)
        .tool_server_handle(handle)
        .default_max_turns(max_turns)
        .max_tokens(max_tokens)
        .preamble(system_prompt);
    if let Some(params) = thinking {
        builder = builder.additional_params(params);
    }
    builder.build()
}

/// Run the agentic loop on `agent` and adapt rig's stream into the
/// provider-agnostic [`StreamPart`] stream consumed by DCS.
#[allow(clippy::too_many_arguments)]
async fn drive_stream<M>(
    agent: &Agent<M>,
    prompt: Message,
    history: Vec<Message>,
    max_turns: usize,
    routing: ToolRouter,
    loaded_buffer: Arc<Mutex<Vec<SearchableTool>>>,
    register_loaded: RegisterFn,
    recorder: Arc<dyn UsageRecorder>,
    usage_ctx: UsageContext,
    model: String,
    request_context: RequestContext,
) -> ChatCompletionStream<'static>
where
    M: CompletionModel + 'static,
    M::StreamingResponse: GetTokenUsage + Send + Sync,
{
    let (bridge, mut rx) = StreamBridge::channel(
        routing,
        loaded_buffer,
        register_loaded,
        request_context.searchable_tools.clone(),
        request_context.cancel.clone(),
    );
    // Driver-side sender for parts derived from rig stream items (thinking,
    // usage, errors). The lifecycle hooks (text, tool call, tool response) send
    // through their own clone inside `bridge`; both feed the same FIFO channel.
    let driver_tx = bridge.sender();

    let mut rig_stream = agent
        .stream_prompt(prompt)
        .history(history)
        .max_turns(max_turns)
        .max_invalid_tool_call_retries(crate::hook::MAX_INVALID_TOOL_CALL_RETRIES)
        .add_hook(bridge)
        .await;

    // Drive the rig stream on its own task. The hook emits a tool call the
    // moment the model finishes it — *before* the (often slow) tool executes —
    // but rig runs that execution inside a single `rig_stream.next()` poll, so
    // draining the channel only between polls would hold the pending tool call
    // hidden until its response landed. Polling the rig stream here, off the
    // consumer's path, lets every hook-emitted part flow through `rx` and out
    // to the client as soon as it is produced — so a tool call renders in its
    // pending state immediately and its response renders when execution
    // finishes.
    let driver = tokio::spawn(async move {
        let mut thinking_buf = String::new();

        while let Some(item) = rig_stream.next().await {
            match item {
                Ok(MultiTurnStreamItem::StreamAssistantItem(
                    StreamedAssistantContent::ReasoningDelta { reasoning, .. },
                )) => {
                    thinking_buf.push_str(&reasoning);
                }
                other => {
                    if !thinking_buf.is_empty() {
                        let _ = driver_tx
                            .send(Ok(StreamPart::Thinking(std::mem::take(&mut thinking_buf))));
                    }
                    match other {
                        Ok(MultiTurnStreamItem::FinalResponse(final_resp)) => {
                            let usage = final_resp.usage;
                            // Best-effort cost logging; never fails the stream.
                            recorder.record(usage_ctx.clone().into_event(
                                model.clone(),
                                usage.input_tokens,
                                usage.output_tokens,
                            ));
                            let _ = driver_tx.send(Ok(StreamPart::Usage(crate::stream::Usage {
                                input_tokens: usage.input_tokens,
                                output_tokens: usage.output_tokens,
                            })));
                        }
                        Err(e) => {
                            let _ = driver_tx.send(Err(AgentError::Streaming(e)));
                        }
                        _ => {}
                    }
                }
            }
        }
        if !thinking_buf.is_empty() {
            let _ = driver_tx.send(Ok(StreamPart::Thinking(std::mem::take(&mut thinking_buf))));
        }
        // Dropping `rig_stream` (and with it the hook's sender) plus `driver_tx`
        // here closes the channel, ending the consumer stream below.
    });

    // Abort the driver when the consumer drops the returned stream (e.g. on
    // cancellation), which drops `rig_stream` and cancels any in-flight tool —
    // matching the prior behaviour where the rig stream lived inline.
    struct AbortOnDrop(tokio::task::JoinHandle<()>);
    impl Drop for AbortOnDrop {
        fn drop(&mut self) {
            self.0.abort();
        }
    }
    let guard = AbortOnDrop(driver);

    let stream = async_stream::stream! {
        let _guard = guard;
        while let Some(part) = rx.recv().await {
            yield part;
        }
    };

    Box::pin(stream)
}

/// Test-only type erasure so [`ProviderAgent`] can hold an arbitrary
/// [`Agent<M>`] (e.g. a scripted fake model) without the enum becoming generic.
/// Mirrors the production arms: it just drives [`drive_stream`].
#[cfg(test)]
pub(crate) trait DynStreamAgent: Send + Sync {
    #[allow(clippy::too_many_arguments)]
    fn run_stream_dyn<'a>(
        &'a self,
        prompt: Message,
        history: Vec<Message>,
        max_turns: usize,
        routing: ToolRouter,
        loaded_buffer: Arc<Mutex<Vec<SearchableTool>>>,
        register_loaded: RegisterFn,
        recorder: Arc<dyn UsageRecorder>,
        usage_ctx: UsageContext,
        model: String,
        request_context: RequestContext,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = ChatCompletionStream<'static>> + Send + 'a>,
    >;
}

#[cfg(test)]
impl<M> DynStreamAgent for Agent<M>
where
    M: CompletionModel + 'static,
    M::StreamingResponse: GetTokenUsage + Send + Sync,
{
    fn run_stream_dyn<'a>(
        &'a self,
        prompt: Message,
        history: Vec<Message>,
        max_turns: usize,
        routing: ToolRouter,
        loaded_buffer: Arc<Mutex<Vec<SearchableTool>>>,
        register_loaded: RegisterFn,
        recorder: Arc<dyn UsageRecorder>,
        usage_ctx: UsageContext,
        model: String,
        request_context: RequestContext,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = ChatCompletionStream<'static>> + Send + 'a>,
    > {
        Box::pin(drive_stream(
            self,
            prompt,
            history,
            max_turns,
            routing,
            loaded_buffer,
            register_loaded,
            recorder,
            usage_ctx,
            model,
            request_context,
        ))
    }
}

#[cfg(test)]
impl ProviderAgent {
    /// Build a test-only [`ProviderAgent`] backed by `model` (a fake completion
    /// model), wired through the same [`build_agent`] used in production.
    pub(crate) fn test<M>(
        model: M,
        system_prompt: &str,
        max_turns: usize,
        max_tokens: u64,
        handle: ToolServerHandle,
    ) -> Self
    where
        M: CompletionModel + 'static,
        M::StreamingResponse: GetTokenUsage + Send + Sync,
    {
        ProviderAgent::Test(Arc::new(build_agent(
            model,
            None,
            handle,
            system_prompt,
            max_turns,
            max_tokens,
        )))
    }
}
