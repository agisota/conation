//! One-shot completion — send a prompt and get a string response.
//!
//! This is the non-streaming API layer: routing only resolves a model, and the
//! actual prompting lives here.
use crate::error::AgentError;
use crate::model::router::{
    FailureDisposition, MAX_SAME_MODEL_RETRIES, ModelRouter, RoutedModel, classify_failure,
};
use ai_usage::{UsageContext, UsageRecorder};
use rig_agent::agent::{AgentBuilder, PromptResponse};
use rig_agent::completion::Prompt;
use rig_core::completion::CompletionModel;
use rig_core::message::Message;

const ONE_SHOT_MAX_TOKENS: u64 = 16_000;

/// Send a system prompt + user message and return the model's text response.
///
/// This is the simple, non-streaming path for one-shot tasks like
/// summarization. `model` is anything stringifiable to an api id — an
/// [`AgentModel`](crate::AgentModel) or a raw string from the frontend.
///
/// Token usage is recorded against `ctx` via `recorder` once the completion
/// returns. Recording is best-effort and never affects the result.
#[tracing::instrument(skip(model, system_prompt, user_message, recorder, ctx), err)]
pub async fn complete<M: ToString>(
    model: M,
    system_prompt: &str,
    user_message: &str,
    recorder: &dyn UsageRecorder,
    ctx: UsageContext,
) -> anyhow::Result<String> {
    let requested_model = model.to_string();
    let router = ModelRouter::shared()?;
    let mut final_error = None;

    for candidate in router.candidate_model_ids(&requested_model) {
        let mut retries = 0;
        loop {
            let response = match router.route(&candidate) {
                Ok(RoutedModel::Anthropic(m)) => {
                    prompt_once(m.completion(), system_prompt, user_message).await
                }
                Ok(RoutedModel::OpenAiChatCompletions(m)) => {
                    prompt_once(m.completion(), system_prompt, user_message).await
                }
                Ok(RoutedModel::OpenAiResponses(m)) => {
                    prompt_once(m.completion(), system_prompt, user_message).await
                }
                Err(error) => Err(error),
            };

            match response {
                Ok(response) => {
                    record(recorder, ctx, candidate, &response);
                    return Ok(response.output);
                }
                Err(error) => {
                    let disposition = classify_failure(&error);
                    tracing::warn!(
                        model = %candidate,
                        ?disposition,
                        "one-shot model failed before producing output"
                    );
                    final_error = Some(error);
                    match disposition {
                        FailureDisposition::RetryThenFallback
                            if retries < MAX_SAME_MODEL_RETRIES =>
                        {
                            retries += 1;
                        }
                        FailureDisposition::RetryThenFallback | FailureDisposition::Fallback => {
                            break;
                        }
                        FailureDisposition::Stop => {
                            return Err(final_error.take().expect("failure was recorded").into());
                        }
                    }
                }
            }
        }
    }

    Err(final_error
        .unwrap_or_else(|| AgentError::UnknownModel(requested_model))
        .into())
}

/// Send a system prompt + conversation history and return the model's text
/// response.
///
/// Usage is recorded against `ctx` via `recorder`, as in [`complete`].
#[tracing::instrument(skip(model, system_prompt, messages, recorder, ctx), err)]
pub async fn complete_with_history<M: ToString>(
    model: M,
    system_prompt: &str,
    messages: Vec<Message>,
    recorder: &dyn UsageRecorder,
    ctx: UsageContext,
) -> anyhow::Result<String> {
    let requested_model = model.to_string();
    let router = ModelRouter::shared()?;
    let mut final_error = None;

    for candidate in router.candidate_model_ids(&requested_model) {
        let mut retries = 0;
        loop {
            let response = match router.route(&candidate) {
                Ok(RoutedModel::Anthropic(m)) => {
                    prompt_with_history(m.completion(), system_prompt, messages.clone()).await
                }
                Ok(RoutedModel::OpenAiChatCompletions(m)) => {
                    prompt_with_history(m.completion(), system_prompt, messages.clone()).await
                }
                Ok(RoutedModel::OpenAiResponses(m)) => {
                    prompt_with_history(m.completion(), system_prompt, messages.clone()).await
                }
                Err(error) => Err(error),
            };

            match response {
                Ok(response) => {
                    record(recorder, ctx, candidate, &response);
                    return Ok(response.output);
                }
                Err(error) => {
                    let disposition = classify_failure(&error);
                    tracing::warn!(
                        model = %candidate,
                        ?disposition,
                        "one-shot history model failed before producing output"
                    );
                    final_error = Some(error);
                    match disposition {
                        FailureDisposition::RetryThenFallback
                            if retries < MAX_SAME_MODEL_RETRIES =>
                        {
                            retries += 1;
                        }
                        FailureDisposition::RetryThenFallback | FailureDisposition::Fallback => {
                            break;
                        }
                        FailureDisposition::Stop => {
                            return Err(final_error.take().expect("failure was recorded").into());
                        }
                    }
                }
            }
        }
    }

    Err(final_error
        .unwrap_or_else(|| AgentError::UnknownModel(requested_model))
        .into())
}

/// Record the usage of a one-shot completion.
fn record(
    recorder: &dyn UsageRecorder,
    ctx: UsageContext,
    model: String,
    response: &PromptResponse,
) {
    recorder.record(ctx.into_event(
        model,
        response.usage.input_tokens,
        response.usage.output_tokens,
    ));
}

/// Build a toolless agent and prompt it with a single user message.
async fn prompt_once<M: CompletionModel + 'static>(
    completion_model: M,
    system_prompt: &str,
    user_message: &str,
) -> Result<PromptResponse, AgentError> {
    let agent = AgentBuilder::new(completion_model)
        .preamble(system_prompt)
        .max_tokens(ONE_SHOT_MAX_TOKENS)
        .build();

    Ok(agent.prompt(user_message).extended_details().await?)
}

/// Build a toolless agent and prompt it with the last message of `messages`,
/// using the rest as history.
async fn prompt_with_history<M: CompletionModel + 'static>(
    completion_model: M,
    system_prompt: &str,
    messages: Vec<Message>,
) -> Result<PromptResponse, AgentError> {
    let agent = AgentBuilder::new(completion_model)
        .preamble(system_prompt)
        .max_tokens(ONE_SHOT_MAX_TOKENS)
        .build();

    let Some((prompt, history)) = messages.split_last() else {
        return Err(AgentError::Other(anyhow::anyhow!(
            "messages must not be empty"
        )));
    };

    Ok(agent
        .prompt(prompt.clone())
        .extended_details()
        .history(history.to_vec())
        .await?)
}
