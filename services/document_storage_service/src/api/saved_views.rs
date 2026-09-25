use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, patch, post};
use axum::{Router, routing::get};
use macro_authorization::{MacroAuthorizationExtractor, UserOrInternal};
use model::response::ErrorResponse;
use saved_views::{ExcludedDefaultViewStorage, PersonalDashboardConfig, PgViewStorage, ViewStorage, PERSONAL_DASHBOARD_ID};

pub use saved_views::{ExcludedDefaultView, View, ViewPatch};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::try_join;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::api::{ApiContext, context::AuthorizationService};

pub fn router() -> Router<ApiContext> {
    Router::new()
        .route("/", get(get_views_handler))
        .route("/", post(create_view_handler))
        .route("/{saved_view_id}", delete(delete_view_handler))
        .route("/{saved_view_id}", patch(patch_view_handler))
        .route("/exclude_default", post(exclude_default_view_handler))
}

#[derive(Debug, Error)]
pub enum SavedViewErr {
    #[error("An unknown error has occurred")]
    DbErr(#[from] sqlx::Error),
    #[error("You are not authorized to access this")]
    Unauthorized,
    #[error("saved view not found")]
    NotFound,
    #[error("bad request {0}")]
    BadRequest(&'static str),
    #[error("personal dashboard has changed; reload before saving")]
    Conflict,
}

impl IntoResponse for SavedViewErr {
    fn into_response(self) -> Response {
        match &self {
            SavedViewErr::DbErr(error) => {
                tracing::error!(error=?error);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        message: self.to_string().into(),
                    }),
                )
                    .into_response()
            }
            SavedViewErr::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    message: self.to_string().into(),
                }),
            )
                .into_response(),
            SavedViewErr::NotFound => (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    message: self.to_string().into(),
                }),
            )
                .into_response(),
            SavedViewErr::BadRequest(message) => (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    message: (*message).into(),
                }),
            )
                .into_response(),
            SavedViewErr::Conflict => (
                StatusCode::CONFLICT,
                Json(ErrorResponse {
                    message: self.to_string().into(),
                }),
            )
                .into_response(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ViewsResponse {
    views: Vec<View>,
    excluded_default_views: Vec<ExcludedDefaultView>,
}

#[derive(Serialize, Deserialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateViewRequest {
    name: String,
    config: serde_json::Value,
    expected_revision: Option<i64>,
    owner_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExcludeDefaultViewRequest {
    default_view_id: String,
}


#[utoipa::path(
        tag = "saved_views",
        get,
        path = "/saved_views",
        responses(
            (status = 200, body=ViewsResponse),
            (status = 401, body=ErrorResponse),
            (status = 500, body=ErrorResponse),
        )
    )]
#[tracing::instrument(skip(ctx, user), fields(user_id=?user.authorization.user.macro_user_id), err)]
async fn get_views_handler(
    State(ctx): State<ApiContext>,
    user: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
) -> Result<(StatusCode, Json<ViewsResponse>), SavedViewErr> {
    let pg_view_storage = PgViewStorage::new(ctx.db.clone());

    let (views, excluded_default_views) = try_join!(
        async {
            pg_view_storage
                .get_views_for_user(user.authorization.user.macro_user_id.as_ref())
                .await
        },
        async {
            pg_view_storage
                .get_excluded_default_views_for_user(user.authorization.user.macro_user_id.as_ref())
                .await
        }
    )?;

    Ok((
        StatusCode::OK,
        Json(ViewsResponse {
            views,
            excluded_default_views,
        }),
    ))
}

