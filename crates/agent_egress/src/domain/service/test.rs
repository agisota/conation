use super::*;
use crate::domain::model::{
    AgentSessionId, BearerToken, GitEndpoint, GitService, McpDestination, McpServerSlug, ProxyBody,
    RepoSlug, SessionGrant, UpstreamCall, UpstreamCredential,
};
use bytes::Bytes;
use conation_user_id::user_id::MacroUserIdStr;
use http::header::{AUTHORIZATION, HeaderMap, HeaderName, HeaderValue};
use http::{Method, StatusCode};
use http_body_util::{BodyExt, Empty, Full};
use std::sync::Mutex;
use url::Url;

fn owner() -> MacroUserIdStr<'static> {
    MacroUserIdStr::try_from_email("owner@example.com").expect("a valid user id")
}

fn empty_body() -> ProxyBody {
    Empty::new().map_err(|never| match never {}).boxed_unsync()
}

fn header_map(pairs: &[(&str, &str)]) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (name, value) in pairs {
        headers.append(
            HeaderName::from_bytes(name.as_bytes()).expect("header name"),
            HeaderValue::from_str(value).expect("header value"),
        );
    }
    headers
}

fn names(headers: &HeaderMap) -> Vec<&str> {
    headers.keys().map(HeaderName::as_str).collect()
}

fn session_repo() -> RepoSlug {
    RepoSlug::parse("macro", "wolf").expect("slug")
}

/// Verifies whatever token it is given, unless built to refuse.
struct StubSessions(Result<SessionGrant, ()>);

impl StubSessions {
    fn granting() -> Self {
        Self(Ok(SessionGrant {
            session: AgentSessionId::new(),
            owner: owner(),
            repo: session_repo(),
        }))
    }

    fn refusing() -> Self {
        Self(Err(()))
    }
}

impl SessionAuthority for StubSessions {
    async fn authorize(&self, _token: &SessionToken) -> Result<SessionGrant, EgressError> {
        self.0
            .clone()
            .map_err(|()| EgressError::Unauthenticated("unknown session token"))
    }
}

/// Records who it was asked about, and answers with a fixed upstream.
struct SpyCredentials {
    asked: Mutex<Vec<(String, String)>>,
    known: bool,
    url: String,
    scope: HeaderMap,
}

impl SpyCredentials {
    fn knowing() -> Self {
        Self::at("https://mcp.example.com/mcp")
    }

    /// A server whose stored URL is whatever the owner typed in.
    fn at(url: &str) -> Self {
        Self {
            asked: Mutex::default(),
            known: true,
            url: url.to_owned(),
            scope: HeaderMap::new(),
        }
    }

    /// A resolution that scopes its credential with extra headers, the way
    /// the Pipedream adapter does.
    fn scoped(scope: &[(&str, &str)]) -> Self {
        let mut headers = HeaderMap::new();
        for (name, value) in scope {
            headers.insert(
                HeaderName::from_bytes(name.as_bytes()).expect("a header name"),
                HeaderValue::from_str(value).expect("a header value"),
            );
        }
        Self {
            scope: headers,
            ..Self::knowing()
        }
    }

    fn empty() -> Self {
        Self {
            asked: Mutex::default(),
            known: false,
            url: String::new(),
            scope: HeaderMap::new(),
        }
    }
}

impl McpCredentials for SpyCredentials {
    async fn resolve(
        &self,
        owner: &MacroUserIdStr<'static>,
        destination: &McpDestination,
    ) -> Result<UpstreamCall, EgressError> {
        let McpDestination::Connected(slug) = destination else {
            unreachable!("these tests only dial connected servers");
        };
        self.asked
            .lock()
            .expect("lock")
            .push((owner.to_string(), slug.to_string()));

        if !self.known {
            return Err(EgressError::UnknownServer(slug.clone()));
        }

        Ok(UpstreamCall::bearer(
            Url::parse(&self.url).expect("url"),
            BearerToken::new("upstream-token"),
        )?
        .scoped_by(self.scope.clone()))
    }
}

/// Records which repository it was asked to mint for.
struct SpyGithubTokens {
    asked: Mutex<Vec<(String, String)>>,
    url: String,
}

impl Default for SpyGithubTokens {
    fn default() -> Self {
        Self::at("https://github.com/macro/wolf.git/")
    }
}

impl SpyGithubTokens {
    /// A minting adapter that answers with whatever base it was built with,
    /// including one it has no business answering with.
    fn at(url: &str) -> Self {
        Self {
            asked: Mutex::default(),
            url: url.to_owned(),
        }
    }
}

