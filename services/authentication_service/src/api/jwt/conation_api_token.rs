use crate::api::context::{AuthorizationService, ConationApiTokenContext};
use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use macro_auth::conation_api_token::EncodeConationApiTokenArgs;
use macro_authorization::{MacroAuthorizationExtractor, UserOrInternal};
use macro_user_id::user_id::MacroUserIdStr;
use sqlx::PgPool;
use utoipa::ToSchema;

#[derive(serde::Serialize, serde::Deserialize, Debug, ToSchema)]
pub struct ConationApiTokenResponse {
    /// The newly created Conation API token.
    pub conation_api_token: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct ConationApiTokenQuery {
    /// The email to generate the Conation API token for.
    pub email: Option<String>,
}

/// Generates a Conation API token using the user's access token.
/// You can either have your access token in the cookies or in the request
/// headers
/// Authorization: Bearer <access_token>
/// This returns a new Conation API token.
#[utoipa::path(
        get,
        operation_id = "conation_api_token",
        path = "/jwt/conation_api_token",
        tag = "jwt::conation_api_token",
        params(
            ("email" = Option<String>, Query, description = "The email to generate the Conation API token for. If not provided, the default profile is used."),
        ),
        responses(
            (status = 200, body = ConationApiTokenResponse),
            (status = 401, body=String),
            (status = 500, body=String),
        )
    )]
#[tracing::instrument(skip(db, conation_api_token_context, authorization))]
pub async fn handler(
    State(db): State<PgPool>,
    State(conation_api_token_context): State<ConationApiTokenContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    Query(query): Query<ConationApiTokenQuery>,
) -> Result<Response, Response> {
    let user_context = &authorization.authorization.user.user_context;
    let email = if let Some(email) = query.email.clone() {
        // TODO: figure out if email is url_encoded by default
        let email = urlencoding::decode(email.as_ref()).map_err(|e| {
            tracing::error!(error=?e, "unable to decode email");
            (StatusCode::BAD_REQUEST, "unable to decode email").into_response()
        })?;

        email.to_string()
    } else if user_context.user_id.is_empty() {
        tracing::error!("user_id is empty");
        return Err((StatusCode::UNAUTHORIZED, "unauthorized").into_response());
    } else {
        MacroUserIdStr::parse_from_str(&user_context.user_id)
            .map_err(|e| {
                tracing::error!(error=?e, user_id=%user_context.user_id, "invalid Conation user id");
                (StatusCode::UNAUTHORIZED, "unauthorized").into_response()
            })?
            .email_str()
            .to_owned()
    };

    let user_profile =
        macro_db_client::user::get::get_user_profile_by_fusionauth_user_id_and_email(
            &db,
            &user_context.fusion_user_id,
            &email,
        )
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "unable to get user profile by fusionauth user id and email");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "unable to get user profile by fusionauth user id and email",
            )
                .into_response()
        })?;

    let (macro_user_id, organization_id) =
        if let Some((macro_user_id, organization_id)) = user_profile {
            (macro_user_id, organization_id)
        } else {
            tracing::error!("macro user id is none");
            return Err((StatusCode::UNAUTHORIZED, "no access to this profile").into_response());
        };

    let conation_api_token =
        macro_auth::conation_api_token::encode_conation_api_token(EncodeConationApiTokenArgs {
            macro_user_id,
            fusionauth_id: user_context.fusion_user_id.clone(),
            organization_id, // TOOD: get from user profile
            issuer: conation_api_token_context.issuer.to_string(),
            private_key: conation_api_token_context
                .conation_api_token_private_key
                .as_ref()
                .to_string(),
            expiry_seconds: conation_api_token_context.expiry_seconds,
        })
        .map_err(|e| {
            tracing::error!(error=?e, "unable to encode Conation API token");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "unable to encode Conation API token",
            )
                .into_response()
        })?;

    Ok((
        StatusCode::OK,
        Json(ConationApiTokenResponse { conation_api_token }),
    )
        .into_response())
}
