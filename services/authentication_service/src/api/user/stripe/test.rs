use axum::{http::StatusCode, response::IntoResponse};

use super::StripeOperationError;

#[test]
fn disabled_billing_returns_a_controlled_response() {
    assert_eq!(
        StripeOperationError::StripeBillingDisabled
            .into_response()
            .status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
}
