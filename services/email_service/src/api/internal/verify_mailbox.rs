use crate::api::context::{ApiContext, AuthorizationService};
use axum::{Json, extract::State, http::StatusCode, response::{IntoResponse, Response}};
use email::domain::models::MailboxVerificationProvider;
use email_service::stalwart_jmap::{MailboxVerificationError, verify_existing_mailbox};
use macro_authorization::{InternalOnly, MacroAuthorizationExtractor};
use macro_user_id::{email::EmailStr, user_id::MacroUserIdStr};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Internal-only read-only verification. The caller must first create the
/// mailbox and securely obtain this principal's own mailbox password. Never
/// supply an administrator credential or treat a successful probe as a link.
#[derive(Deserialize)]
pub struct VerifyMailboxRequest {
    pub provider: MailboxVerificationProvider,
    pub fusionauth_user_id: Uuid,
    pub email_address: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct VerifyMailboxResponse {
    pub provider: MailboxVerificationProvider,
    pub fusionauth_user_id: Uuid,
    pub macro_id: String,
    pub email_address: String,
    pub account_id: String,
    /// Verification is not provisioning and does not persist a mail link.
    pub state: &'static str,
}

#[derive(Serialize)]
struct VerifyMailboxError {
    code: &'static str,
    message: &'static str,
}

fn failure(status: StatusCode, code: &'static str, message: &'static str) -> Response {
    (status, Json(VerifyMailboxError { code, message })).into_response()
}

/// POST /internal/mailboxes/verify, internal API key only. A 200 confirms the
/// requested owner maps to one existing User row and the supplied user's
/// password authenticates their personal JMAP mail account. No DB writes,
/// email_links row, mailbox creation, sync, or outbound delivery occur.
#[tracing::instrument(skip(ctx, _authorization, request))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    _authorization: MacroAuthorizationExtractor<AuthorizationService, InternalOnly>,
    Json(request): Json<VerifyMailboxRequest>,
) -> Response {
    let VerifyMailboxRequest {
        provider,
        fusionauth_user_id,
        email_address,
        password,
    } = request;
    if EmailStr::parse_from_str(&email_address).is_err()
        || email_address != email_address.to_lowercase()
    {
        return failure(StatusCode::BAD_REQUEST, "INVALID_EMAIL", "Invalid canonical email");
    }
    let Ok(macro_id) = MacroUserIdStr::try_from_email(&email_address) else {
        return failure(StatusCode::BAD_REQUEST, "INVALID_EMAIL", "Invalid canonical email");
    };
    let owner = sqlx::query_as::<_, (String, Option<Uuid>)>(
        "SELECT id, macro_user_id FROM \"User\" WHERE email = $1",
    )
    .bind(&email_address)
    .fetch_optional(&ctx.db)
    .await;
    match owner {
        Ok(Some((id, Some(actual_auth_id))))
            if id == macro_id.to_string() && actual_auth_id == fusionauth_user_id => {}
        Ok(_) => {
            return failure(
                StatusCode::CONFLICT,
                "OWNER_MISMATCH",
                "Mailbox owner is not bound to this user",
            );
        }
        Err(error) => {
            tracing::error!(?error, "failed to resolve mailbox owner");
            return failure(
                StatusCode::SERVICE_UNAVAILABLE,
                "OWNER_LOOKUP_FAILED",
                "Mailbox owner lookup unavailable",
            );
        }
    }
    let account_id = match provider {
        MailboxVerificationProvider::StalwartJmap => {
            verify_existing_mailbox(
                ctx.config.stalwart_jmap_session_url.value(),
                &password,
                &email_address,
            )
            .await
        }
    };
    match account_id {
        Ok(account_id) => (
            StatusCode::OK,
            Json(VerifyMailboxResponse {
                provider,
                fusionauth_user_id,
                macro_id: macro_id.to_string(),
                email_address,
                account_id,
                state: "VERIFIED_NOT_LINKED",
            }),
        )
            .into_response(),
        Err(error) => {
            let (status, code, message) = match error {
                MailboxVerificationError::Unconfigured | MailboxVerificationError::InvalidEndpoint => (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "JMAP_NOT_CONFIGURED",
                    "JMAP mailbox verification unavailable",
                ),
                MailboxVerificationError::Unauthorized => (
                    StatusCode::FAILED_DEPENDENCY,
                    "JMAP_PASSWORD_REJECTED",
                    "Mailbox password rejected",
                ),
                MailboxVerificationError::IdentityMismatch => (
                    StatusCode::CONFLICT,
                    "JMAP_OWNER_MISMATCH",
                    "JMAP mailbox does not belong to this principal",
                ),
                MailboxVerificationError::ProviderUnavailable => (
                    StatusCode::BAD_GATEWAY,
                    "JMAP_UNAVAILABLE",
                    "JMAP mailbox verification failed",
                ),
            };
            failure(status, code, message)
        }
    }
}
