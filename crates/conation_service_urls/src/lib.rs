#![deny(missing_docs)]

//! Conation service URL values with per-environment defaults and environment
//! variable overrides.
//!
//! Use [`service_url!`] to define a newtype whose default value is selected
//! from [`conation_env::Environment`]. The generated type also checks an override
//! environment variable derived from the type name. For example,
//! `DocumentStorageServiceUrl` checks `OVERRIDE_DOCUMENT_STORAGE_SERVICE_URL`
//! before falling back to its `local`, `dev`, or `prod` default.

use std::{borrow::Cow, fmt, ops::Deref, str::FromStr};

#[doc(hidden)]
pub use conation_env;
#[doc(hidden)]
pub use paste;
use thiserror::Error;
pub use url::{ParseError as UrlParseError, Url};

#[cfg(test)]
mod test;

#[cfg(test)]
mod testing_harness {
    use super::ServiceUrlVarErr;
    use std::cell::Cell;

    type MockValue = Cell<Option<Box<dyn Fn(&'static str) -> Result<String, std::env::VarError>>>>;

    thread_local! {
        static MOCK_VAR_GETTER: MockValue = const { Cell::new(None) };
        static MOCK_PROFILE_GETTER: MockValue = const { Cell::new(None) };
    }

    struct ResetMockOverrideEnv;

    impl Drop for ResetMockOverrideEnv {
        fn drop(&mut self) {
            MOCK_VAR_GETTER.replace(None);
        }
    }

    struct ResetMockProfileEnv;

    impl Drop for ResetMockProfileEnv {
        fn drop(&mut self) {
            MOCK_PROFILE_GETTER.replace(None);
        }
    }

    #[doc(hidden)]
    #[allow(
        clippy::disallowed_methods,
        reason = "test harness falls back to the process environment when no mock is installed"
    )]
    pub fn read_override_env(var_name: &'static str) -> Result<Option<String>, ServiceUrlVarErr> {
        let cur_getter = MOCK_VAR_GETTER.replace(None);
        match cur_getter {
            Some(mock) => {
                let out = mock(var_name);
                MOCK_VAR_GETTER.replace(Some(mock));
                out
            }
            None => std::env::var(var_name),
        }
        .map(Some)
        .or_else(|err| match err {
            std::env::VarError::NotPresent => Ok(None),
            err => Err(ServiceUrlVarErr { var_name, err }),
        })
    }

    pub(crate) fn with_mock_override_env<F, Cb, U>(f: F, cb: Cb) -> U
    where
        F: Fn(&'static str) -> Result<String, std::env::VarError> + 'static,
        Cb: FnOnce() -> U,
    {
        MOCK_VAR_GETTER.replace(Some(Box::new(f)));
        let _guard = ResetMockOverrideEnv;
        cb()
    }

    #[allow(
        clippy::disallowed_methods,
        reason = "test harness falls back to the process environment when no mock is installed"
    )]
    pub(super) fn read_service_url_profile_env() -> Result<Option<String>, std::env::VarError> {
        let cur_getter = MOCK_PROFILE_GETTER.replace(None);
        match cur_getter {
            Some(mock) => {
                let out = mock(super::SERVICE_URL_PROFILE_ENV_VAR);
                MOCK_PROFILE_GETTER.replace(Some(mock));
                out
            }
            None => std::env::var(super::SERVICE_URL_PROFILE_ENV_VAR),
        }
        .map(Some)
        .or_else(|err| match err {
            std::env::VarError::NotPresent => Ok(None),
            err => Err(err),
        })
    }

    pub(crate) fn with_mock_service_url_profile_env<F, Cb, U>(f: F, cb: Cb) -> U
    where
        F: Fn(&'static str) -> Result<String, std::env::VarError> + 'static,
        Cb: FnOnce() -> U,
    {
        MOCK_PROFILE_GETTER.replace(Some(Box::new(f)));
        let _guard = ResetMockProfileEnv;
        cb()
    }
}

#[cfg(test)]
#[doc(hidden)]
pub use testing_harness::read_override_env;

