//! Configuration for the agent harness service, loaded via the standard
//! `conation_config` pattern so it gets a `doppler_config` validation binary.
//!
//! Required env vars are declared here as typed fields. The `doppler_config`
//! binary loads this `Config` from Doppler for both the dev and prod
//! environments, surfacing any missing or mistyped values at CI time.

use anyhow::Context;
use database_env_vars::{DatabaseUrl, RedisUri};
pub use conation_env::Environment;
use macro_uuid::Uuid;

use secretsmanager_client::LocalOrRemoteSecret;

macro_env_var::env_vars!(
    /// Comma-separated Kafka bootstrap servers.
    #[derive(Clone)]
    pub struct KafkaBrokers;
    /// PEM private key of the GitHub App installation tokens are minted with.
    pub struct GithubSyncAppPemSecretKey;
    /// RSA key Conation API tokens are signed with - the same one
    /// `authentication_service` signs with. The egress proxy mints
    /// short-lived tokens for session owners inline.
    pub struct ConationApiTokenPrivateSecretKey;
    /// Issuer stamped into minted Conation API tokens; must match what the
    /// validators expect.
    pub struct ConationApiTokenIssuer;
    /// OAuth client ID for the Pipedream API. The same credentials
    /// `document_cognition_service` uses: the connections a sandbox spends
    /// are the ones the person connected in Conation, in the same rows.
    pub struct PipedreamClientId;
    /// OAuth client secret for the Pipedream API.
    pub struct PipedreamClientSecret;
    /// The Pipedream Connect project ID (`proj_...`).
    pub struct PipedreamProjectId;
);

macro_env_var::maybe_env_vars!(
    /// KMS key for encrypted per-owner Claude OAuth connections.
    pub struct ClaudeOauthKmsKeyId;
    /// Dedicated KMS key for encrypted per-owner Codex OAuth state.
    pub struct CodexOauthKmsKeyId;
);

/// The Pipedream project environment matching this deployment: production in
/// prd, development everywhere else.
fn default_pipedream_environment() -> String {
    match Environment::new_or_prod() {
        Environment::Production => "production".to_owned(),
        _ => "development".to_owned(),
    }
}