#[utoipa::path(
    tag = "saved_views",
    post,
    path = "/saved_views",
    responses(
        (status = 201, body=View),
        (status = 400, body=ErrorResponse),
        (status = 401, body=ErrorResponse),
        (status = 409, body=ErrorResponse),
        (status = 500, body=ErrorResponse),
    )
)]
async fn create_view_handler(
    ctx: State<ApiContext>,
    user: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    Json(create_view_request): Json<CreateViewRequest>,
) -> Result<(StatusCode, Json<View>), SavedViewErr> {
    let pg_view_storage = PgViewStorage::new(ctx.db.clone());
    let owner_id = user.authorization.user.macro_user_id.to_string();
    let reserved = create_view_request.name == PERSONAL_DASHBOARD_ID
        || create_view_request.config.get("kind").and_then(serde_json::Value::as_str) == Some("dashboard")
        || create_view_request.config.get("id").and_then(serde_json::Value::as_str) == Some(PERSONAL_DASHBOARD_ID);
    if reserved {
        if create_view_request.name != PERSONAL_DASHBOARD_ID
            || create_view_request.owner_id.as_deref() != Some(owner_id.as_str())
            || create_view_request.config.to_string().len() > 1024
        {
            return Err(SavedViewErr::BadRequest("Invalid personal dashboard owner or payload"));
        }
        let expected_revision = create_view_request.expected_revision
            .ok_or(SavedViewErr::BadRequest("Dashboard revision required"))?;
        let config = PersonalDashboardConfig::parse(create_view_request.config, expected_revision)
            .map_err(SavedViewErr::BadRequest)?;
        let canonical = serde_json::to_value(config)
            .map_err(|_| SavedViewErr::BadRequest("Invalid personal dashboard config"))?;
        let view = View::new(owner_id, create_view_request.name, canonical);
        let saved = pg_view_storage
            .upsert_personal_dashboard(&view, expected_revision)
            .await?
            .ok_or(SavedViewErr::Conflict)?;
        return Ok((StatusCode::CREATED, Json(saved)));
    }
    if create_view_request.expected_revision.is_some() || create_view_request.owner_id.is_some() {
        return Err(SavedViewErr::BadRequest("Dashboard fields on ordinary saved view"));
    }
    let view = View::new(owner_id, create_view_request.name, create_view_request.config);
    pg_view_storage.create_view(&view).await?;
    Ok((StatusCode::CREATED, Json(view)))
}

#[derive(Deserialize)]
struct SavedViewParams {
    pub saved_view_id: Uuid,
}

#[utoipa::path(
    tag = "saved_views",
    delete,
    path = "/saved_views/{saved_view_id}",
    params(
        ("saved_view_id" = String, Path, description = "The id of the saved view to delete")
    ),
    responses(
        (status = 200),
        (status = 401, body=ErrorResponse),
        (status = 500, body=ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user), fields(user_id=?user.authorization.user.macro_user_id), err)]
async fn delete_view_handler(
    State(ctx): State<ApiContext>,
    user: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    Path(SavedViewParams { saved_view_id: id }): Path<SavedViewParams>,
) -> Result<StatusCode, SavedViewErr> {
    let storage = PgViewStorage::new(ctx.db.clone());
    if !storage.delete_view(id, user.authorization.user.macro_user_id.as_ref()).await? {
        return Err(SavedViewErr::NotFound);
    }
    Ok(StatusCode::OK)
}

#[utoipa::path(
    tag = "saved_views",
    patch,
    path = "/saved_views/{saved_view_id}",
    params(
        ("saved_view_id" = String, Path, description = "The id of the saved view to patch")
    ),
    responses(
        (status = 200),
        (status = 401, body=ErrorResponse),
        (status = 500, body=ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user, patch), fields(user_id=?user.authorization.user.macro_user_id), err)]
async fn patch_view_handler(
    State(ctx): State<ApiContext>,
    user: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    Path(SavedViewParams { saved_view_id: id }): Path<SavedViewParams>,
    Json(patch): Json<ViewPatch>,
) -> Result<StatusCode, SavedViewErr> {
    let storage = PgViewStorage::new(ctx.db.clone());
    if !storage.patch_view(id, user.authorization.user.macro_user_id.as_ref(), patch).await? {
        return Err(SavedViewErr::NotFound);
    }
    Ok(StatusCode::OK)
}

#[utoipa::path(
    tag = "saved_views",
    post,
    path = "/saved_views/exclude_default",
    responses(
        (status = 200),
        (status = 401, body=ErrorResponse),
        (status = 500, body=ErrorResponse),
    )
)]
#[tracing::instrument(skip(ctx, user), fields(user_id=?user.authorization.user.macro_user_id), err)]
pub async fn exclude_default_view_handler(
    State(ctx): State<ApiContext>,
    user: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    Json(ExcludeDefaultViewRequest {
        default_view_id: id,
    }): Json<ExcludeDefaultViewRequest>,
) -> Result<StatusCode, SavedViewErr> {
    let pg_view_storage = PgViewStorage::new(ctx.db.clone());

    pg_view_storage
        .create_excluded_default_view(ExcludedDefaultView::new(
            user.authorization.user.macro_user_id.to_string(),
            id.to_string(),
        ))
        .await?;

    Ok(StatusCode::OK)
}
