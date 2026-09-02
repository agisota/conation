//! The service itself: verify, resolve, stamp, forward.

use axum::body::{Body, to_bytes};
use bytes::Bytes;
use http::Uri;
use http::header::{AUTHORIZATION, CONTENT_TYPE};
use http_body_util::{BodyExt, Full};

use crate::domain::error::EgressError;
use crate::domain::model::{
    EgressTarget, MAX_MANAGED_MODEL_REQUEST_BYTES, ProxyBody, ProxyRequest, ProxyResponse,
    SessionToken, ensure_method_allowed, normalize_managed_model, sanitize_request_headers,
    sanitize_response_headers,
};
use crate::domain::ports::{
    Forwarder, GithubTokens, ManagedModelCredentials, McpCredentials, SessionAuthority,
};

#[cfg(test)]
mod test;

/// Proxy one request on a sandbox's behalf.
pub trait EgressService: Send + Sync {
    /// Verify `token`, resolve `target` against the session owner's own
    /// connections, and pass `request` through with the upstream credential
    /// stamped on in place of the sandbox's.
    fn proxy(
        &self,
        token: &SessionToken,
        target: EgressTarget,
        request: ProxyRequest,
    ) -> impl Future<Output = Result<ProxyResponse, EgressError>> + Send;
}

/// The service, over its four ports.
pub struct EgressServiceImpl<
    Sessions,
    Credentials,
    Tokens,
    Forward,
    Models = NoManagedModelCredentials,
> {
    sessions: Sessions,
    credentials: Credentials,
    tokens: Tokens,
    models: Models,
    forward: Forward,
}

/// The safe default for existing egress deployments while the managed-model
/// adapter is being configured.
pub struct NoManagedModelCredentials;

impl ManagedModelCredentials for NoManagedModelCredentials {
    async fn resolve(&self) -> Result<crate::domain::model::UpstreamCall, EgressError> {
        Err(EgressError::Unroutable(
            "managed OmniRoute is not configured".to_owned(),
        ))
    }
}

impl<Sessions, Credentials, Tokens, Forward>
    EgressServiceImpl<Sessions, Credentials, Tokens, Forward, NoManagedModelCredentials>
where
    Sessions: SessionAuthority,
    Credentials: McpCredentials,
    Tokens: GithubTokens,
    Forward: Forwarder,
{
    /// Build the service over its adapters.
    pub fn new(
        sessions: Sessions,
        credentials: Credentials,
        tokens: Tokens,
        forward: Forward,
    ) -> Self {
        Self {
            sessions,
            credentials,
            tokens,
            models: NoManagedModelCredentials,
            forward,
        }
    }

    /// Add the deployment-owned managed-model resolver.
    pub fn with_managed_models<ConfiguredModels>(
        self,
        models: ConfiguredModels,
    ) -> EgressServiceImpl<Sessions, Credentials, Tokens, Forward, ConfiguredModels>
    where
        ConfiguredModels: ManagedModelCredentials,
    {
        EgressServiceImpl {
            sessions: self.sessions,
            credentials: self.credentials,
            tokens: self.tokens,
            models,
            forward: self.forward,
        }
    }
}

impl<Sessions, Credentials, Tokens, Forward, Models> EgressService
    for EgressServiceImpl<Sessions, Credentials, Tokens, Forward, Models>