/// The configuration parameters for the agent harness service.
#[derive(conation_config::MacroConfig)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub struct Config {
    /// OAuth encryption key; deployments without a key do not advertise sign-in.
    pub claude_oauth_kms_key_id: ClaudeOauthKmsKeyId,
    /// The environment we are in.
    #[conation_config_default(Environment::new_or_prod())]
    pub environment: Environment,
    /// Dedicated OAuth encryption key; absent deployments keep Codex unavailable.
    pub codex_oauth_kms_key_id: CodexOauthKmsKeyId,
    /// Comma-separated Kafka bootstrap servers.
    pub kafka_brokers: KafkaBrokers,
    /// Which committed-post topic feeds the in-process trigger: `messages`
    /// (the default, channel and document posts) or `channels` (the
    /// pre-parent channel event, kept until its producer retires it). Never
    /// both: every channel post is on both topics, so both would evaluate
    /// each mention twice.
    #[conation_config_default(agent_trigger::domain::sources::TriggerEventSource::default())]
    pub agent_trigger_event_source: agent_trigger::domain::sources::TriggerEventSource,
    /// MacroDB connection string; `agent_sessions` lives here.
    pub database_url: DatabaseUrl,
    /// Shared Redis used for cross-replica command forwarding.
    pub redis_uri: RedisUri,
    /// Base URL of the Daytona REST API.
    #[conation_config_default(String::from("https://app.daytona.io/api"))]
    pub daytona_api_url: String,
    /// API key the Daytona client authenticates with. Empty means the
    /// managed (sandbox-provisioning) path is unarmed: external sessions
    /// still work, and a managed spawn fails loudly at spawn time.
    #[conation_config_default(String::new())]
    pub daytona_api_key: String,
    /// Name of the prebuilt Daytona snapshot to create sandboxes from. The
    /// image is expected to be built and pushed as a snapshot out of band,
    /// keeping image builds off the first-prompt critical path.
    #[conation_config_default(String::from("conation-agent-harness"))]
    pub daytona_snapshot: String,
    /// Deployment-owned API key for Conation's OpenAI-compatible OmniRoute.
    /// It is stamped only by the session-token-authenticated egress listener;
    /// it is never injected into a sandbox. Empty leaves managed sessions
    /// unable to prompt while external sessions still work.
    #[conation_config_default(String::new())]
    pub rox_api_key: String,
    /// HTTPS origin of Conation's OmniRoute deployment.
    /// The fixed `/v1/chat/completions` path is appended by the egress adapter;
    /// this is configuration, never sandbox input.
    #[conation_config_default(String::from("https://api.rox.one"))]
    pub rox_api_base_url: String,
    /// Run sandboxes on the local Docker daemon instead of Daytona.
    ///
    /// Default off: a deployed harness must keep using Daytona even if this
    /// binary is started with a copied local env file. `just run_local` sets
    /// it. Refused at boot unless `ENVIRONMENT=local`, because this path
    /// drives the host Docker daemon over a mounted socket.
    #[conation_config_default(false)]
    pub dev_dangerous_local_containers: bool,
    /// `docker`-compatible binary the local provider drives.
    #[conation_config_default(String::from("docker"))]
    pub local_container_docker_binary: String,
    /// Image the local provider creates sandboxes from.
    #[conation_config_default(String::from("conation-agent-harness:latest"))]
    pub local_container_image: String,
    /// Compose network local sandboxes join so this service can dial them.
    ///
    /// Required when `dev_dangerous_local_containers` is on: the harness is
    /// itself a container, so the address that works is one on a network both
    /// share. `just run_local` sets `{project}_services`.
    #[conation_config_default(String::new())]
    pub local_container_network: String,
    /// The bot this deployment answers for.
    ///
    /// Still configuration, because `@claude` and `@codex` are separate
    /// deployments of this same binary distinguished only by the bot they
    /// watch for, and those are user-owned bots with rows.
    ///
    /// Deliberately required, with no default. A default here would be the
    /// same silent-misconfiguration trap this binary already fell into once:
    /// a per-bot deployment that failed to set it would not fail, it would
    /// quietly become a second deployment of whatever the default was, split
    /// the shared consumer group with the real one, and answer half its
    /// mentions.
    pub harness_bot_id: Uuid,
    /// Model slug stamped onto sessions this deployment opens.
    #[conation_config_default(String::from("rox/gemini-2.5-flash"))]
    pub harness_model: String,
    /// Harness slug stamped onto sessions this deployment opens.
    #[conation_config_default(String::from("opencode"))]
    pub harness_slug: String,
    /// Repository a session clones when the request itself did not name one.
    ///
    /// Deliberately default-empty. A hardcoded repository here would force
    /// every team onto the same clone (this used to silently be Conation's
    /// own). Spawn must fail with an explicit error when neither the request
    /// nor this value names a repository.
    #[conation_config_default(String::new())]
    pub harness_repo_url: String,
    /// Repository `@cursor` sessions work on when the request did not name one.
    ///
    /// Same rule as `harness_repo_url`: no shared default. Each session runs
    /// on its owner's Cursor account and only works if their GitHub App
    /// installation can see the named repo.
    #[conation_config_default(String::new())]
    pub cursor_repo_url: String,
    /// Model id stamped onto sessions the in-memory bot opens. Unknown ids
    /// fall back to the agent loop's default model.
    #[conation_config_default(String::from("rox/gemini-2.5-flash"))]
    pub inmem_model: String,
    /// Harness slug stamped onto sessions the in-memory bot opens.
    #[conation_config_default(String::from("conation-inmem"))]
    pub inmem_harness_slug: String,
    /// Key for internal service-to-service calls (the connection gateway).
    pub internal_api_key: String,
    /// Port the control routes are served on.
    #[conation_config_default(8101)]
    pub port: u16,
    /// Port the sandbox-facing egress proxy is served on.
    ///
    /// A second listener rather than more routes on `port`: the control routes
    /// are authenticated as Conation users and reached from inside the platform,
    /// and the egress routes are authenticated by session token and reached
    /// from a sandbox running model-authored code. Separate ports keep the two
    /// separable at the network as well as in the code. The shared gateway
    /// forwards `/agent-harness-egress/*` to this listener. The egress router
    /// reads sandbox session tokens from `Authorization`.
    #[conation_config_default(8102)]
    pub egress_port: u16,
    /// OAuth client ID for the Pipedream API.
    pub pipedream_client_id: PipedreamClientId,
    /// OAuth client secret for the Pipedream API.
    pub pipedream_client_secret: PipedreamClientSecret,
    /// The Pipedream Connect project ID.
    pub pipedream_project_id: PipedreamProjectId,
    /// The Pipedream project environment (`development` or `production`).
    #[conation_config_default(default_pipedream_environment())]
    pub pipedream_environment: String,
    /// Base URL of the Pipedream API.
    #[conation_config_default(String::from(pipedream_mcp::outbound::api::DEFAULT_API_URL))]
    pub pipedream_api_url: String,
    /// URL of Pipedream's remote MCP server.
    #[conation_config_default(String::from(pipedream_mcp::outbound::api::DEFAULT_MCP_URL))]
    pub pipedream_mcp_url: String,
    /// Where the egress proxy reaches Conation's own MCP server (`mcp_service`),
    /// endpoint path included - e.g. `https://mcp.conation.dev/mcp`, or the
    /// in-network `http://mcp-service:8080/mcp` on a local stack. Cleartext is
    /// refused at boot unless `ENVIRONMENT=local`.
    pub conation_mcp_url: String,
    /// RSA key Conation API tokens are signed with.
    pub conation_api_token_private_secret_key:
        LocalOrRemoteSecret<ConationApiTokenPrivateSecretKey>,
    /// Issuer stamped into minted Conation API tokens.
    pub conation_api_token_issuer: ConationApiTokenIssuer,
    /// S3 bucket the Changes pane's patches are stored in, one object per
    /// capture under `agent-sessions/{session}/changes/`. Required: a
    /// harness that cannot store a patch cannot show a session's changes,
    /// and that is worth failing at boot rather than on the first capture.
    pub agent_session_changes_bucket: String,
    /// Client id of the GitHub App installation tokens are minted for.
    pub github_sync_app_client_id: String,
    /// PEM private key of that App.
    pub github_sync_app_pem_secret_key: LocalOrRemoteSecret<GithubSyncAppPemSecretKey>,
}

