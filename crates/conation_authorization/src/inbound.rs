//! Inbound transport adapters for authorizing credentials.

/// Axum extractors backed by the authorization service.
pub mod axum;

pub use axum::{
    ActingEntity, ActingUser, ActingUserAuthorization, AnyPrincipal, AuthorizationPolicy,
    BOT_FOR_CONATION_USER_ID_HEADER, BOT_FOR_FUSIONAUTH_USER_ID_HEADER,
    BOT_FOR_ORGANIZATION_ID_HEADER, BOT_SCOPE_HEADER, BOT_TOKEN_HEADER, BotOnly,
    INTERNAL_API_KEY_HEADER, INTERNAL_CONATION_ORGANIZATION_ID_HEADER,
    INTERNAL_CONATION_USER_ID_HEADER, INTERNAL_FUSIONAUTH_USER_ID_HEADER, InternalAuthorization,
    InternalEntity, InternalOnly, MacroAuthorizationExtractor, MacroAuthorizationRejection,
    MacroAuthorizationState, OptionalMacroAuthorizationExtractor, UserOnly, UserOrBot,
    UserOrBotAuthorization, UserOrBotEntity, UserOrInternal, UserOrInternalAuthorization,
    UserOrInternalCaller, UserOrInternalEntity, UserOrInternalService,
    UserOrInternalServiceAuthorization,
};