/// Read an override environment variable for a service URL.
#[cfg(not(test))]
#[doc(hidden)]
#[allow(
    clippy::disallowed_methods,
    reason = "Used when running locally to override service urls"
)]
pub fn read_override_env(var_name: &'static str) -> Result<Option<String>, ServiceUrlVarErr> {
    std::env::var(var_name).map(Some).or_else(|err| match err {
        std::env::VarError::NotPresent => Ok(None),
        err => Err(ServiceUrlVarErr { var_name, err }),
    })
}

#[cfg(test)]
fn read_service_url_profile_env() -> Result<Option<String>, std::env::VarError> {
    testing_harness::read_service_url_profile_env()
}

#[cfg(not(test))]
#[allow(
    clippy::disallowed_methods,
    reason = "Used when running locally to select the service URL profile"
)]
fn read_service_url_profile_env() -> Result<Option<String>, std::env::VarError> {
    std::env::var(SERVICE_URL_PROFILE_ENV_VAR)
        .map(Some)
        .or_else(|err| match err {
            std::env::VarError::NotPresent => Ok(None),
            err => Err(err),
        })
}

/// A service URL string that can either borrow an existing string slice or own
/// a runtime override value.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ServiceUrl<'a>(Cow<'a, str>);

impl<'a> ServiceUrl<'a> {
    /// Create a service URL that borrows a string slice.
    pub const fn borrowed(url: &'a str) -> Self {
        Self(Cow::Borrowed(url))
    }

    /// Create a service URL that owns a runtime string.
    pub fn owned(url: impl Into<String>) -> ServiceUrl<'static> {
        ServiceUrl(Cow::Owned(url.into()))
    }

    /// Return the URL as a string slice.
    pub fn as_str(&self) -> &str {
        self.0.as_ref()
    }

    /// Parse the URL string into a [`Url`].
    pub fn parse_url(&self) -> Result<Url, UrlParseError> {
        Url::parse(self.as_str())
    }

    /// Return a cheaply copied borrowed view of this URL.
    pub fn copied(&self) -> ServiceUrl<'_> {
        ServiceUrl(Cow::Borrowed(self.as_str()))
    }

    /// Convert this URL into an owned `'static` value.
    pub fn into_owned(self) -> ServiceUrl<'static> {
        ServiceUrl(Cow::Owned(self.0.into_owned()))
    }

    /// Convert this URL into its internal [`Cow`].
    pub fn into_cow(self) -> Cow<'a, str> {
        self.0
    }

    /// Return the borrowed string if this URL is currently borrowed.
    pub fn borrowed_inner(&self) -> Option<&'a str> {
        match &self.0 {
            Cow::Borrowed(url) => Some(*url),
            Cow::Owned(_) => None,
        }
    }

    /// Return the owned string if this URL is currently owned.
    pub fn owned_inner(&self) -> Option<&String> {
        match &self.0 {
            Cow::Borrowed(_) => None,
            Cow::Owned(url) => Some(url),
        }
    }
}

impl<'a> From<&'a str> for ServiceUrl<'a> {
    fn from(value: &'a str) -> Self {
        Self::borrowed(value)
    }
}

impl From<String> for ServiceUrl<'static> {
    fn from(value: String) -> Self {
        Self(Cow::Owned(value))
    }
}

impl<'a> From<Cow<'a, str>> for ServiceUrl<'a> {
    fn from(value: Cow<'a, str>) -> Self {
        Self(value)
    }
}

impl<'a> From<ServiceUrl<'a>> for String {
    fn from(value: ServiceUrl<'a>) -> Self {
        value.0.into_owned()
    }
}

impl<'a> Deref for ServiceUrl<'a> {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        self.as_str()
    }
}

impl<'a> AsRef<str> for ServiceUrl<'a> {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl<'a> fmt::Display for ServiceUrl<'a> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Error returned when a service URL override environment variable cannot be
/// read.
#[derive(Debug, Error)]
#[error("failed to read service URL override env var `{var_name}`: {err}")]
pub struct ServiceUrlVarErr {
    var_name: &'static str,
    #[source]
    err: std::env::VarError,
}

impl ServiceUrlVarErr {
    /// The environment variable name that failed to load.
    pub const fn var_name(&self) -> &'static str {
        self.var_name
    }

    /// The underlying environment-variable error.
    pub const fn env_var_error(&self) -> &std::env::VarError {
        &self.err
    }
}