impl GithubTokens for SpyGithubTokens {
    async fn resolve(
        &self,
        owner: &MacroUserIdStr<'static>,
        repo: &RepoSlug,
    ) -> Result<UpstreamCall, EgressError> {
        self.asked
            .lock()
            .expect("lock")
            .push((owner.to_string(), repo.to_string()));

        UpstreamCall::basic(
            Url::parse(&self.url).expect("url"),
            "x-access-token",
            "ghs-installation-token",
        )
    }
}

/// Records whether a managed-model credential was requested.
struct SpyManagedModels {
    calls: Mutex<usize>,
}

impl SpyManagedModels {
    fn new() -> Self {
        Self {
            calls: Mutex::default(),
        }
    }

    fn calls(&self) -> usize {
        *self.calls.lock().expect("lock")
    }
}

impl ManagedModelCredentials for SpyManagedModels {
    async fn resolve(&self) -> Result<UpstreamCall, EgressError> {
        *self.calls.lock().expect("lock") += 1;
        UpstreamCall::bearer(
            Url::parse("https://api.rox.one/v1/chat/completions").expect("url"),
            BearerToken::new("server-rox-token"),
        )
    }
}

/// Records the request it was handed, and answers with a fixed response.
struct SpyForwarder {
    seen: Mutex<Option<(http::request::Parts, Bytes)>>,
    response_headers: HeaderMap,
}

impl SpyForwarder {
    fn answering(response_headers: &[(&str, &str)]) -> Self {
        Self {
            seen: Mutex::default(),
            response_headers: header_map(response_headers),
        }
    }

    fn was_called(&self) -> bool {
        self.seen.lock().expect("lock").is_some()
    }

    fn forwarded<T>(&self, read: impl Fn(&http::request::Parts) -> T) -> T {
        let guard = self.seen.lock().expect("lock");
        read(&guard.as_ref().expect("forwarder was called").0)
    }

    fn body(&self) -> Bytes {
        self.seen
            .lock()
            .expect("lock")
            .as_ref()
            .expect("forwarder was called")
            .1
            .clone()
    }
}

impl Forwarder for SpyForwarder {
    async fn forward(&self, request: ProxyRequest) -> Result<ProxyResponse, EgressError> {
        let (parts, body) = request.into_parts();
        let body = body
            .collect()
            .await
            .map_err(|error| {
                EgressError::Internal(rootcause::report!("test proxy body failed: {error}"))
            })?
            .to_bytes();
        *self.seen.lock().expect("lock") = Some((parts, body));

        let mut response = http::Response::new(empty_body());
        *response.status_mut() = StatusCode::ACCEPTED;
        *response.headers_mut() = self.response_headers.clone();
        Ok(response)
    }
}

fn request(method: Method, header_pairs: &[(&str, &str)]) -> ProxyRequest {
    let mut request = http::Request::new(empty_body());
    *request.method_mut() = method;
    *request.headers_mut() = header_map(header_pairs);
    request
}

fn chat_request(model: &str, header_pairs: &[(&str, &str)]) -> ProxyRequest {
    let payload = serde_json::json!({"model": model, "messages": []});
    let body: ProxyBody = Full::new(Bytes::from(serde_json::to_vec(&payload).expect("json")))
        .map_err(|never| match never {})
        .boxed_unsync();
    let mut request = http::Request::new(body);
    *request.method_mut() = Method::POST;
    *request.headers_mut() = header_map(header_pairs);
    request
}

fn datadog() -> EgressTarget {
    EgressTarget::McpServer(McpDestination::Connected(
        McpServerSlug::parse("datadog").expect("slug"),
    ))
}

#[tokio::test]
async fn addresses_the_request_at_the_resolved_upstream_and_passes_the_status_back() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    );

    let response = service
        .proxy(
            &SessionToken::new("token"),
            datadog(),
            request(Method::POST, &[]),
        )
        .await
        .expect("proxied");

    assert_eq!(response.status(), StatusCode::ACCEPTED);
    assert_eq!(
        service.forward.forwarded(|parts| parts.uri.to_string()),
        "https://mcp.example.com/mcp"
    );
}

