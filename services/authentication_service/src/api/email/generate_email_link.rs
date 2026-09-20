use anyhow::Context;
use axum::{
    Json,
    extract::{self, State},
    http::{HeaderMap, StatusCode, header::ACCEPT_LANGUAGE},
    response::{IntoResponse, Response},
};
use backend_i18n::{
    RenderedVerificationEmail, SupportedLocale, VerificationEmail, negotiate_accept_language,
    render_verification_email,
};
use macro_authorization::{MacroAuthorizationExtractor, UserOrInternal};
use macro_middleware::tracking::ClientIp;
use url::Url;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    api::context::{ApiContext, AuthorizationService},
    config::BASE_URL,
    rate_limit_config::RATE_LIMIT_CONFIG,
};

use model::response::{EmptyResponse, ErrorResponse};

#[cfg(test)]
mod test;

#[derive(serde::Deserialize, serde::Serialize, ToSchema)]
pub struct GenerateEmailLinkRequest {
    /// The email address to resend the verification email to
    pub email: String,
}

fn requested_locale(headers: &HeaderMap) -> SupportedLocale {
    let values = headers
        .get_all(ACCEPT_LANGUAGE)
        .iter()
        .map(|value| value.to_str())
        .collect::<Result<Vec<_>, _>>();

    match values {
        Ok(mut values) if !values.is_empty() => {
            // Lowest non-zero valid quality: explicit supported languages still win.
            // Do not reintroduce a language the client marked q=0.
            if !values
                .iter()
                .any(|value| explicitly_excludes_language(value, "ru"))
            {
                values.push("ru;q=0.001");
            } else if !values
                .iter()
                .any(|value| explicitly_excludes_language(value, "en"))
            {
                values.push("en;q=0.001");
            }
            negotiate_accept_language(Some(&values.join(",")))
        }
        _ => SupportedLocale::default(),
    }
}

fn explicitly_excludes_language(value: &str, language: &str) -> bool {
    value.split(',').any(|item| {
        let mut parts = item.trim().split(';');
        let Some(range) = parts.next().map(str::trim) else {
            return false;
        };
        let Some(quality) = parts.next().and_then(|parameter| {
            let (name, value) = parameter.trim().split_once('=')?;
            name.trim()
                .eq_ignore_ascii_case("q")
                .then_some(value.trim())
        }) else {
            return false;
        };
        let mut subtags = range.split('-');
        let Some(primary) = subtags.next() else {
            return false;
        };

        parts.next().is_none()
            && is_zero_quality(quality)
            && primary.len() <= 8
            && primary.bytes().all(|byte| byte.is_ascii_alphabetic())
            && primary.eq_ignore_ascii_case(language)
            && subtags.all(|subtag| {
                !subtag.is_empty()
                    && subtag.len() <= 8
                    && subtag.bytes().all(|byte| byte.is_ascii_alphanumeric())
            })
    })
}

fn is_zero_quality(value: &str) -> bool {
    value == "0"
        || value.strip_prefix("0.").is_some_and(|fractional| {
            fractional.len() <= 3 && fractional.bytes().all(|byte| byte == b'0')
        })
}

fn verification_email_for_delivery(
    base_url: &str,
    verification_id: Uuid,
    locale: SupportedLocale,
    support_email: &str,
) -> anyhow::Result<RenderedVerificationEmail> {
    let mut verification_url = Url::parse(base_url).context("BASE_URL is not a valid URL")?;
    let path = format!(
        "{}/email/verify/{verification_id}",
        verification_url.path().trim_end_matches('/')
    );
    verification_url.set_path(&path);
    verification_url.set_query(None);
    verification_url.set_fragment(None);

    render_verification_email(
        locale,
        VerificationEmail {
            verification_url: &verification_url,
            support_email,
        },
    )
    .context("failed to render verification email")
}

/// Generates an email link for the user to verify their email address.
#[utoipa::path(
        post,
        path = "/email/generate/link",
        operation_id = "generate_email_link",
        responses(
            (status = 200, body=EmptyResponse),
            (status = 400, body=ErrorResponse),
            (status = 500, body=ErrorResponse),
        ),
    )]