/// Environment variable that selects how service URLs are resolved.
pub const SERVICE_URL_PROFILE_ENV_VAR: &str = "CONATION_SERVICE_URL_PROFILE";

/// The service URL resolution contract to use for the current deployment.
///
/// [`ServiceUrlProfile::Managed`] preserves the historical behavior: an
/// `OVERRIDE_*` value is used when present and otherwise the selected
/// environment default is used. [`ServiceUrlProfile::StrictSelfHost`] is an
/// explicit standalone deployment mode. It requires an override for every
/// resolved URL and validates that override before it is used.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ServiceUrlProfile {
    /// Preserve the managed-service defaults and optional overrides.
    #[default]
    Managed,
    /// Require validated standalone/self-hosted overrides for every service URL.
    StrictSelfHost,
}

impl ServiceUrlProfile {
    /// Resolve the profile from [`SERVICE_URL_PROFILE_ENV_VAR`].
    ///
    /// An unset value and the literal `managed` both select
    /// [`ServiceUrlProfile::Managed`]. The only other accepted value is
    /// `strict-self-host`.
    pub fn from_env() -> Result<Self, ServiceUrlResolutionError> {
        match read_service_url_profile_env() {
            Ok(None) => Ok(Self::Managed),
            Ok(Some(value)) => value
                .parse()
                .map_err(ServiceUrlResolutionError::InvalidProfile),
            Err(err) => Err(ServiceUrlResolutionError::ProfileEnv {
                var_name: SERVICE_URL_PROFILE_ENV_VAR,
                err,
            }),
        }
    }
}

/// Error returned when [`ServiceUrlProfile`] receives an unsupported value.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[error(
    "invalid `{SERVICE_URL_PROFILE_ENV_VAR}` value `{value}`; expected `managed` or `strict-self-host`"
)]
pub struct UnknownServiceUrlProfile {
    value: String,
}

impl UnknownServiceUrlProfile {
    /// Return the unsupported profile value.
    pub fn value(&self) -> &str {
        &self.value
    }
}

impl FromStr for ServiceUrlProfile {
    type Err = UnknownServiceUrlProfile;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "managed" => Ok(Self::Managed),
            "strict-self-host" => Ok(Self::StrictSelfHost),
            _ => Err(UnknownServiceUrlProfile {
                value: value.to_owned(),
            }),
        }
    }
}

/// The reason a strict self-hosted service URL override was rejected.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum StrictSelfHostUrlError {
    /// The value is not an absolute URL with an authority and host.
    #[error("must be an absolute URL with a host")]
    NotAbsolute,
    /// The URL scheme does not match the service transport.
    #[error("uses scheme `{actual}`; expected {expected}")]
    UnsupportedScheme {
        /// The parsed scheme in the supplied URL.
        actual: String,
        /// The permitted scheme pair for the service transport.
        expected: &'static str,
    },
    /// The URL contains a username or password.
    #[error("must not contain userinfo")]
    UserInfo,
    /// The URL contains a query string.
    #[error("must not contain a query string")]
    Query,
    /// The URL contains a fragment.
    #[error("must not contain a fragment")]
    Fragment,
    /// The URL points at a managed Macro domain instead of a standalone host.
    #[error("host `{host}` is a forbidden managed Macro domain")]
    ForbiddenManagedHost {
        /// The parsed hostname that is forbidden in strict self-host mode.
        host: String,
    },
}

