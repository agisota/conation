use crate::api::context::{ApiContext, AuthorizationService};
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use email_service::corporate_mailbox_provisioner::{
    internal_error_response, retry_repaired_intent,
};
use macro_authorization::{InternalOnly, MacroAuthorizationExtractor};
use macro_user_id::email::EmailStr;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct RetryMailboxProvisionRequest {
    pub fusionauth_user_id: Uuid,
    pub email_address: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RetryMailboxProvisionResponse {
    state: &'static str,
}

/// Re-arm a terminal provider error only after an operator has corrected its
/// cause. The worker retains the encrypted credential and re-verifies provider
/// ownership before it can reuse or create an account.
#[tracing::instrument(skip(ctx, _authorization, request))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    _authorization: MacroAuthorizationExtractor<AuthorizationService, InternalOnly>,
    Path(idempotency_key): Path<Uuid>,
    Json(request): Json<RetryMailboxProvisionRequest>,
) -> Response {
    if EmailStr::parse_from_str(&request.email_address).is_err()
        || request.email_address != request.email_address.to_lowercase()
        || request.fusionauth_user_id != idempotency_key
    {
        return StatusCode::CONFLICT.into_response();
    }
    let email = request.email_address.as_str();
    match retry_repaired_intent(&ctx.db, idempotency_key, request.fusionauth_user_id, email).await {
        Ok(true) => (
            StatusCode::ACCEPTED,
            Json(RetryMailboxProvisionResponse { state: "RETRYABLE" }),
        )
            .into_response(),
        Ok(false) => StatusCode::CONFLICT.into_response(),
        Err(error) => {
            tracing::error!(error = %error, idempotency_key = %idempotency_key, "corporate mailbox retry failed");
            internal_error_response(&error).into_response()
        }
    }
}
