use std::collections::HashMap;

use serde::Serialize;

/// Name of a prebuilt Daytona snapshot.
#[derive(Debug, Clone, Serialize)]
#[serde(transparent)]
pub struct Snapshot(String);

impl Snapshot {
    /// Wrap a Daytona snapshot name.
    #[must_use]
    pub fn new(value: String) -> Self {
        Self(value)
    }
}

/// Environment variables injected into a sandbox.
#[derive(Debug, Serialize)]
#[serde(transparent)]
pub struct Env(HashMap<String, String>);

impl From<HashMap<String, String>> for Env {
    fn from(value: HashMap<String, String>) -> Self {
        Self(value)
    }
}

/// Labels attached to a sandbox.
#[derive(Debug, Serialize)]
#[serde(transparent)]
pub struct Labels(HashMap<String, String>);

impl From<HashMap<String, String>> for Labels {
    fn from(value: HashMap<String, String>) -> Self {
        Self(value)
    }
}

/// A sandbox port's externally reachable address.
pub struct PortPreview {
    /// URL the port is reachable at, with no trailing slash.
    pub url: String,
    /// Token expected by the preview proxy, when it requires one.
    pub token: Option<String>,
}

/// API key used to authenticate with Daytona.
#[derive(Clone)]
pub struct DaytonaApiKey(String);

impl DaytonaApiKey {
    /// Wrap a Daytona API credential.
    #[must_use]
    pub fn new(value: String) -> Self {
        Self(value)
    }

    pub(crate) fn expose(&self) -> &str {
        &self.0
    }
}

/// API key sandboxes use to run Conation's OmniRoute models.
///
/// OpenCode's custom `rox` provider reads this value from `ROX_API_KEY`.
/// Empty behaves like absent, so managed sessions cannot prompt until an
/// operator provisions the server-side credential.
#[derive(Clone)]
pub struct RoxApiKey(String);

impl RoxApiKey {
    /// Wrap an OmniRoute API credential.
    #[must_use]
    pub fn new(value: String) -> Self {
        Self(value)
    }

    pub(crate) fn expose(&self) -> &str {
        &self.0
    }
}

/// Settings required to create Daytona-backed containers.
pub struct DaytonaSettings {
    /// Base URL of the Daytona REST API.
    pub api_url: String,
    /// API key used to authenticate with Daytona.
    pub api_key: DaytonaApiKey,
    /// Prebuilt snapshot used to create sandboxes.
    pub snapshot: Snapshot,
    /// Key sandboxes use for Conation's OmniRoute provider.
    pub rox_api_key: RoxApiKey,
}
