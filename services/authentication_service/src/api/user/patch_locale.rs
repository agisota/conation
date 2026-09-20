use axum::{
    Json,
    extract::{self, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use conation_authorization::{MacroAuthorizationExtractor, UserOrInternal};
use macro_user_id::user_id::MacroUserId;

use crate::api::context::{ApiContext, AuthorizationService};

use model::response::{EmptyResponse, ErrorResponse};
use utoipa::ToSchema;

#[derive(Default, Debug, serde::Serialize, serde::Deserialize, ToSchema)]
pub struct PatchUserLocaleRequest {
    pub locale: String,
}

/// Sets the locale of the authenticated user
#[utoipa::path(
        patch,
        path = "/user/locale",
        operation_id = "patch_user_locale",
        request_body = PatchUserLocaleRequest,
        responses(
            (status = 200, body=EmptyResponse),
            (status = 400, body=ErrorResponse),
            (status = 401, body=String),
            (status = 500, body=ErrorResponse),
        ),
    )]
#[tracing::instrument(skip(ctx, authorization), fields(user_id = authorization.authorization.user.user_context.user_id, macro_user_id = authorization.authorization.user.user_context.fusion_user_id))]
pub async fn handler(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    extract::Json(req): extract::Json<PatchUserLocaleRequest>,
) -> Result<Response, Response> {
    tracing::info!("patch_user_locale");

    if req.locale != "en" && req.locale != "ru" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                message: "invalid locale".into(),
            }),
        )
            .into_response());
    }

    let user_id =
        MacroUserId::parse_from_str(&authorization.authorization.user.user_context.user_id)
            .map_err(|_| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        message: "invalid user id".into(),
                    }),
                )
                    .into_response()
            })?
            .lowercase();

    conation_db_client::user::patch::patch_user_locale(&ctx.db, &user_id, &req.locale)
        .await
        .map_err(|e| {
            tracing::error!(error=?e, "failed to update user locale");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        })?;

    Ok((StatusCode::OK, Json(EmptyResponse {})).into_response())
}
