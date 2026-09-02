use crate::api::context::ApiContext;
use axum::{Router, routing::post};

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

    if stripe_enabled {
        router.route("/stripe", post(stripe_webhook::handler))
    } else {
        router
    }
}