/// Error returned while resolving a service URL under the selected profile.
#[derive(Debug, Error)]
pub enum ServiceUrlResolutionError {
    /// An override environment variable could not be read.
    #[error(transparent)]
    OverrideEnv(#[from] ServiceUrlVarErr),
    /// The URL-profile environment variable could not be read.
    #[error("failed to read service URL profile env var `{var_name}`: {err}")]
    ProfileEnv {
        /// The profile environment variable name.
        var_name: &'static str,
        /// The underlying environment-variable error.
        #[source]
        err: std::env::VarError,
    },
    /// The URL-profile environment variable has an unsupported value.
    #[error(transparent)]
    InvalidProfile(UnknownServiceUrlProfile),
    /// A strict self-hosted URL profile was selected without the required override.
    #[error("strict self-host profile requires `{var_name}`")]
    MissingOverride {
        /// The required service URL override environment variable.
        var_name: &'static str,
    },
    /// A strict self-hosted service URL override failed validation.
    #[error("invalid strict self-host URL in `{var_name}` (`{value}`): {reason}")]
    InvalidOverrideUrl {
        /// The override environment variable containing the URL.
        var_name: &'static str,
        /// The rejected URL value.
        value: String,
        /// The validation failure.
        reason: StrictSelfHostUrlError,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ServiceUrlTransport {
    Http,
    Websocket,
}

impl ServiceUrlTransport {
    fn from_default_url(default_url: &str) -> Self {
        let parsed = Url::parse(default_url)
            .expect("service_url! defaults must be absolute URLs with an http(s) or ws(s) scheme");

        match parsed.scheme() {
            "http" | "https" => Self::Http,
            "ws" | "wss" => Self::Websocket,
            _ => panic!("service_url! defaults must use an http(s) or ws(s) scheme"),
        }
    }

    const fn expected_schemes(self) -> &'static str {
        match self {
            Self::Http => "`http` or `https`",
            Self::Websocket => "`ws` or `wss`",
        }
    }

    fn accepts(self, scheme: &str) -> bool {
        match self {
            Self::Http => matches!(scheme, "http" | "https"),
            Self::Websocket => matches!(scheme, "ws" | "wss"),
        }
    }
}

fn contains_userinfo(value: &str) -> bool {
    value
        .split_once("://")
        .and_then(|(_, rest)| rest.split(['/', '?', '#']).next())
        .is_some_and(|authority| authority.contains('@'))
}

fn is_forbidden_managed_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();

    ["macro.com", "macroverse.workers.dev"]
        .into_iter()
        .any(|forbidden| {
            host == forbidden
                || host
                    .strip_suffix(forbidden)
                    .is_some_and(|prefix| prefix.ends_with('.'))
        })
}

fn invalid_override_url(
    var_name: &'static str,
    value: &str,
    reason: StrictSelfHostUrlError,
) -> ServiceUrlResolutionError {
    ServiceUrlResolutionError::InvalidOverrideUrl {
        var_name,
        value: value.to_owned(),
        reason,
    }
}

fn validate_strict_self_host_url(
    var_name: &'static str,
    value: &str,
    default_url: &str,
) -> Result<(), ServiceUrlResolutionError> {
    let url = Url::parse(value)
        .map_err(|_| invalid_override_url(var_name, value, StrictSelfHostUrlError::NotAbsolute))?;

    if !value.contains("://") || !url.has_host() {
        return Err(invalid_override_url(
            var_name,
            value,
            StrictSelfHostUrlError::NotAbsolute,
        ));
    }

    let transport = ServiceUrlTransport::from_default_url(default_url);
    if !transport.accepts(url.scheme()) {
        return Err(invalid_override_url(
            var_name,
            value,
            StrictSelfHostUrlError::UnsupportedScheme {
                actual: url.scheme().to_owned(),
                expected: transport.expected_schemes(),
            },
        ));
    }

    if contains_userinfo(value) || !url.username().is_empty() || url.password().is_some() {
        return Err(invalid_override_url(
            var_name,
            value,
            StrictSelfHostUrlError::UserInfo,
        ));
    }

    if url.query().is_some() {
        return Err(invalid_override_url(
            var_name,
            value,
            StrictSelfHostUrlError::Query,
        ));
    }

    if url.fragment().is_some() {
        return Err(invalid_override_url(
            var_name,
            value,
            StrictSelfHostUrlError::Fragment,
        ));
    }

    let host = url.host_str().expect("URL host was checked above");
    if is_forbidden_managed_host(host) {
        return Err(invalid_override_url(
            var_name,
            value,
            StrictSelfHostUrlError::ForbiddenManagedHost {
                host: host.to_owned(),
            },
        ));
    }

    Ok(())
}

/// Resolve one service URL with the supplied deterministic profile.
///
/// This function is public only because [`service_url!`] can expand in a
/// downstream crate. Prefer the generated `new_*` constructors on the typed
/// URL instead.
#[doc(hidden)]
pub fn resolve_service_url(
    profile: ServiceUrlProfile,
    override_env_var_name: &'static str,
    default_url: &'static str,
) -> Result<ServiceUrl<'static>, ServiceUrlResolutionError> {
    match read_override_env(override_env_var_name)? {
        Some(value) => {
            if profile == ServiceUrlProfile::StrictSelfHost {
                validate_strict_self_host_url(override_env_var_name, &value, default_url)?;
            }

            Ok(ServiceUrl::owned(value))
        }
        None if profile == ServiceUrlProfile::StrictSelfHost => {
            Err(ServiceUrlResolutionError::MissingOverride {
                var_name: override_env_var_name,
            })
        }
        None => Ok(ServiceUrl::borrowed(default_url)),
    }
}