impl Config {
    /// Resolve the deployment-injected encryption key. Local stacks use their
    /// existing LocalStack key with a separate Claude encryption context.
    pub fn claude_oauth_kms_key_id(&self) -> Option<String> {
        self.claude_oauth_kms_key_id
            .value()
            .filter(|key| !key.trim().is_empty())
            .map(str::to_owned)
            .or_else(|| {
                ClaudeOauthKmsKeyId::new().and_then(|key| {
                    key.value()
                        .filter(|key| !key.trim().is_empty())
                        .map(str::to_owned)
                })
            })
            .or_else(|| {
                matches!(self.environment, Environment::Local)
                    .then(|| "alias/macro-local-cursor-api-key".to_owned())
            })
    }

    /// Resolve the optional key from Doppler or the deployment-injected environment.
    pub fn codex_oauth_kms_key_id(&self) -> Option<String> {
        self.codex_oauth_kms_key_id
            .value()
            .map(str::to_owned)
            .or_else(|| {
                CodexOauthKmsKeyId::new().and_then(|value| value.value().map(str::to_owned))
            })
            .filter(|value| !value.trim().is_empty())
    }

    /// Load the configuration from the environment.
    pub fn from_env() -> anyhow::Result<Self> {
        conation_config::ConfigLoader::load::<Config>()
            .context("failed to load agent harness service config")
    }

    /// Repository stamped onto managed sessions.
    ///
    /// Empty when unset so spawn fails instead of cloning a shared default
    /// such as Conation's own repository. External sessions that name a
    /// repository on the request are unaffected.
    pub fn harness_repo_for_spawn(&self) -> String {
        self.harness_repo_url.trim().to_owned()
    }

    /// Repository `@cursor` sessions work on.
    ///
    /// Fails with an explicit error when unset: there is no shared default,
    /// and the Cursor manager requires a URL at construction. Never
    /// substitutes Conation's own repository.
    pub fn cursor_repo_for_spawn(&self) -> anyhow::Result<&str> {
        let url = self.cursor_repo_url.trim();
        if url.is_empty() {
            anyhow::bail!(
                "CURSOR_REPO_URL is unset: @cursor spawn requires a repository URL; refusing to default to a shared repository"
            );
        }
        Ok(url)
    }
}
