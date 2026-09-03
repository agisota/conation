//! Axum extractors for chat inbound handlers.

use std::marker::PhantomData;
use std::sync::Arc;

use crate::domain::ports::ModelAccessService;
use crate::domain::service::ModelAccessServiceImpl;
use axum::extract::{FromRef, FromRequestParts};
use axum::http::request::Parts;
use axum::response::IntoResponse;
use conation_authorization::{
    ActingUser, MacroAuthorizationExtractor, MacroAuthorizationRejection,
    MacroAuthorizationService, MacroAuthorizationState,
};
use roles_and_permissions::domain::port::UserRolesAndPermissionsService;

/// Axum sub-state carrying the roles-and-permissions service used by
/// [`ChatModelAccess`].
///
/// A newtype (rather than a bare `Arc<P>` bound) so router states can expose
/// it via `FromRef` without colliding with other `Arc`-typed sub-states.
pub struct UserPermissionsState<P>(pub Arc<P>);

impl<P> Clone for UserPermissionsState<P> {
    fn clone(&self) -> Self {
        Self(Arc::clone(&self.0))
    }
}

/// Axum extractor authenticating a user before granting model access.
///
/// Conation has no paid model tier: every authenticated user receives the same
/// default and may request any model supported by the server router.
///
/// Type parameter `Auth` is the authorization service implementation and `P`
/// is retained in the type for router-state compatibility; no subscription or
/// permissions lookup participates in model access.
#[derive(Debug, Clone, Copy)]
pub struct ChatModelAccess<Auth, P> {
    _marker: PhantomData<fn() -> (Auth, P)>,
}

impl<Auth, P> ChatModelAccess<Auth, P> {
    /// Compatibility accessor: Conation grants this capability to everyone.
    pub fn professional(&self) -> bool {
        true
    }

    /// Whether the user may use the provider-qualified model identified by
    /// `model_id`.
    pub fn has_access(&self, model_id: &str) -> bool {
        ModelAccessServiceImpl.has_access(true, model_id)
    }

    /// The default model for this user — the best one they're entitled to.
    pub fn best_model(&self) -> &'static str {
        ModelAccessServiceImpl.best_model(true)
    }
}

/// Error returned when [`ChatModelAccess`] cannot be extracted.
pub enum ChatModelAccessRejection {
    /// The caller's credentials were rejected by the authorization service.
    Unauthorized(MacroAuthorizationRejection),
}

impl IntoResponse for ChatModelAccessRejection {
    fn into_response(self) -> axum::response::Response {
        match self {
            Self::Unauthorized(rejection) => rejection.into_response(),
        }
    }
}

impl<S, Auth, P> FromRequestParts<S> for ChatModelAccess<Auth, P>
where
    MacroAuthorizationState<Auth>: FromRef<S>,
    Auth: MacroAuthorizationService,
    P: UserRolesAndPermissionsService,
    S: Send + Sync + 'static,
{
    type Rejection = ChatModelAccessRejection;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        MacroAuthorizationExtractor::<Auth, ActingUser>::from_request_parts(parts, state)
            .await
            .map_err(ChatModelAccessRejection::Unauthorized)?;

        Ok(ChatModelAccess {
            _marker: PhantomData,
        })
    }
}

#[cfg(test)]
mod test {
    use super::*;
    fn access() -> ChatModelAccess<(), ()> {
        ChatModelAccess {
            _marker: PhantomData,
        }
    }

    #[test]
    fn every_authenticated_user_gets_every_model() {
        let access = access();
        assert!(access.professional());
        assert_eq!(access.best_model(), "anthropic/claude-sonnet-5");
        assert!(access.has_access("anthropic/claude-haiku-4-5"));
        assert!(access.has_access("anthropic/claude-opus-5"));
        assert!(access.has_access("rox/gemini-2.5-flash"));
    }
}