/// Define typed service URL values with per-environment defaults and override
/// environment variables.
///
/// The override environment variable name is derived from the struct name:
/// `DocumentStorageServiceUrl` checks `OVERRIDE_DOCUMENT_STORAGE_SERVICE_URL`.
/// If that override is not set, [`conation_env::Environment`] selects one of the
/// provided `local`, `dev`, or `prod` defaults.
///
/// # Example
///
/// ```
/// fn document_storage_service_url_example() -> Result<(), conation_service_urls::ServiceUrlResolutionError> {
///     conation_service_urls::service_url! {
///         #[derive(Debug, Clone)]
///         pub struct DocumentStorageServiceUrl {
///             local: "http://localhost:8086",
///             dev: "https://cloud-storage-dev.macro.com",
///             prod: "https://cloud-storage.macro.com",
///         }
///     }
///
///     let url = DocumentStorageServiceUrl::new()?;
///     assert_eq!(
///         url.override_env_var_name(),
///         "OVERRIDE_DOCUMENT_STORAGE_SERVICE_URL",
///     );
///
///     Ok(())
/// }
///
/// document_storage_service_url_example().unwrap();
/// ```
#[macro_export]
macro_rules! service_url {
    (
        $(#[$attr:meta])*
        $v:vis struct $n:ident {
            local: $local:literal,
            dev: $dev:literal,
            prod: $prod:literal $(,)?
        }
    ) => {
        $crate::paste::paste! {
            #[doc = "Typed service URL loaded from `OVERRIDE_" $n:snake:upper "` or selected from per-environment defaults."]
            $(#[$attr])*
            $v struct $n($crate::ServiceUrl<'static>);

            impl $n {
                #[doc = "Override environment variable checked before falling back to per-environment defaults."]
                $v const OVERRIDE_ENV_VAR_NAME: &'static str = concat!("OVERRIDE_", stringify!([<$n:snake:upper>]));

                #[doc = "Default URL for [`conation_env::Environment::Local`]."]
                $v const LOCAL: &'static str = $local;

                #[doc = "Default URL for [`conation_env::Environment::Develop`]."]
                $v const DEV: &'static str = $dev;

                #[doc = "Default URL for [`conation_env::Environment::Production`]."]
                $v const PROD: &'static str = $prod;

                #[doc = "Create a new instance of [`Self`] using the profile selected by `CONATION_SERVICE_URL_PROFILE`."]
                #[allow(dead_code)]
                $v fn new() -> Result<Self, $crate::ServiceUrlResolutionError> {
                    Self::new_with_profile($crate::ServiceUrlProfile::from_env()?)
                }

                #[doc = "Create a new instance of [`Self`], panicking if its profile or URL resolution fails."]
                #[allow(dead_code)]
                $v fn unwrap_new() -> Self {
                    Self::new().expect(concat!("Failed to resolve service URL for ", stringify!($n)))
                }

                #[doc = "Create a new instance of [`Self`] for the current environment using an explicit profile."]
                #[allow(dead_code)]
                $v fn new_with_profile(profile: $crate::ServiceUrlProfile) -> Result<Self, $crate::ServiceUrlResolutionError> {
                    let environment = $crate::conation_env::Environment::new_or_prod();
                    Self::new_for_environment_with_profile(environment, profile)
                }

                #[doc = "Create a new instance of [`Self`] for a specific environment using the profile selected by `CONATION_SERVICE_URL_PROFILE`."]
                #[allow(dead_code)]
                $v fn new_for_environment(environment: $crate::conation_env::Environment) -> Result<Self, $crate::ServiceUrlResolutionError> {
                    Self::new_for_environment_with_profile(environment, $crate::ServiceUrlProfile::from_env()?)
                }

                #[doc = "Create a new instance of [`Self`] for a specific environment using an explicit deterministic profile."]
                #[allow(dead_code)]
                $v fn new_for_environment_with_profile(
                    environment: $crate::conation_env::Environment,
                    profile: $crate::ServiceUrlProfile,
                ) -> Result<Self, $crate::ServiceUrlResolutionError> {
                    let default_url = match environment {
                        $crate::conation_env::Environment::Local => Self::LOCAL,
                        $crate::conation_env::Environment::Develop => Self::DEV,
                        $crate::conation_env::Environment::Production => Self::PROD,
                    };

                    Ok(Self($crate::resolve_service_url(
                        profile,
                        Self::OVERRIDE_ENV_VAR_NAME,
                        default_url,
                    )?))
                }

                #[doc = "Create a new instance of [`Self`] for a specific environment without checking the override env var."]
                #[allow(dead_code)]
                $v const fn default_for_environment(environment: $crate::conation_env::Environment) -> Self {
                    match environment {
                        $crate::conation_env::Environment::Local => Self::from_static(Self::LOCAL),
                        $crate::conation_env::Environment::Develop => Self::from_static(Self::DEV),
                        $crate::conation_env::Environment::Production => Self::from_static(Self::PROD),
                    }
                }

                #[doc = "Create a new instance of [`Self`] from the local default URL."]
                #[allow(dead_code)]
                $v const fn local() -> Self {
                    Self::from_static(Self::LOCAL)
                }

                #[doc = "Create a new instance of [`Self`] from the dev default URL."]
                #[allow(dead_code)]
                $v const fn dev() -> Self {
                    Self::from_static(Self::DEV)
                }

                #[doc = "Create a new instance of [`Self`] from the prod default URL."]
                #[allow(dead_code)]
                $v const fn prod() -> Self {
                    Self::from_static(Self::PROD)
                }

                #[doc = "Create a new instance of [`Self`] from a static URL."]
                #[allow(dead_code)]
                $v const fn from_static(url: &'static str) -> Self {
                    Self($crate::ServiceUrl::borrowed(url))
                }

                #[doc = "Create a new instance of [`Self`] from an owned runtime URL."]
                #[allow(dead_code)]
                $v fn from_owned(url: impl Into<String>) -> Self {
                    Self($crate::ServiceUrl::owned(url))
                }

                #[doc = "Return the override environment variable name checked by [`Self::new`]."]
                #[allow(dead_code)]
                $v const fn override_env_var_name(&self) -> &'static str {
                    Self::OVERRIDE_ENV_VAR_NAME
                }

                #[doc = "Return the contained [`ServiceUrl`]."]
                #[allow(dead_code)]
                $v fn into_inner(self) -> $crate::ServiceUrl<'static> {
                    self.0
                }

                #[doc = "Return a reference to the contained [`ServiceUrl`]."]
                #[allow(dead_code)]
                $v fn inner(&self) -> &$crate::ServiceUrl<'static> {
                    &self.0
                }

                #[doc = "Return the URL as a string slice."]
                #[allow(dead_code)]
                $v fn as_str(&self) -> &str {
                    self.0.as_str()
                }

                #[doc = "Parse the URL string into a URL."]
                #[allow(dead_code)]
                $v fn parse_url(&self) -> Result<$crate::Url, $crate::UrlParseError> {
                    self.0.parse_url()
                }

                #[doc = "Return a cheaply copied borrowed view of this URL."]
                #[allow(dead_code)]
                $v fn copied(&self) -> $crate::ServiceUrl<'_> {
                    self.0.copied()
                }
            }

            impl std::ops::Deref for $n {
                type Target = str;

                fn deref(&self) -> &Self::Target {
                    self.as_str()
                }
            }

            impl std::convert::AsRef<str> for $n {
                fn as_ref(&self) -> &str {
                    self.as_str()
                }
            }

            impl std::fmt::Display for $n {
                fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                    f.write_str(self.as_str())
                }
            }

            impl std::convert::From<$crate::ServiceUrl<'static>> for $n {
                fn from(value: $crate::ServiceUrl<'static>) -> Self {
                    Self(value)
                }
            }

            impl std::convert::From<$n> for $crate::ServiceUrl<'static> {
                fn from(value: $n) -> Self {
                    value.0
                }
            }

            impl std::convert::From<String> for $n {
                fn from(value: String) -> Self {
                    Self::from_owned(value)
                }
            }

            impl std::convert::From<&'static str> for $n {
                fn from(value: &'static str) -> Self {
                    Self::from_static(value)
                }
            }
        }
    };
    (
        $(#[$attr:meta])*
        $v:vis struct $n:ident {
            $(
                $(#[$field_attr:meta])*
                $field_vis:vis $field_name:ident {
                    local: $field_local:literal,
                    dev: $field_dev:literal,
                    prod: $field_prod:literal $(,)?
                }
            ),* $(,)?
        }
    ) => {
        $crate::paste::paste! {
            $(
                $crate::service_url!(
                    $(#[$field_attr])*
                    $field_vis struct $field_name {
                        local: $field_local,
                        dev: $field_dev,
                        prod: $field_prod,
                    }
                );
            )*

            #[doc = "A collection of typed service URLs."]
            $(#[$attr])*
            $v struct $n {
                $(
                    #[doc = "Typed service URL loaded from `OVERRIDE_" $field_name:snake:upper "` or selected from per-environment defaults."]
                    $field_vis [<$field_name:snake>]: $field_name,
                )*
            }

            impl $n {
                #[doc = "Create a new instance of [`Self`] with all service URLs resolved using the profile selected by `CONATION_SERVICE_URL_PROFILE`."]
                #[allow(dead_code)]
                $v fn new() -> Result<Self, $crate::ServiceUrlResolutionError> {
                    Self::new_with_profile($crate::ServiceUrlProfile::from_env()?)
                }

                #[doc = "Create a new instance of [`Self`] with all service URLs resolved for the current environment using an explicit profile."]
                #[allow(dead_code)]
                $v fn new_with_profile(profile: $crate::ServiceUrlProfile) -> Result<Self, $crate::ServiceUrlResolutionError> {
                    let environment = $crate::conation_env::Environment::new_or_prod();
                    Self::new_for_environment_with_profile(environment, profile)
                }

                #[doc = "Create a new instance of [`Self`] with all service URLs resolved for the current environment, panicking if profile or URL resolution fails."]
                #[allow(dead_code)]
                $v fn unwrap_new() -> Self {
                    Self::new().expect(concat!("Failed to resolve service URL collection for ", stringify!($n)))
                }

                #[doc = "Create a new instance of [`Self`] with all service URLs resolved for a specific environment using the profile selected by `CONATION_SERVICE_URL_PROFILE`."]
                #[allow(dead_code)]
                $v fn new_for_environment(environment: $crate::conation_env::Environment) -> Result<Self, $crate::ServiceUrlResolutionError> {
                    Self::new_for_environment_with_profile(environment, $crate::ServiceUrlProfile::from_env()?)
                }

                #[doc = "Create a new instance of [`Self`] with all service URLs resolved for a specific environment using an explicit deterministic profile."]
                #[allow(dead_code)]
                $v fn new_for_environment_with_profile(
                    environment: $crate::conation_env::Environment,
                    profile: $crate::ServiceUrlProfile,
                ) -> Result<Self, $crate::ServiceUrlResolutionError> {
                    Ok(Self {
                        $(
                            [<$field_name:snake>]: $field_name::new_for_environment_with_profile(environment, profile)?,
                        )*
                    })
                }

                #[doc = "Create a new instance of [`Self`] with all service URLs set to environment defaults without checking overrides."]
                #[allow(dead_code)]
                $v const fn default_for_environment(environment: $crate::conation_env::Environment) -> Self {
                    Self {
                        $(
                            [<$field_name:snake>]: $field_name::default_for_environment(environment),
                        )*
                    }
                }
            }
        }
    };
}

service_url! {
    /// Common service URLs used by Conation services.
    pub struct ServiceUrls {
        /// Main app URL.
        pub AppServiceUrl {
            local: "http://localhost:3000",
            dev: "https://dev.macro.com",
            prod: "https://macro.com",
        },
        /// Authentication service API URL.
        pub AuthServiceUrl {
            local: "http://localhost:8080",
            dev: "https://auth-service-dev.macro.com",
            prod: "https://auth-service.macro.com",
        },
        /// PDF rendering service API URL.
        pub PdfServiceUrl {
            local: "http://localhost:4567",
            dev: "https://pdf-service-dev.macro.com",
            prod: "https://pdf-service.macro.com",
        },
        /// Document storage service API URL.
        pub DocumentStorageServiceUrl {
            local: "http://localhost:8086",
            dev: "https://cloud-storage-dev.macro.com",
            prod: "https://cloud-storage.macro.com",
        },
        /// WebSocket service URL.
        pub WebsocketServiceUrl {
            local: "ws://localhost:6969",
            dev: "wss://services-dev.macro.com",
            prod: "wss://services.macro.com",
        },
        /// Connection gateway HTTP API URL.
        pub ConnectionGatewayUrl {
            local: "http://localhost:8082",
            dev: "https://connection-gateway-dev.macro.com",
            prod: "https://connection-gateway.macro.com",
        },
        /// Connection gateway WebSocket URL.
        pub ConnectionGatewayWebsocketUrl {
            local: "ws://localhost:8082",
            dev: "wss://connection-gateway-dev.macro.com",
            prod: "wss://connection-gateway.macro.com",
        },
        /// Agent proxy WebSocket URL (the shared runtime endpoint external
        /// agent runtimes dial). Unused: its service is gone, and the URL
        /// stays only until the deployed stack behind it is torn down.
        pub AgentProxyWebsocketUrl {
            local: "ws://localhost:8091",
            dev: "wss://agent-proxy-dev.macro.com",
            prod: "wss://agent-proxy.macro.com",
        },
        /// Document cognition service API URL.
        pub DocumentCognitionServiceUrl {
            local: "http://localhost:8085",
            dev: "https://document-cognition-dev.macro.com",
            prod: "https://document-cognition.macro.com",
        },
        /// Notification service API URL.
        pub NotificationServiceUrl {
            local: "http://localhost:8089",
            dev: "https://notifications-dev.conation.dev",
            prod: "https://notifications.conation.dev",
        },
        /// Static file service/CDN URL.
        pub StaticFileServiceUrl {
            local: "http://localhost:8100",
            dev: "https://static-file-service-dev.macro.com",
            prod: "https://static-file-service.macro.com",
        },
        /// Agent harness service API URL. Serves the agent-session control
        /// routes, which run in the process that owns the live sessions.
        pub AgentHarnessServiceUrl {
            local: "http://localhost:8101",
            dev: "https://agent-harness-dev.macro.com",
            prod: "https://agent-harness.macro.com",
        },
        /// Link unfurl service API URL.
        pub UnfurlServiceUrl {
            local: "http://localhost:8095",
            dev: "https://unfurl-service-dev.macro.com",
            prod: "https://unfurl-service.macro.com",
        },
        /// Contacts service API URL.
        pub ContactsServiceUrl {
            local: "http://localhost:8083",
            dev: "https://contacts-dev.macro.com",
            prod: "https://contacts.macro.com",
        },
        /// Email service API URL.
        pub EmailServiceUrl {
            local: "http://localhost:8087",
            dev: "https://email-service-dev.macro.com",
            prod: "https://email-service.macro.com",
        },
        /// Image proxy service API URL.
        pub ImageProxyServiceUrl {
            local: "http://localhost:8097",
            dev: "https://image-proxy-dev.macro.com",
            prod: "https://image-proxy.macro.com",
        },
        /// Lexical conversion service API URL.
        pub LexicalServiceUrl {
            local: "http://localhost:8096",
            dev: "https://lexical-service-dev.macroverse.workers.dev",
            prod: "https://lexical-service-prod.macroverse.workers.dev",
        },
        /// Sync service API URL.
        pub SyncServiceUrl {
            local: "http://localhost:8787",
            dev: "https://sync-service-dev3.macroverse.workers.dev",
            prod: "https://sync-service-prod2.macroverse.workers.dev",
        },
        /// AI editing worker API URL.
        pub AiEditingWorkerUrl {
            local: "http://localhost:8933",
            dev: "https://ai-editing-worker-dev.macroverse.workers.dev",
            prod: "https://ai-editing-worker.macroverse.workers.dev",
        },
    }
}
