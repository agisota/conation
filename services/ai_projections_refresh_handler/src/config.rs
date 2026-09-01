use anyhow::Context;
use conation_env_var::env_vars;

env_vars! {
    pub struct DatabaseUrl;
}

#[derive(conation_config::MacroConfig)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub struct Config {
    /// The connection URL for the Postgres database this application should use.
    pub database_url: DatabaseUrl,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        conation_config::ConfigLoader::load::<Config>().context("failed to load config")
    }
}
