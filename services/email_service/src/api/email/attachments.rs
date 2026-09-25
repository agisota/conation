use axum::Router;
use axum::routing::get;

pub(crate) mod get;
pub(crate) mod get_document_id;

pub fn router() -> Router<crate::api::ApiContext> {
    Router::new()
        .route("/{id}", get(get::handler))
        .route("/{id}/document_id", get(get_document_id::handler))
}
