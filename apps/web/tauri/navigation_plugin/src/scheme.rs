use std::ops::Deref;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(transparent)]
#[non_exhaustive]
pub struct MacroScheme(pub Url);

impl MacroScheme {
    pub fn new(url: Url) -> Result<Self, SchemeError> {
        Self::new_with_scheme(url, "conation")
    }

    pub fn new_with_scheme(url: Url, expected_scheme: &str) -> Result<Self, SchemeError> {
        if url.scheme() != expected_scheme {
            return Err(SchemeError::InvalidScheme {
                expected: expected_scheme.to_string(),
                found: url.scheme().to_string(),
            });
        }
        Ok(Self(url))
    }

    /// Turn an http(s) URL into the canonical Conation scheme URL.
    #[tracing::instrument(err, ret)]
    pub fn from_url(url: &Url) -> Result<Self, SchemeError> {
        Self::from_url_with_scheme(url, "conation")
    }

    pub fn from_url_with_scheme(url: &Url, app_scheme: &str) -> Result<Self, SchemeError> {
        let ("http" | "https" | "tauri") = url.scheme() else {
            return Err(SchemeError::InvalidScheme {
                expected: "http(s) or tauri".to_string(),
                found: url.scheme().to_string(),
            });
        };

        let mut rest = url.fragment().unwrap_or(url.path()).trim_start_matches('/');
        // Mobile router uses '/' as base, so strip the 'app' prefix from universal links
        if let Some(stripped) = rest.strip_prefix("app/") {
            rest = stripped;
        } else if rest == "app" {
            rest = "";
        }
        let query = url.query();
        let inner = match query {
            Some(q) => format!("{app_scheme}:///{rest}?{q}"),
            None => format!("{app_scheme}:///{rest}"),
        }
        .parse::<Url>()?;
        Ok(MacroScheme(inner))
    }
}

impl AsRef<str> for MacroScheme {
    fn as_ref(&self) -> &str {
        self.0.as_str()
    }
}

impl Deref for MacroScheme {
    type Target = Url;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[derive(Debug, Error)]
pub enum SchemeError {
    #[error("The input url did not have a fragment")]
    MissingPathOrFragment,
    #[error("{0}")]
    Parse(#[from] url::ParseError),
    #[error("Invalid scheme received. Expected {expected}, found {found}")]
    InvalidScheme { expected: String, found: String },
}
