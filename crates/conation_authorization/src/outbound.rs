//! Outbound authorization adapters.

/// JWT validation backed by the shared `conation_auth` implementation.
#[cfg(feature = "outbound")]
pub mod conation_auth;
/// JWT validation adapter for internal-only services.
#[cfg(feature = "outbound")]
pub mod noop;
/// PostgreSQL facts for bot authorization.
#[cfg(feature = "postgres")]
pub mod pg_bot_authorization;

/// JWT validator backed by the shared `conation_auth` implementation.
#[cfg(feature = "outbound")]
pub use conation_auth::MacroAuthJwtValidator;
/// JWT validator for services that only support internal authorization.
#[cfg(feature = "outbound")]
pub use noop::NoopMacroAuthJwtValidator;
/// PostgreSQL bot authorization repository and concrete authorizer.
#[cfg(feature = "postgres")]
pub use pg_bot_authorization::{PgBotAuthorizationRepo, PgBotAuthorizer};
