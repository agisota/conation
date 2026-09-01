use axum::extract::FromRef;
use conation_env::Environment;

use crate::http_safety::SsrfSafeHttpClient;

#[derive(Clone, FromRef)]
pub struct ApiContext {
    pub environment: Environment,
    pub http_client: SsrfSafeHttpClient,
}
