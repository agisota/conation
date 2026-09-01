use anyhow::Context;
use conation_auth::InternalApiKey;

pub use conation_env::Environment;

/// The configuration parameters for the application.
#[derive(conation_config::MacroConfig)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub struct Config {
    /// The port to listen on.
    #[conation_config_default(8080)]
    pub port: usize,
    /// The environment we are in.
    #[conation_config_default(Environment::new_or_prod())]
    pub environment: Environment,
    /// The internal API key used to authorize service requests.
    pub internal_api_key: InternalApiKey,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        conation_config::ConfigLoader::load::<Config>()
            .context("failed to load image proxy service config")
    }
}