/// The whole point of the service: the sandbox's credential for us must not
/// reach a third-party server, which would let that server spend this
/// session's egress. What arrives upstream is the owner's credential, and
/// only that.
#[tokio::test]
async fn replaces_the_sandboxs_token_with_the_owners() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    );

    service
        .proxy(
            &SessionToken::new("session-token"),
            datadog(),
            request(
                Method::POST,
                &[
                    ("authorization", "Bearer session-token"),
                    ("mcp-session-id", "abc123"),
                ],
            ),
        )
        .await
        .expect("proxied");

    let stamped = service.forward.forwarded(|parts| {
        parts
            .headers
            .get_all(AUTHORIZATION)
            .iter()
            .map(|value| value.to_str().expect("ascii").to_owned())
            .collect::<Vec<_>>()
    });

    assert_eq!(stamped, ["Bearer upstream-token"], "exactly one credential");
    assert_eq!(
        service.forward.forwarded(|parts| names(&parts.headers)
            .into_iter()
            .map(str::to_owned)
            .collect::<Vec<_>>()),
        ["mcp-session-id", "authorization"]
    );
}

/// Pipedream reads *whose* connected account to spend off
/// `x-pd-external-user-id`, so those headers are part of the credential: the
/// stamped values must come from resolution, and a sandbox that sends its own
/// must not be able to act as anybody else.
#[tokio::test]
async fn stamps_the_resolved_scope_over_whatever_the_sandbox_claimed() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::scoped(&[
            ("x-pd-external-user-id", "the-owner"),
            ("x-pd-app-slug", "datadog"),
        ]),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    );

    service
        .proxy(
            &SessionToken::new("session-token"),
            datadog(),
            request(
                Method::POST,
                &[
                    ("authorization", "Bearer session-token"),
                    // The sandbox claiming to be somebody else, and a scoping
                    // header resolution never stamps at all.
                    ("x-pd-external-user-id", "somebody-else"),
                    ("x-pd-tool-mode", "full-config"),
                ],
            ),
        )
        .await
        .expect("proxied");

    // Sorted, because a `HeaderMap` decides its own iteration order.
    let mut scope = service.forward.forwarded(|parts| {
        parts
            .headers
            .iter()
            .filter(|(name, _)| name.as_str().starts_with("x-pd-"))
            .map(|(name, value)| {
                (
                    name.as_str().to_owned(),
                    value.to_str().expect("ascii").to_owned(),
                )
            })
            .collect::<Vec<_>>()
    });
    scope.sort();

    assert_eq!(
        scope,
        [
            ("x-pd-app-slug".to_owned(), "datadog".to_owned()),
            ("x-pd-external-user-id".to_owned(), "the-owner".to_owned()),
        ],
        "exactly the resolved scope, nothing the sandbox sent"
    );
}

#[tokio::test]
async fn strips_hop_by_hop_headers_from_the_response() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[
            ("mcp-session-id", "abc123"),
            ("set-cookie", "upstream=1"),
            ("transfer-encoding", "chunked"),
        ]),
    );

    let response = service
        .proxy(
            &SessionToken::new("token"),
            datadog(),
            request(Method::POST, &[]),
        )
        .await
        .expect("proxied");

    assert_eq!(names(response.headers()), ["mcp-session-id"]);
}

/// An authenticated session may use its own connections regardless of the
/// owner's email domain. The owner-scoped grant and upstream credential still
/// provide the security boundary.
#[tokio::test]
async fn a_session_owner_on_any_email_domain_uses_only_its_own_credentials() {
    let service = EgressServiceImpl::new(
        StubSessions(Ok(SessionGrant {
            session: AgentSessionId::new(),
            owner: MacroUserIdStr::try_from_email("visitor@example.com").expect("a valid user id"),
            repo: session_repo(),
        })),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    );

    service
        .proxy(
            &SessionToken::new("token"),
            datadog(),
            request(Method::POST, &[]),
        )
        .await
        .expect("proxied");

    assert!(
        service
            .credentials
            .asked
            .lock()
            .expect("lock")
            .iter()
            .any(|(owner, _)| owner == "conation|visitor@example.com"),
        "credential resolution must use the verified session owner"
    );
    assert!(service.forward.was_called());
}

/// Resolution reads the owner's connected servers, so an unverified token
/// must not get that far - otherwise a bad token is still an oracle for which
/// servers somebody has connected.
#[tokio::test]
async fn an_unverified_token_never_reaches_credential_resolution() {
    let service = EgressServiceImpl::new(
        StubSessions::refusing(),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    );

    let error = service
        .proxy(
            &SessionToken::new("forged"),
            datadog(),
            request(Method::POST, &[]),
        )
        .await
        .expect_err("refused");

    assert!(matches!(error, EgressError::Unauthenticated(_)));
    assert!(service.credentials.asked.lock().expect("lock").is_empty());
    assert!(!service.forward.was_called());
}

