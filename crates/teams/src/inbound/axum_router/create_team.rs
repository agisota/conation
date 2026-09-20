use axum::{Json, extract::State};
use macro_authorization::{
    MacroAuthorizationExtractor, MacroAuthorizationService, UserOrInternal,
};
use entity_access::domain::ports::EntityAccessService;
use roles_and_permissions::domain::access_policy::CONATION_ACCESS_POLICY;

use crate::domain::{
    model::{CreateTeamError, Team},
    team_repo::TeamService,
};

use super::TeamRouterState;

/// The request body to create a new team
#[derive(serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
pub struct CreateTeamRequest {
    /// The name of the team
    pub name: String,
}

/// Creates a new team.
#[utoipa::path(
    post,
    path = "/team",
    operation_id = "create_team",
    responses(
        (status = 200, body = Team),
        (status = 400, body = model_error_response::ErrorResponse),
        (status = 403, body = model_error_response::ErrorResponse),
        (status = 500, body = model_error_response::ErrorResponse),
    ),
)]
#[tracing::instrument(skip_all, err)]
pub async fn handler<T: TeamService, Eas: EntityAccessService, Auth: MacroAuthorizationService>(
    State(state): State<TeamRouterState<T, Eas, Auth>>,
    user: MacroAuthorizationExtractor<Auth, UserOrInternal>,
    Json(req): Json<CreateTeamRequest>,
) -> Result<Json<Team>, CreateTeamError> {
    let user = &user.authorization.user;
    // Subscription lookup remains available for upstream compatibility, but
    // Conation's free-access policy must not make team creation depend on
    // Stripe availability or account state.
    let subscription_id = if CONATION_ACCESS_POLICY.requires_payment_for_features() {
        state
            .service
            .is_user_premium(&user.macro_user_id)
            .await
            .map_err(|e| CreateTeamError::StorageLayerError(e.into()))?
    } else {
        None
    };

    let team = state
        .service
        .create_team(&user.macro_user_id, &req.name, subscription_id.as_ref())
        .await?;

    Ok(Json(team))
}
