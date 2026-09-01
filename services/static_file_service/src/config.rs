use anyhow::Context;
use conation_auth::InternalApiKey;
pub use conation_env::Environment;
use conation_env_var::env_vars;
use conation_service_urls::StaticFileServiceUrl;

env_vars! {
    pub struct StaticFileServiceDynamodbTableName;
    pub struct StaticStorageBucket;
}

#[derive(conation_config::MacroConfig)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub struct Config {
    /// self explanatory
    #[conation_config_default(Environment::new_or_prod())]
    pub environment: Environment,
    /// port (8080)
    #[conation_config_default(8080)]
    pub port: usize,
    /// the tablename of the metadata table
    pub static_file_service_dynamodb_table_name: StaticFileServiceDynamodbTableName,
    /// s3 storage bucket
    pub static_storage_bucket: StaticStorageBucket,
    /// service url
    #[conation_config_default(StaticFileServiceUrl::unwrap_new().to_string())]
    pub static_file_service_url: String,
    /// Internal API key
    pub internal_api_key: InternalApiKey,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        conation_config::ConfigLoader::load::<Config>()
            .context("failed to load static file service config")
    }
}
