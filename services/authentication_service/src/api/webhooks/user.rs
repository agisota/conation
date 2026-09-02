use crate::api::context::ApiContext;
use axum::{
    Router,
    routing::{MethodRouter, post},
};

mod create_user_webhook;
mod delete_user_webhook;
mod populate_jwt;
mod stripe_webhook;
mod update_name;

pub fn router(stripe_enabled: bool) -> Router<ApiContext> {
    let router = Router::new()
        .route("/", post(create_user_webhook::handler))
        .route("/delete", post(delete_user_webhook::handler))
        .route("/jwt", post(populate_jwt::handler))
        .route("/name", post(update_name::handler));

    with_stripe_webhook_route(router, stripe_enabled, post(stripe_webhook::handler))
}

fn with_stripe_webhook_route<S>(
    router: Router<S>,
    stripe_enabled: bool,
    stripe_webhook: MethodRouter<S>,
) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    if stripe_enabled {
        router.route("/stripe", stripe_webhook)
    } else {
        router
    }
}

#[cfg(test)]
mod test;
