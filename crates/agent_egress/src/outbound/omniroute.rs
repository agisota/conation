//! Deployment-owned credential for Conation's managed OmniRoute endpoint.

use url::Url;

use crate::domain::error::EgressError;
use crate::domain::model::{BearerToken, UpstreamCall};
use crate::domain::ports::ManagedModelCredentials;

/// Resolves the one OmniRoute endpoint the sandbox-facing route may call.
///
/// The URL comes only from deployment configuration.  Sandboxes cannot name a
/// host or endpoint; the service appends the fixed OpenAI-compatible path.
pub struct OmniRouteCredentials {
    base_url: Url,
    token: Option<BearerToken>,
}

impl OmniRouteCredentials {
    /// Create a credential resolver over an HTTPS OmniRoute origin.
    pub fn new(base_url: Url, token: BearerToken) -> Result<Self, EgressError> {
        if base_url.scheme() != "https"
            || base_url.host_str().is_none()
            || base_url.username() != ""
            || base_url.password().is_some()
            || base_url.query().is_some()
            || base_url.fragment().is_some()
        {
            return Err(EgressError::InsecureUpstream(base_url));
        }

        let mut base_url = base_url;
        base_url.set_path("/");
        // An empty deployment secret deliberately leaves this target unarmed,
        // rather than producing the credential-less `Bearer ` header.
        let token = (!token.as_str().trim().is_empty()).then_some(token);
        Ok(Self { base_url, token })
    }
}

impl ManagedModelCredentials for OmniRouteCredentials {
    async fn resolve(&self) -> Result<UpstreamCall, EgressError> {
        let url = self.base_url.join("v1/chat/completions").map_err(|error| {
            EgressError::Internal(rootcause::report!(
                "managed OmniRoute endpoint is not a url: {error}"
            ))
        })?;
        let token = self.token.clone().ok_or_else(|| {
            EgressError::Unroutable("managed OmniRoute is not configured".to_owned())
        })?;
        UpstreamCall::bearer(url, token)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::domain::error::EgressError;
    use crate::domain::model::BearerToken;
    use url::Url;

    #[tokio::test]
    async fn an_empty_token_fails_closed() {
        let credentials = OmniRouteCredentials::new(
            Url::parse("https://api.rox.one").expect("url"),
            BearerToken::new("  "),
        )
        .expect("https origin is accepted");
        let error = credentials.resolve().await.expect_err("unarmed");
        assert!(matches!(error, EgressError::Unroutable(_)));
    }
}
