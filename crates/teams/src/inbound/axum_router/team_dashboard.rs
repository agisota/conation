//! Team-default dashboard layout. Members may read it; only admins and
//! owners may replace it. The JSON blob is frontend-owned.

use axum::{Json, extract::State};
use macro_authorization::MacroAuthorizationService;
use entity_access::{
    domain::{
        models::{AdminTeamRole, MemberTeamRole},
        ports::EntityAccessService,
    },
    inbound::axum_extractors::MacroUserTeamExtractorV2,
};
use model_error_response::ErrorResponse;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;

use crate::domain::team_repo::TeamService;

use super::TeamRouterState;

/// The team's default dashboard layout. `layout` is null when no default
/// has been saved.
#[derive(Debug, Serialize, ToSchema)]
pub struct TeamDashboardLayoutResponse {
    /// Opaque layout object owned by the frontend, or `null` if unset.
    pub layout: Option<Value>,
}

/// Replacement team-default dashboard layout. Pass `null` to clear it.
#[derive(Debug, Deserialize, ToSchema)]
pub struct PutTeamDashboardLayoutRequest {
    /// Replacement layout object, or `null` to clear the team default.
    pub layout: Option<Value>,
}

/// Read the caller's team-default dashboard layout. Any team member may
/// read; teams with no saved default get `layout: null`.
#[utoipa::path(
    get,
    path = "/team/dashboard",
    operation_id = "get_team_dashboard_layout",
    responses(
        (status = 200, body = TeamDashboardLayoutResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err)]
pub async fn get_handler<
    T: TeamService,
    Eas: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    access: MacroUserTeamExtractorV2<MemberTeamRole, Eas, Auth>,
    State(state): State<TeamRouterState<T, Eas, Auth>>,
) -> Result<Json<TeamDashboardLayoutResponse>, crate::domain::model::TeamError> {
    let layout = state
        .service
        .get_dashboard_layout(access.entity_access_receipt)
        .await?;
    Ok(Json(TeamDashboardLayoutResponse { layout }))
}

/// Replace the team-default dashboard layout. Requires a team admin or
/// owner. The blob is replaced whole (last write wins); `null` clears it.
#[utoipa::path(
    put,
    path = "/team/dashboard",
    operation_id = "put_team_dashboard_layout",
    request_body = PutTeamDashboardLayoutRequest,
    responses(
        (status = 200, body = TeamDashboardLayoutResponse),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err)]
pub async fn put_handler<
    T: TeamService,
    Eas: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    access: MacroUserTeamExtractorV2<AdminTeamRole, Eas, Auth>,
    State(state): State<TeamRouterState<T, Eas, Auth>>,
    Json(req): Json<PutTeamDashboardLayoutRequest>,
) -> Result<Json<TeamDashboardLayoutResponse>, crate::domain::model::TeamError> {
    let layout = state
        .service
        .set_dashboard_layout(access.entity_access_receipt, req.layout)
        .await?;
    Ok(Json(TeamDashboardLayoutResponse { layout }))
}