#[tokio::test]
async fn resolves_only_against_the_session_owner() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    );

    service
        .proxy(
            &SessionToken::new("token"),
            datadog(),
            request(Method::POST, &[]),
        )
        .await
        .expect("proxied");

    assert_eq!(
        *service.credentials.asked.lock().expect("lock"),
        vec![(owner().to_string(), "datadog".to_owned())]
    );
}

#[tokio::test]
async fn an_unknown_server_is_refused_before_anything_is_forwarded() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::empty(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    );

    let error = service
        .proxy(
            &SessionToken::new("token"),
            datadog(),
            request(Method::POST, &[]),
        )
        .await
        .expect_err("refused");

    assert!(matches!(error, EgressError::UnknownServer(slug) if slug.as_str() == "datadog"));
    assert!(!service.forward.was_called());
}

/// A verb outside the allowlist is refused before the token is even looked
/// at, so an unsupported method cannot be used to probe anything.
#[tokio::test]
async fn a_disallowed_method_is_refused_up_front() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    );

    let error = service
        .proxy(
            &SessionToken::new("token"),
            datadog(),
            request(Method::PUT, &[]),
        )
        .await
        .expect_err("refused");

    assert!(matches!(error, EgressError::MethodNotAllowed(method) if method == Method::PUT));
    assert!(service.credentials.asked.lock().expect("lock").is_empty());
    assert!(!service.forward.was_called());
}

fn git(endpoint: GitEndpoint) -> EgressTarget {
    EgressTarget::GitHubGit { endpoint }
}

/// The endpoint comes from the allowlist and is appended to whatever the
/// credential adapter addressed, so no adapter can widen the reachable set.
#[tokio::test]
async fn addresses_a_git_request_at_the_repositorys_endpoint() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    );

    service
        .proxy(
            &SessionToken::new("token"),
            git(GitEndpoint::InfoRefs {
                service: GitService::UploadPack,
            }),
            request(Method::GET, &[]),
        )
        .await
        .expect("proxied");

    assert_eq!(
        service.forward.forwarded(|parts| parts.uri.to_string()),
        "https://github.com/macro/wolf.git/info/refs?service=git-upload-pack"
    );
}

/// git talks to us through a credential helper, so the session token arrives
/// as a Basic password. It must still be replaced, not accompanied - and the
/// replacement is the installation token, also as a Basic password.
#[tokio::test]
async fn replaces_the_sandboxs_basic_credential_on_a_git_request() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    );

    service
        .proxy(
            &SessionToken::new("session-token"),
            git(GitEndpoint::UploadPack),
            request(
                Method::POST,
                &[("authorization", "Basic bWFjcm86c2Vzc2lvbi10b2tlbg==")],
            ),
        )
        .await
        .expect("proxied");

    let stamped = service.forward.forwarded(|parts| {
        parts
            .headers
            .get_all(AUTHORIZATION)
            .iter()
            .map(|value| value.to_str().expect("ascii").to_owned())
            .collect::<Vec<_>>()
    });

    assert_eq!(
        stamped,
        [UpstreamCredential::Basic {
            username: "x-access-token".to_owned(),
            secret: "ghs-installation-token".to_owned(),
        }
        .header_value()
        .expect("header value")
        .to_str()
        .expect("ascii")],
        "exactly one credential",
    );
}

#[tokio::test]
async fn an_unverified_token_never_reaches_git_token_minting() {
    let service = EgressServiceImpl::new(
        StubSessions::refusing(),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    );

    let error = service
        .proxy(
            &SessionToken::new("forged"),
            git(GitEndpoint::UploadPack),
            request(Method::POST, &[]),
        )
        .await
        .expect_err("refused");

    assert!(matches!(error, EgressError::Unauthenticated(_)));
    assert!(service.tokens.asked.lock().expect("lock").is_empty());
    assert!(!service.forward.was_called());
}

/// The sandbox has no way to name a repository - the git route has no place
/// to put one - so what gets minted is always the grant's.
#[tokio::test]
async fn mints_for_the_grants_repository_and_owner() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    );

    service
        .proxy(
            &SessionToken::new("token"),
            git(GitEndpoint::UploadPack),
            request(Method::POST, &[]),
        )
        .await
        .expect("proxied");

    assert_eq!(
        *service.tokens.asked.lock().expect("lock"),
        vec![(owner().to_string(), "macro/wolf".to_owned())]
    );
    assert!(service.credentials.asked.lock().expect("lock").is_empty());
}

