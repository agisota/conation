use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
    routing::post,
};
use tower::ServiceExt;

use super::with_stripe_webhook_route;

#[tokio::test]
async fn disabled_stripe_webhook_route_is_not_installed() {
    let app = with_stripe_webhook_route(
        Router::new(),
        false,
        post(|| async { StatusCode::NO_CONTENT }),
    );

    let response = app
        .oneshot(Request::post("/stripe").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