#[tracing::instrument(skip(ctx, authorization, ip_context, headers, req), fields(client_ip=%ip_context, email=%req.email, fusion_user_id=%authorization.authorization.user.user_context.fusion_user_id), err(Debug))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    ip_context: ClientIp,
    headers: HeaderMap,
    extract::Json(mut req): extract::Json<GenerateEmailLinkRequest>,
) -> Result<Response, Response> {
    tracing::info!("generate_email_link");
    let user_context = &authorization.authorization.user.user_context;
    // normalize the email before linking
    req.email = email_validator::normalize_email(&req.email)
        .context("failed to normalize email")
        .map_err(|e| {
            tracing::error!(error=?e, "failed to normalize email");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to normalize email",
            )
                .into_response()
        })?
        .to_string();

    let (minute, daily) = ctx
        .macro_cache_client
        .get_resend_verify_email_rate_limits(&req.email)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to get resend verify email rate limit");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to get resend verify email rate limit",
            )
                .into_response()
        })?;

    if let Some(minute) = minute
        && minute >= RATE_LIMIT_CONFIG.verify_email_minute.0
    {
        tracing::error!(
            rate_limit = RATE_LIMIT_CONFIG.verify_email_minute.0,
            count = minute,
            rate_limit = "minute",
            "rate_limit_exceeded"
        );
        return Err((StatusCode::TOO_MANY_REQUESTS, "rate limit exceeded").into_response());
    }

    if let Some(daily) = daily
        && daily >= RATE_LIMIT_CONFIG.verify_email_daily.0
    {
        tracing::error!(
            rate_limit = RATE_LIMIT_CONFIG.verify_email_daily.0,
            count = daily,
            rate_limit = "daily",
            "rate_limit_exceeded"
        );
        return Err((StatusCode::TOO_MANY_REQUESTS, "daily rate limit exceeded").into_response());
    }

    // Check if the user profile already exists
    match macro_db_client::user::get::get_user_id_by_email(ctx.db.clone(), &req.email).await {
        Ok(_) => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    message: "user profile already exists".into(),
                }),
            )
                .into_response());
        }
        Err(e) => match e {
            sqlx::Error::RowNotFound => (),
            _ => {
                tracing::error!(error=?e, "unable to check for existing user profile");
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        message: "unable to check for existing user profile".into(),
                    }),
                )
                    .into_response());
            }
        },
    }

    // Check if that email is already an in progress email link
    let link_id = if let Some((macro_user_id, link_id)) =
        macro_db_client::in_progress_email_link::check_existing_in_progress_email_link(
            &ctx.db, &req.email,
        )
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to check existing in progress email link");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to check existing in progress email link",
            )
                .into_response()
        })? {
        // if the macro_user_id matches the user_id, we count this as "regenerating" the link
        if !macro_user_id.to_string().eq(&user_context.fusion_user_id) {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    message: "email already in progress".into(),
                }),
            )
                .into_response());
        }

        link_id
    } else {
        macro_db_client::macro_user_email_verification::upsert_macro_user_email_verification(
            &ctx.db,
            &user_context.fusion_user_id,
            &req.email,
            false,
        )
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to insert macro user email verification");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to insert macro user email verification",
            )
                .into_response()
        })?;

        macro_db_client::in_progress_email_link::insert_in_progress_email_link(
            &ctx.db,
            &user_context.fusion_user_id,
            &req.email,
        )
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to insert in progress email link");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to insert in progress email link",
            )
                .into_response()
        })?
    };

    // Negotiate at the HTTP edge, then render through the transport-free locale boundary.
    let locale = requested_locale(&headers);
    let email = verification_email_for_delivery(
        &BASE_URL,
        link_id,
        locale,
        "pythia@conation.dev",
    )
    .map_err(|e| {
        tracing::error!(error=?e, "failed to render verification email");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to render verification email",
        )
            .into_response()
    })?;

    // Send email
    ctx.ses_client
        .send_email(
            "auth@conation.dev",
            &req.email,
            email.subject(),
            email.html(),
        )
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to send email");
            (StatusCode::INTERNAL_SERVER_ERROR, "failed to send email").into_response()
        })?;

    // Increment the rate limits
    ctx.conation_cache_client
        .increment_resend_verify_email_rate_limits(&req.email)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to increment resend verify email rate limit");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to increment resend verify email rate limit",
            )
                .into_response()
        })?;

    Ok((StatusCode::OK, Json(EmptyResponse {})).into_response())
}
