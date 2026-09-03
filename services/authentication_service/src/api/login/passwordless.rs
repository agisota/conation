use axum::{
    Json,
    extract::{self, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use conation_middleware::tracking::ClientIp;

use std::borrow::Cow;

use crate::{
    api::{context::ApiContext, login::sso::parse_allowed_original_url},
    generate_password::generate_random_password,
};
use conation_user_id::user_id::MacroUserIdStr;
use fusionauth::error::FusionAuthClientError;
use model::{
    authentication::login::{
        request::PasswordlessRequest,
        response::{PasswordlessStartedResponse, SsoRequiredResponse},
    },
    response::ErrorResponse,
};
use referral::domain::{models::ReferralCode, ports::ReferralService};

/// Initiates a passwordless login
#[utoipa::path(
        post,
        operation_id = "passwordless_login",
        path = "/login/passwordless",
        responses(
            (status = 200, body = PasswordlessStartedResponse),
            (status = 202, body = SsoRequiredResponse),
            (status = 400, body=String),
            (status = 403, body=String),
            (status = 500, body=String),
        )
    )]
#[tracing::instrument(skip(ctx, req, ip_context), fields(email=%req.email, client_ip=%ip_context), err(Debug))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    ip_context: ClientIp,
    extract::Json(req): extract::Json<PasswordlessRequest>,
) -> Result<Response, Response> {
    tracing::info!("passwordless_login_request");

    if !email_validator::is_valid_email(&req.email) {
        tracing::error!(email=%req.email, "invalid email");
        return Err((StatusCode::BAD_REQUEST, "invalid email").into_response());
    }

    if parse_allowed_original_url(&req.redirect_uri).is_none() {
        tracing::warn!("passwordless redirect_uri is not allowed");
        return Err((StatusCode::BAD_REQUEST, "redirect_uri is not allowed").into_response());
    }

    let lowercase_email = req.email.to_lowercase();

    match ctx
        .auth_client
        .lookup_identity_provider(&lowercase_email)
        .await
    {
        Ok(None) => (), // There is no identity provider for the email, proceed with passwordless login
        Ok(Some(idp_id)) => {
            return Ok((StatusCode::ACCEPTED, Json(SsoRequiredResponse { idp_id })).into_response());
        }
        Err(e) => {
            tracing::error!(error=?e, "unable to lookup identity providers");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "unable to lookup identity providers",
            )
                .into_response());
        }
    };

    let blocked_email_without_alias = email_validator::remove_email_alias(&lowercase_email)
        .unwrap_or(Cow::Borrowed(lowercase_email.as_str()))
        .to_string();

    let blocked_email = conation_db_client::blocked_email::get_blocked_emails(
        &ctx.db,
        &[&lowercase_email, &blocked_email_without_alias],
    )
    .await
    .map_err(|e| {
        tracing::error!(error=?e, email=%lowercase_email, "unable to get blocked email");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "unable to get blocked email",
        )
            .into_response()
    })?;

    if !blocked_email.is_empty() {
        tracing::warn!(email=%lowercase_email, "email is blocked");
        return Err((StatusCode::FORBIDDEN, "unable to login").into_response());
    }

    // Check if a user with this email exists through FusionAuth.
    // We may have a user that has linked an email but they don't have a FusionAuth user to handle
    // sending the passwordless login.
    match ctx.auth_client.get_user_id_by_email(&lowercase_email).await {
        Ok(_) => (),
        Err(e) => {
            match e {
                FusionAuthClientError::UserDoesNotExist => {
                    tracing::trace!(email=%lowercase_email, "user does not exist, we need to create user");
                    let fusionauth_user_id = ctx
                    .auth_client
                    .create_user(fusionauth::user::create::User {
                        email: (&lowercase_email).into(),
                        password: generate_random_password().into(),
                        username: None,
                    }, true, ip_context.origin_ip())
                    .await
                    .map_err(|e| {
                        tracing::error!(error=?e, email=%lowercase_email, "unable to create user");
                        (StatusCode::INTERNAL_SERVER_ERROR, "unable to create user").into_response()
                    })?;

                    tracing::trace!(fusionauth_user_id, "created new fusionauth user");

                    if let Some(referral_code) = req.referral_code {
                        tracing::trace!(referral_code, "referral code found");
                        let referred_user_id = MacroUserIdStr::try_from_email(&lowercase_email)
                            .map_err(|_| {
                                (
                                    StatusCode::BAD_REQUEST,
                                    Json(ErrorResponse {
                                        message: "invalid Conation user id".into(),
                                    }),
                                )
                                    .into_response()
                            })?;

                        // initiates tracking the referral
                        let _ = ctx
                            .referral_service
                            .track_referral(&referred_user_id, &ReferralCode(referral_code.clone()))
                            .await
                            .inspect_err(|e| {
                                tracing::error!(error=?e, "unable to track referral");
                            });
                    }
                }
                _ => {
                    tracing::error!(error=?e, email=%lowercase_email, "unable to get user id");
                    return Err((StatusCode::INTERNAL_SERVER_ERROR).into_response());
                }
            }
        }
    }

    // Generate code
    let code = ctx
        .auth_client
        .start_passwordless_login(&lowercase_email, &req.redirect_uri)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "unable to start passwordless login");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "unable to perform passwordless login",
            )
                .into_response()
        })?;

    // Save the passwordless login code to the users email to tie the code to an account
    ctx.conation_cache_client
        .set_passwordless_login_code(&lowercase_email, &code)
        .await.map_err(|e| {
            tracing::error!(error=?e, email=%lowercase_email, "unable to set passwordless login code");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "unable to set passwordless login code",
            )
                .into_response()
        })?;

    // Send passwordless login
    ctx.auth_client
        .send_passwordless_login(&code)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "unable to send passwordless login");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "unable to perform passwordless login",
            )
                .into_response()
        })?;

    // Hand the code back only when explicitly compiled for local/dev tooling
    // that needs to complete passwordless login without reading the email.
    let body = PasswordlessStartedResponse {
        code: cfg!(feature = "return_passwordless_code").then_some(code),
    };

    Ok((StatusCode::OK, Json(body)).into_response())
}