where
    Sessions: SessionAuthority,
    Credentials: McpCredentials,
    Tokens: GithubTokens,
    Models: ManagedModelCredentials,
    Forward: Forwarder,
{
    #[tracing::instrument(skip_all, err, fields(
        destination = ?target,
        method = %request.method(),
        session = tracing::field::Empty,
        owner = tracing::field::Empty,
        upstream_status = tracing::field::Empty,
    ))]
    async fn proxy(
        &self,
        token: &SessionToken,
        target: EgressTarget,
        mut request: ProxyRequest,
    ) -> Result<ProxyResponse, EgressError> {
        ensure_method_allowed(request.method())?;

        // Authorize before resolving: resolution reads the owner's connected
        // servers, and an unverified token must not be able to probe which
        // of those exist.
        let grant = self.sessions.authorize(token).await?;
        let span = tracing::Span::current();
        span.record("session", tracing::field::display(&grant.session));
        span.record("owner", tracing::field::display(&grant.owner));

        let call = match &target {
            EgressTarget::McpServer(destination) => {
                self.credentials.resolve(&grant.owner, destination).await?
            }
            EgressTarget::GitHubGit { endpoint } => {
                // The repository is the grant's, never the request's: a
                // session works on exactly one, and the sandbox has no way to
                // name another because there is no place in the route to put
                // one.
                let base = self.tokens.resolve(&grant.owner, &grant.repo).await?;

                // The endpoint comes from the allowlist, not from the port, so
                // no credential adapter can widen what the sandbox reaches.
                let url = base
                    .url()
                    .join(&endpoint.path_and_query())
                    .map_err(|error| {
                        EgressError::Internal(rootcause::report!(
                            "git endpoint is not a url: {error}"
                        ))
                    })?;
                base.redirected_to(url)?
            }
            EgressTarget::OmniRouteChatCompletions => {
                if request.method() != http::Method::POST {
                    return Err(EgressError::MethodNotAllowed(request.method().clone()));
                }
                request = normalize_managed_model_request(request).await?;
                self.models.resolve().await?
            }
        };

        tracing::info!(
            session = %grant.session,
            owner = %grant.owner,
            upstream = %target.name(),
            method = %request.method(),
            "proxying",
        );

        *request.uri_mut() = call.url().as_str().parse::<Uri>().map_err(|error| {
            EgressError::Internal(rootcause::report!("upstream url is not a uri: {error}"))
        })?;

        // Strip first, stamp second, and never the other way round: the
        // sandbox's own `Authorization` is this session's token, and the
        // strip list contains `authorization` precisely so that no request
        // can carry it upstream. Doing it in this order means the header the
        // upstream sees is the one resolved for the owner, whatever the
        // sandbox sent.
        sanitize_request_headers(request.headers_mut());
        request
            .headers_mut()
            .insert(AUTHORIZATION, call.authorization().header_value()?);
        // Scoping headers are half of the credential - for Pipedream they are
        // what says whose account the bearer spends - so they get the same
        // treatment: stamped from the resolved call after the strip, never
        // taken from the request.
        for (name, value) in call.scope_headers() {
            request.headers_mut().insert(name.clone(), value.clone());
        }

        let mut response = self.forward.forward(request).await?;
        sanitize_response_headers(response.headers_mut());

        tracing::Span::current().record("upstream_status", response.status().as_u16());
        tracing::debug!(status = %response.status(), "upstream answered");

        Ok(response)
    }
}

/// Parse and rewrite a managed chat request without letting its body grow
/// beyond the egress memory budget.
async fn normalize_managed_model_request(
    request: ProxyRequest,
) -> Result<ProxyRequest, EgressError> {
    let (mut parts, body) = request.into_parts();
    let bytes = to_bytes(Body::new(body), MAX_MANAGED_MODEL_REQUEST_BYTES)
        .await
        .map_err(|_| {
            EgressError::Unroutable(format!(
                "managed model request exceeds {MAX_MANAGED_MODEL_REQUEST_BYTES} bytes or is unreadable"
            ))
        })?;
    let mut payload: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| EgressError::Unroutable("managed model request is not JSON".to_owned()))?;
    let model = payload
        .get("model")
        .and_then(serde_json::Value::as_str)
        .and_then(normalize_managed_model)
        .ok_or_else(|| EgressError::Unroutable("managed model is not allowed".to_owned()))?;
    payload["model"] = serde_json::Value::String(model.to_owned());
    let bytes = serde_json::to_vec(&payload).map_err(|error| {
        EgressError::Internal(rootcause::report!(
            "could not encode managed model request: {error}"
        ))
    })?;
    if bytes.len() > MAX_MANAGED_MODEL_REQUEST_BYTES {
        return Err(EgressError::Unroutable(
            "managed model request is too large".to_owned(),
        ));
    }
    parts.headers.remove(http::header::CONTENT_LENGTH);
    parts.headers.insert(
        CONTENT_TYPE,
        http::HeaderValue::from_static("application/json"),
    );
    let body: ProxyBody = Full::new(Bytes::from(bytes))
        .map_err(|never| match never {})
        .boxed_unsync();
    Ok(ProxyRequest::from_parts(parts, body))
}
