use axum::{
    Json,
    extract::Query,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use utoipa::IntoParams;

use crate::api::antibot::{SignupChallenge, issue_challenge};

#[derive(Debug, Deserialize, IntoParams)]
pub struct SignupChallengeQuery {
    /// External email the new account will confirm.
    pub email: String,
}

/// Issues an HMAC-signed proof-of-work challenge for open signup.
#[utoipa::path(
    get,
    operation_id = "signup_challenge",
    path = "/login/signup-challenge",
    params(SignupChallengeQuery),
    responses(
        (status = 200, body = SignupChallenge),
        (status = 400, body = String),
    )
)]
#[tracing::instrument(fields(email=%query.email))]
pub async fn handler(
    Query(query): Query<SignupChallengeQuery>,
) -> Result<Json<SignupChallenge>, Response> {
    if !email_validator::is_valid_email(&query.email) {
        return Err((StatusCode::BAD_REQUEST, "invalid email").into_response());
    }
    let now = chrono::Utc::now().timestamp();
    Ok(Json(issue_challenge(&query.email, now)))
}
