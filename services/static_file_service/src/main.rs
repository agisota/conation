#![recursion_limit = "256"]
use anyhow::Context;
use conation_auth::middleware::decode_jwt::JwtValidationArgs;
use conation_entrypoint::MacroEntrypoint;

mod api;
mod config;
mod model;
mod service;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    MacroEntrypoint::default().init();

    let aws_config = conation_aws_config::get_conation_aws_config().await;
    let secretsmanager_client = secretsmanager_client::SecretsManager::new(
        aws_sdk_secretsmanager::Client::new(&aws_config),
    );

    let config = config::Config::from_env().context("missing environment variables")?;

    let jwt_validation_args =
        JwtValidationArgs::new_with_secret_manager(config.environment, &secretsmanager_client)
            .await?;

    api::setup_and_serve(config, jwt_validation_args).await?;
    Ok(())
}