/// `mcp_servers.url` is typed in by a person. A cleartext one would put the
/// owner's OAuth token on the wire for anyone on the path, so it never gets
/// stamped at all.
#[tokio::test]
async fn a_cleartext_mcp_server_never_receives_the_owners_token() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::at("http://mcp.example.com/mcp"),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    );

    let error = service
        .proxy(
            &SessionToken::new("token"),
            datadog(),
            request(Method::POST, &[]),
        )
        .await
        .expect_err("refused");

    assert!(matches!(error, EgressError::InsecureUpstream(_)));
    assert!(!service.forward.was_called());
}

#[tokio::test]
async fn a_cleartext_git_base_is_refused_too() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::knowing(),
        SpyGithubTokens::at("http://github.com/macro/wolf.git/"),
        SpyForwarder::answering(&[]),
    );

    let error = service
        .proxy(
            &SessionToken::new("token"),
            git(GitEndpoint::UploadPack),
            request(Method::POST, &[]),
        )
        .await
        .expect_err("refused");

    assert!(matches!(error, EgressError::InsecureUpstream(_)));
    assert!(!service.forward.was_called());
}

#[tokio::test]
async fn managed_model_requires_a_session_before_resolving_a_credential() {
    let service = EgressServiceImpl::new(
        StubSessions::refusing(),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    )
    .with_managed_models(SpyManagedModels::new());

    let error = service
        .proxy(
            &SessionToken::new("bad-token"),
            EgressTarget::OmniRouteChatCompletions,
            chat_request("gemini-2.5-flash", &[]),
        )
        .await
        .expect_err("unauthenticated requests must stop before credential resolution");

    assert!(matches!(error, EgressError::Unauthenticated(_)));
    assert_eq!(service.models.calls(), 0);
    assert!(!service.forward.was_called());
}

#[tokio::test]
async fn managed_model_route_normalizes_the_model_and_stamps_only_the_server_credential() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[
            ("authorization", "Bearer echoed-server-token"),
            ("set-cookie", "upstream-session=secret"),
        ]),
    )
    .with_managed_models(SpyManagedModels::new());

    let response = service
        .proxy(
            &SessionToken::new("session-token"),
            EgressTarget::OmniRouteChatCompletions,
            chat_request(
                "rox/gemini-2.5-flash",
                &[
                    ("authorization", "Bearer sandbox-token"),
                    ("cookie", "sandbox-cookie=secret"),
                    ("host", "attacker.invalid"),
                ],
            ),
        )
        .await
        .expect("proxied");

    assert_eq!(service.models.calls(), 1);
    assert_eq!(
        service.forward.forwarded(|parts| parts.uri.to_string()),
        "https://api.rox.one/v1/chat/completions"
    );
    assert_eq!(
        service
            .forward
            .forwarded(|parts| parts.headers[AUTHORIZATION]
                .to_str()
                .expect("header")
                .to_owned()),
        "Bearer server-rox-token"
    );
    assert!(
        service
            .forward
            .forwarded(|parts| !parts.headers.contains_key("cookie"))
    );
    assert!(
        service
            .forward
            .forwarded(|parts| !parts.headers.contains_key("host"))
    );
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&service.forward.body()).expect("json")["model"],
        "gemini-2.5-flash"
    );
    assert!(!response.headers().contains_key("authorization"));
    assert!(!response.headers().contains_key("set-cookie"));
}

#[tokio::test]
async fn managed_model_refuses_non_post_and_unapproved_models_without_forwarding() {
    let service = EgressServiceImpl::new(
        StubSessions::granting(),
        SpyCredentials::knowing(),
        SpyGithubTokens::default(),
        SpyForwarder::answering(&[]),
    )
    .with_managed_models(SpyManagedModels::new());

    let method_error = service
        .proxy(
            &SessionToken::new("token"),
            EgressTarget::OmniRouteChatCompletions,
            request(Method::GET, &[]),
        )
        .await
        .expect_err("GET must not reach OmniRoute");
    assert!(matches!(
        method_error,
        EgressError::MethodNotAllowed(Method::GET)
    ));

    let model_error = service
        .proxy(
            &SessionToken::new("token"),
            EgressTarget::OmniRouteChatCompletions,
            chat_request("other-provider/anything", &[]),
        )
        .await
        .expect_err("unapproved model must not reach OmniRoute");
    assert!(matches!(model_error, EgressError::Unroutable(_)));
    assert_eq!(service.models.calls(), 0);
    assert!(!service.forward.was_called());
}
