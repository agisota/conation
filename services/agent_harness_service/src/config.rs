//! Configuration for the agent harness service, loaded via the standard
//! `conation_config` pattern.

use anyhow::Context;
pub use conation_env::Environment;
use conation_uuid::Uuid;
use database_env_vars::DatabaseUrl;

use secretsmanager_client::LocalOrRemoteSecret;

conation_env_var::env_vars!(
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
    /// The environment we are in.
    #[conation_config_default(Environment::new_or_prod())]
    pub environment: Environment,
    /// Comma-separated Kafka bootstrap servers.
    pub kafka_brokers: KafkaBrokers,
    /// MacroDB connection string; `agent_sessions` lives here.
    pub database_url: DatabaseUrl,
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
    /// Repository sessions run against, until it becomes per-request data.
    #[conation_config_default(String::from("https://github.com/agisota/conation"))]
    pub harness_repo_url: String,
    /// Repository `@cursor` sessions work on. Temporary hardcoding, same as
    /// `harness_repo_url` — and one repository for everyone is a real limit
    /// here, since each session runs on its own owner's Cursor account and
    /// only works if *their* GitHub App installation can see this repo.
    #[conation_config_default(String::from("https://github.com/agisota/conation"))]
    pub cursor_repo_url: String,
    /// Model id stamped onto sessions the in-memory bot opens. Unknown ids
    /// fall back to the agent loop's default model.
    #[conation_config_default(String::from("claude-sonnet-5"))]
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
    /// separable at the network as well as in the code.
    #[conation_config_default(8102)]
    pub egress_port: u16,
    /// Where a sandbox should dial the egress proxy.
    ///
    /// Not derivable from `egress_port`: the sandbox reaches this through
    /// whatever ingress fronts the deployment, not on the container's own port.
    pub egress_base_url: String,
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
    /// Client id of the GitHub App installation tokens are minted for.
    pub github_sync_app_client_id: String,
    /// PEM private key of that App.
    pub github_sync_app_pem_secret_key: LocalOrRemoteSecret<GithubSyncAppPemSecretKey>,
}

impl Config {
    /// Load the configuration from the environment.
    pub fn from_env() -> anyhow::Result<Self> {
        conation_config::ConfigLoader::load::<Config>()
            .context("failed to load agent harness service config")
    }
}
