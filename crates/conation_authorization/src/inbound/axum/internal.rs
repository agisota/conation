use ::axum::{
    extract::FromRef,
    http::{HeaderMap, StatusCode, request::Parts},
};
use rootcause::Report;

use crate::{
    InternalIdentityClaims, MacroAuthorization, MacroAuthorizationError, MacroAuthorizationService,
};

use super::{
    MacroAuthorizationRejection, MacroAuthorizationState, authenticated_user, rejection,
    status_rejection,
};

/// Header carrying the shared key for standard internal service authorization.
pub const INTERNAL_API_KEY_HEADER: &str = "x-internal-auth-key";
/// Header carrying the acting Conation user ID for internal authorization.
pub const INTERNAL_CONATION_USER_ID_HEADER: &str = "x-internal-conation-user-id";
/// Header carrying the acting organization ID for standard internal authorization.
pub const INTERNAL_CONATION_ORGANIZATION_ID_HEADER: &str = "x-internal-conation-organization-id";
/// Header carrying the acting FusionAuth user ID for standard internal authorization.
pub const INTERNAL_FUSIONAUTH_USER_ID_HEADER: &str = "x-internal-fusionauth-user-id";

const LEGACY_INTERNAL_HEADERS: &[&str] = &[
    "x-document-storage-service-auth-key",
    "x-document-storage-service-user-id",
    "x-document-storage-service-session-id",
    "x-internal-macro-user-id",
    "x-internal-macro-organization-id",
];

pub(super) async fn authorize_internal_request<S, Svc>(
    parts: &Parts,
    state: &S,
) -> Result<Option<MacroAuthorization>, MacroAuthorizationRejection>
where
    MacroAuthorizationState<Svc>: FromRef<S>,
    Svc: MacroAuthorizationService,
    S: Send + Sync + 'static,
{
    let provided_key = parts
        .headers
        .get(INTERNAL_API_KEY_HEADER)
        .and_then(|header| header.to_str().ok())
        .ok_or_else(|| rejection("unauthorized"))?;
    let claims = internal_identity_claims(&parts.headers);
    let authorization = MacroAuthorizationState::<Svc>::from_ref(state);
    let user_context = authorization
        .service
        .authorize_internal(provided_key, claims)
        .await
        .map_err(internal_authorization_rejection)?;
    let acting_user = user_context.map(authenticated_user).transpose()?;

    Ok(Some(MacroAuthorization::Internal(acting_user)))
}

pub(super) fn has_internal_auth_key(headers: &HeaderMap) -> bool {
    headers.contains_key(INTERNAL_API_KEY_HEADER)
}

pub(super) fn reject_legacy_internal_headers(
    headers: &HeaderMap,
) -> Result<(), MacroAuthorizationRejection> {
    if LEGACY_INTERNAL_HEADERS
        .iter()
        .any(|header| headers.contains_key(*header))
    {
        return Err(status_rejection(
            StatusCode::BAD_REQUEST,
            "legacy internal credentials are not supported",
        ));
    }

    Ok(())
}

fn internal_identity_claims(headers: &HeaderMap) -> InternalIdentityClaims {
    InternalIdentityClaims {
        user_id: header_string(headers, INTERNAL_CONATION_USER_ID_HEADER),
        fusion_user_id: header_string(headers, INTERNAL_FUSIONAUTH_USER_ID_HEADER),
        organization_id: header_string(headers, INTERNAL_CONATION_ORGANIZATION_ID_HEADER)
            .and_then(|organization_id| organization_id.parse().ok()),
    }
}

fn header_string(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|header| header.to_str().ok())
        .map(str::to_owned)
}

fn internal_authorization_rejection(
    error: Report<MacroAuthorizationError>,
) -> MacroAuthorizationRejection {
    tracing::error!(error=?error.current_context(), "internal authorization failed");
    rejection("unauthorized")
}
