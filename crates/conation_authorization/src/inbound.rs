//! Inbound transport adapters for authorizing credentials.

/// Axum extractors backed by the authorization service.
pub mod axum;

pub use axum::{
    ActingEntity, ActingUser, ActingUserAuthorization, AnyPrincipal, AuthorizationPolicy,
    BOT_FOR_CONATION_USER_ID_HEADER, BOT_FOR_CONATION_USER_ID_HEADER as BOT_FOR_MACRO_USER_ID_HEADER,
    BOT_FOR_FUSIONAUTH_USER_ID_HEADER, BOT_FOR_ORGANIZATION_ID_HEADER, BOT_SCOPE_HEADER,
    BOT_TOKEN_HEADER, BotOnly, HARNESS_FOR_MACRO_USER_ID_HEADER, HARNESS_TOKEN_HEADER, HarnessOnly,
    INTERNAL_API_KEY_HEADER, INTERNAL_CONATION_ORGANIZATION_ID_HEADER,
    INTERNAL_CONATION_ORGANIZATION_ID_HEADER as INTERNAL_MACRO_ORGANIZATION_ID_HEADER,
    INTERNAL_CONATION_USER_ID_HEADER,
    INTERNAL_CONATION_USER_ID_HEADER as INTERNAL_MACRO_USER_ID_HEADER,
    INTERNAL_FUSIONAUTH_USER_ID_HEADER, InternalAuthorization, InternalEntity, InternalOnly,
    LEGACY_DSS_INTERNAL_API_KEY_HEADER, LEGACY_DSS_INTERNAL_MACRO_USER_ID_HEADER,
    MacroAuthorizationExtractor, MacroAuthorizationRejection, MacroAuthorizationState,
    OptionalMacroAuthorizationExtractor, USER_API_KEY_HEADER, UserBotOrHarness,
    UserBotOrHarnessAuthorization, UserBotOrHarnessEntity, UserOnly, UserOrBot,
    UserOrBotAuthorization, UserOrBotEntity, UserOrInternal, UserOrInternalAuthorization,
    UserOrInternalCaller, UserOrInternalEntity, UserOrInternalService,
    UserOrInternalServiceAuthorization,
};
