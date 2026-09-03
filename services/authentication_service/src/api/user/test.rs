use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
    routing::post,
};
use tower::ServiceExt;

use super::with_stripe_routes;

#[tokio::test]
async fn disabled_stripe_routes_are_not_installed() {
    let app = with_stripe_routes(
        Router::new(),
        false,
        post(|| async { StatusCode::NO_CONTENT }),
        post(|| async { StatusCode::NO_CONTENT }),
    );

    for path in ["/stripe/checkoutv2", "/stripe/portal"] {
        let response = app
            .clone()
            .oneshot(Request::post(path).body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND, "{path}");
    }
}
