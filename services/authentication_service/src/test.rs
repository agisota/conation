use macro_env::Environment;
use remote_env_var::NullSecretManager;

use super::resolve_stripe_webhook_secret;

#[tokio::test]
async fn disabled_stripe_does_not_resolve_a_webhook_secret() {
    let secret = resolve_stripe_webhook_secret(&NullSecretManager, Environment::Production, false)
        .await
        .unwrap();

    assert!(secret.is_none());
}
