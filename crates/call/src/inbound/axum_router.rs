//! Axum routers for call endpoints.
//!
//! Two routers are exposed so the consumer can attach different middleware:
//!
//! - [`call_router`] — authenticated call operations (get/create, leave/end).
//!   Requires auth middleware.
//! - [`webhook_router`] — RTC provider webhook ingestion.
//!   Does **not** require auth middleware (LiveKit signs requests itself).

#[cfg(test)]
mod test;

use std::borrow::Cow;
use std::sync::Arc;

use axum::{
    Json, Router,
    body::Body,
    extract::{FromRef, FromRequestParts, OriginalUri, RawQuery, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode, header, request::Parts},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, patch, post},
};
use entity_access::{
    domain::{
        models::{EditAccessLevel, EntityAccessAuth, MemberParticipantRole, ViewAccessLevel},
        ports::EntityAccessService,
    },
    inbound::axum_extractors::{
        CallAccessLevelExtractor, CallWithChannelIdAccessLevelExtractor,
        ChannelAccessLevelExtractor,
    },
};
use macro_authorization::{
    MacroAuthorizationExtractor, MacroAuthorizationService, MacroAuthorizationState, UserOnly,
    UserOrInternal,
};
use model_error_response::ErrorResponse;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::domain::models::{
    ActiveCallsResponse, CallActiveResponse, CallError, CallRecord, CallTokenResponse,
    EditCallRecordRequest, EditCallTranscriptRequest, GetBatchCallRecordPreviewRequest,
    GetBatchCallRecordPreviewResponse, LeaveCallResponse, MAX_BATCH_CALL_IDS, RingStatusResponse,
    TranscriptSegmentRequest,
};
use crate::domain::ports::CallService;

// ---------------------------------------------------------------------------
// Call router (authenticated)
// ---------------------------------------------------------------------------

/// Router state for authenticated call operations.
pub struct CallRouterState<S, Svc, Auth> {
    service: Arc<S>,
    access_service: Arc<Svc>,
    authorization_state: MacroAuthorizationState<Auth>,
}

impl<S, Svc, Auth> Clone for CallRouterState<S, Svc, Auth> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
            access_service: self.access_service.clone(),
            authorization_state: self.authorization_state.clone(),
        }
    }
}

impl<S: CallService, Svc: EntityAccessService, Auth> CallRouterState<S, Svc, Auth> {
    /// Create a new router state from shared service references.
    pub fn new(
        service: Arc<S>,
        access_service: Arc<Svc>,
        authorization_state: MacroAuthorizationState<Auth>,
    ) -> Self {
        Self {
            service,
            access_service,
            authorization_state,
        }
    }
}

impl<S, Svc, Auth> FromRef<CallRouterState<S, Svc, Auth>> for Arc<Svc> {
    fn from_ref(state: &CallRouterState<S, Svc, Auth>) -> Self {
        state.access_service.clone()
    }
}

impl<S, Svc, Auth> FromRef<CallRouterState<S, Svc, Auth>> for MacroAuthorizationState<Auth> {
    fn from_ref(state: &CallRouterState<S, Svc, Auth>) -> Self {
        state.authorization_state.clone()
    }
}

/// Authenticated call router.
///
/// Routes:
/// - `GET /{channel_id}` — get or create a call (join existing or start new)
/// - `GET /{channel_id}/active` — check if an active call exists
/// - `GET /active` — list all active calls in channels the caller is a member of
/// - `DELETE /{channel_id}` — leave or end a call
/// - `GET /record/{call_id}` — get a full call record (transcript + participants)
/// - `PATCH /record/{call_id}` — edit a call record (share permissions, team sharing, name)
/// - `PATCH /record/{call_id}/transcript` — set per-diarized-speaker custom_speaker overrides
/// - `DELETE /record/{call_id}` — delete a call record
/// - `POST /record/{call_id}/share-with-team/toggle` — flip the live call's share-with-team toggle
/// - `POST /record/preview` — batch-fetch lightweight previews for many call ids
pub fn call_router<S, Svc, Auth, T>(state: CallRouterState<S, Svc, Auth>) -> Router<T>
where
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
    T: Send + Sync,
{
    Router::new()
        .route(
            "/{channel_id}",
            get(get_or_create_call_handler::<S, Svc, Auth>)
                .delete(leave_or_end_call_handler::<S, Svc, Auth>),
        )
        .route(
            "/{channel_id}/active",
            get(check_active_call_handler::<S, Svc, Auth>),
        )
        .route("/active", get(get_active_calls_handler::<S, Svc, Auth>))
        .route(
            "/record/preview",
            post(get_batch_call_record_preview_handler::<S, Svc, Auth>),
        )
        .route(
            "/record/{call_id}",
            get(get_call_record_handler::<S, Svc, Auth>)
                .patch(edit_call_record_handler::<S, Svc, Auth>)
                .delete(delete_call_record_handler::<S, Svc, Auth>),
        )
        .route(
            "/record/{call_id}/transcript",
            patch(edit_call_transcript_handler::<S, Svc, Auth>),
        )
        .route(
            "/record/{call_id}/media-session",
            post(create_call_media_session_handler::<S, Svc, Auth>),
        )
        .route(
            "/record/{call_id}/media",
            get(get_call_recording_handler::<S, Svc, Auth>)
                .head(head_call_recording_handler::<S, Svc, Auth>)
                .route_layer(middleware::from_fn(media_cookie_to_authorization)),
        )
        .route(
            "/record/{call_id}/preview",
            get(get_call_preview_handler::<S, Svc, Auth>)
                .head(head_call_preview_handler::<S, Svc, Auth>)
                .route_layer(middleware::from_fn(media_cookie_to_authorization)),
        )
        .route(
            "/record/{call_id}/share-with-team/toggle",
            post(toggle_share_with_team_handler::<S, Svc, Auth>),
        )
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Webhook router (unauthenticated — LiveKit validates via its own JWT)
// ---------------------------------------------------------------------------

/// Router state for the webhook endpoint.
pub struct WebhookRouterState<S> {
    service: Arc<S>,
}

impl<S> Clone for WebhookRouterState<S> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
        }
    }
}

impl<S: CallService> WebhookRouterState<S> {
    /// Create a new webhook router state wrapping the call service.
    pub fn new(service: Arc<S>) -> Self {
        Self { service }
    }
}

/// Webhook router for endpoints outside the user-auth layer; each handler
/// validates its own credentials.
///
/// Routes:
/// - `POST /webhook` — ingest a webhook event from LiveKit (signed by LiveKit)
/// - `GET /ring-status/{call_id}` — per-user ring status, authenticated with
///   the LiveKit JWT delivered in the VoIP push payload
pub fn webhook_router<S, T>(state: WebhookRouterState<S>) -> Router<T>
where
    S: CallService,
    T: Send + Sync,
{
    Router::new()
        .route("/webhook", post(webhook_handler::<S>))
        .route("/ring-status/{call_id}", get(ring_status_handler::<S>))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Internal call router (agent-authenticated via shared secret)
// ---------------------------------------------------------------------------

/// Router state for the internal transcript endpoint.
pub struct InternalCallRouterState<S> {
    service: Arc<S>,
}

impl<S> Clone for InternalCallRouterState<S> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
        }
    }
}

impl<S: CallService> InternalCallRouterState<S> {
    /// Create a new internal call router state wrapping the call service.
    pub fn new(service: Arc<S>) -> Self {
        Self { service }
    }
}

impl<S> FromRef<InternalCallRouterState<S>> for Arc<S> {
    fn from_ref(state: &InternalCallRouterState<S>) -> Self {
        state.service.clone()
    }
}

/// Internal call router for agent-submitted transcript segments.
///
/// Routes:
/// - `POST /{channel_id}/transcript` — ingest a transcript segment (from internal agent)
pub fn internal_call_router<S, T>(state: InternalCallRouterState<S>) -> Router<T>
where
    S: CallService,
    T: Send + Sync,
{
    Router::new()
        .route("/{channel_id}/transcript", post(transcript_handler::<S>))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Internal call access extractor
// ---------------------------------------------------------------------------

static INTERNAL_CALL_HEADER: &str = "x-macro-internal-call";

/// Axum extractor that validates the `x-macro-internal-call` header against
/// the shared secret stored in the [`CallService`].
pub struct InternalCallAccessExtractor(());

impl<S> FromRequestParts<InternalCallRouterState<S>> for InternalCallAccessExtractor
where
    S: CallService,
{
    type Rejection = (StatusCode, Cow<'static, str>);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &InternalCallRouterState<S>,
    ) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get(INTERNAL_CALL_HEADER)
            .and_then(|v| v.to_str().ok())
            .ok_or((
                StatusCode::BAD_REQUEST,
                Cow::Borrowed("missing x-macro-internal-call header"),
            ))?;

        if state.service.validate_internal_call(token) {
            Ok(InternalCallAccessExtractor(()))
        } else {
            Err((StatusCode::UNAUTHORIZED, Cow::Borrowed("unauthorized")))
        }
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// Handler for `GET /call/{channel_id}`.
///
/// Gets or creates a call for the channel. If a call already exists, joins it;
/// otherwise creates a new one. Always returns a join token.
#[utoipa::path(
    get,
    operation_id = "get_or_create_call",
    path = "/call/{channel_id}",
    params(
        ("channel_id" = Uuid, Path, description = "Channel ID"),
    ),
    responses(
        (status = 200, body = CallTokenResponse),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn get_or_create_call_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    access: ChannelAccessLevelExtractor<MemberParticipantRole, Svc, Auth>,
    user: MacroAuthorizationExtractor<Auth, UserOrInternal>,
) -> Result<Json<CallTokenResponse>, CallError> {
    let channel_id = Uuid::parse_str(&access.entity_access_receipt.entity().entity_id)
        .map_err(|_| CallError::Internal(anyhow::anyhow!("invalid channel_id")))?;

    let response = state
        .service
        .get_or_create_call(&channel_id, user.authorization.user.macro_user_id.clone())
        .await?;

    Ok(Json(response))
}

/// Handler for `GET /call/{channel_id}/active`.
///
/// Returns 200 with call info if an active call exists, or 204 No Content if not.
#[utoipa::path(
    get,
    operation_id = "check_active_call",
    path = "/call/{channel_id}/active",
    params(
        ("channel_id" = Uuid, Path, description = "Channel ID"),
    ),
    responses(
        (status = 200, body = CallActiveResponse),
        (status = 204, description = "No active call"),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn check_active_call_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    access: ChannelAccessLevelExtractor<MemberParticipantRole, Svc, Auth>,
) -> Result<axum::response::Response, CallError> {
    let channel_id = Uuid::parse_str(&access.entity_access_receipt.entity().entity_id)
        .map_err(|_| CallError::Internal(anyhow::anyhow!("invalid channel_id")))?;

    match state.service.check_active_call(&channel_id).await? {
        Some(response) => Ok(Json(response).into_response()),
        None => Ok(StatusCode::NO_CONTENT.into_response()),
    }
}

/// Handler for `GET /call/active`.
///
/// Lists all active calls in channels the caller is an active member of,
/// newest first. Calls with no active participants (orphaned by dropped RTC
/// webhooks) are excluded.
#[utoipa::path(
    get,
    operation_id = "get_active_calls",
    path = "/call/active",
    responses(
        (status = 200, body = ActiveCallsResponse),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn get_active_calls_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    user: MacroAuthorizationExtractor<Auth, UserOrInternal>,
) -> Result<Json<ActiveCallsResponse>, CallError> {
    let response = state
        .service
        .get_active_calls(user.authorization.user.macro_user_id.clone())
        .await?;
    Ok(Json(response))
}

/// Issue short-lived, HttpOnly cookies for authenticated call media playback.
///
/// The View receipt is resolved independently for this request, and the
/// endpoint requires a directly authenticated bearer rather than an internal
/// principal, browser auth cookie, or query-string token.
#[utoipa::path(
    post,
    operation_id = "create_call_media_session",
    path = "/call/record/{call_id}/media-session",
    params(("call_id" = Uuid, Path, description = "Call ID")),
    responses(
        (status = 204, description = "Media session cookie issued"),
        (status = 401, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
    )
)]
pub async fn create_call_media_session_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(_state): State<CallRouterState<S, Svc, Auth>>,
    OriginalUri(uri): OriginalUri,
    RawQuery(query): RawQuery,
    user: MacroAuthorizationExtractor<Auth, UserOnly>,
    access: CallAccessLevelExtractor<ViewAccessLevel, Svc, Auth>,
    headers: HeaderMap,
) -> Result<Response, CallError> {
    if has_macro_api_token_query(query.as_deref())
        || !matches!(
            access.entity_access_receipt.auth(),
            EntityAccessAuth::Authenticated(receipt_user)
                if receipt_user.as_ref() == user.authorization.macro_user_id.as_ref()
        )
    {
        return Err(CallError::Auth);
    }

    let Some(token) = explicit_bearer_jwt(&headers) else {
        return Err(CallError::Auth);
    };

    let mut response = StatusCode::NO_CONTENT.into_response();
    let response_headers = response.headers_mut();
    response_headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    for path in media_cookie_paths(uri.path()) {
        let cookie = format!(
            "macro-call-media-token={token}; Max-Age=90; Path={path}; HttpOnly; Secure; SameSite=None"
        );
        response_headers.append(
            header::SET_COOKIE,
            HeaderValue::from_bytes(cookie.as_bytes())
                .map_err(|error| CallError::Internal(error.into()))?,
        );
    }
    Ok(response)
}

// The gateway may preserve or strip `/dss`; issue both narrowly scoped paths
// for the requested API version. Clients must preflight the version they play.
fn media_cookie_paths(path: &str) -> [&'static str; 2] {
    if path.starts_with("/v1/") || path.starts_with("/dss/v1/") {
        ["/v1/call/record/", "/dss/v1/call/record/"]
    } else if path.starts_with("/v2/") || path.starts_with("/dss/v2/") {
        ["/v2/call/record/", "/dss/v2/call/record/"]
    } else {
        ["/call/record/", "/dss/call/record/"]
    }
}

/// On media paths only, bridge the short-lived HttpOnly cookie to the existing
/// bearer extractor. An explicit Authorization header always takes precedence.
async fn media_cookie_to_authorization(mut request: Request, next: Next) -> Response {
    if !is_call_media_path(request.uri().path())
        || !matches!(
            *request.method(),
            axum::http::Method::GET | axum::http::Method::HEAD
        )
        || request.headers().contains_key(header::AUTHORIZATION)
    {
        return next.run(request).await;
    }

    match media_cookie_token(request.headers()) {
        Ok(Some(token)) => {
            let authorization = format!("Bearer {token}");
            let value = match HeaderValue::from_bytes(authorization.as_bytes()) {
                Ok(value) => value,
                Err(_) => return StatusCode::UNAUTHORIZED.into_response(),
            };
            request.headers_mut().insert(header::AUTHORIZATION, value);
        }
        Ok(None) => {}
        Err(()) => return StatusCode::UNAUTHORIZED.into_response(),
    }
    next.run(request).await
}

fn is_call_media_path(path: &str) -> bool {
    let mut segments = path.split('/').filter(|segment| !segment.is_empty());
    let Some(mut first) = segments.next() else {
        return false;
    };
    if first == "dss" {
        let Some(next) = segments.next() else {
            return false;
        };
        first = next;
    }
    if first == "v1" || first == "v2" {
        let Some(next) = segments.next() else {
            return false;
        };
        first = next;
    }
    if first == "call" {
        let Some(next) = segments.next() else {
            return false;
        };
        first = next;
    }
    let (Some(call_id), Some(media_type)) = (segments.next(), segments.next()) else {
        return false;
    };
    first == "record"
        && (media_type == "media" || media_type == "preview")
        && segments.next().is_none()
        && Uuid::parse_str(call_id).is_ok()
}

fn media_cookie_token(headers: &HeaderMap) -> Result<Option<&str>, ()> {
    const COOKIE_NAME: &str = "macro-call-media-token";

    let mut token = None;
    for header_value in headers.get_all(header::COOKIE) {
        let cookie_header = header_value.to_str().map_err(|_| ())?;
        for pair in cookie_header.split(';') {
            let pair = pair.trim();
            let Some((name, value)) = pair.split_once('=') else {
                continue;
            };
            if name.trim() != COOKIE_NAME {
                continue;
            }
            if token.is_some() || !is_valid_media_jwt(value) {
                return Err(());
            }
            token = Some(value);
        }
    }
    Ok(token)
}

fn is_valid_media_jwt(value: &str) -> bool {
    let mut segments = value.split('.');
    let Some(header) = segments.next() else {
        return false;
    };
    let Some(payload) = segments.next() else {
        return false;
    };
    let Some(signature) = segments.next() else {
        return false;
    };
    segments.next().is_none()
        && [header, payload, signature].iter().all(|segment| {
            !segment.is_empty()
                && segment
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        })
}

fn explicit_bearer_jwt(headers: &HeaderMap) -> Option<&str> {
    let mut values = headers.get_all(header::AUTHORIZATION).iter();
    let value = values.next()?.to_str().ok()?;
    if values.next().is_some() {
        return None;
    }
    let (scheme, token) = value.split_once(' ')?;
    (scheme.eq_ignore_ascii_case("bearer") && is_valid_media_jwt(token)).then_some(token)
}

fn has_macro_api_token_query(query: Option<&str>) -> bool {
    query.is_some_and(|query| {
        query.split('&').any(|pair| {
            let key = pair.split_once('=').map_or(pair, |(key, _)| key);
            urlencoding::decode(key)
                .map(|key| key.eq_ignore_ascii_case("macro-api-token"))
                .unwrap_or(false)
        })
    })
}

#[cfg(test)]
mod media_cookie_tests {
    use super::*;

    #[test]
    fn duplicate_media_cookies_are_rejected_as_ambiguous() {
        let mut headers = HeaderMap::new();
        headers.append(
            header::COOKIE,
            HeaderValue::from_static("macro-call-media-token=header.payload.signature"),
        );
        assert_eq!(
            media_cookie_token(&headers),
            Ok(Some("header.payload.signature"))
        );

        headers.append(
            header::COOKIE,
            HeaderValue::from_static("macro-call-media-token=header.payload.signature"),
        );
        assert!(media_cookie_token(&headers).is_err());
    }

    #[test]
    fn media_cookie_path_scope_covers_media_and_preview_only() {
        assert!(is_call_media_path(
            "/record/1c4c9f96-e8cf-4f45-b27a-74e97bc3c21e/media"
        ));
        assert!(is_call_media_path(
            "/dss/call/record/1c4c9f96-e8cf-4f45-b27a-74e97bc3c21e/preview"
        ));
        assert!(is_call_media_path(
            "/dss/v2/call/record/1c4c9f96-e8cf-4f45-b27a-74e97bc3c21e/media"
        ));
        assert!(is_call_media_path(
            "/v1/call/record/1c4c9f96-e8cf-4f45-b27a-74e97bc3c21e/preview"
        ));
        assert_eq!(
            media_cookie_paths("/dss/v2/call/record/1c4c9f96-e8cf-4f45-b27a-74e97bc3c21e/media"),
            ["/v2/call/record/", "/dss/v2/call/record/"]
        );
        assert_eq!(
            media_cookie_paths("/call/record/1c4c9f96-e8cf-4f45-b27a-74e97bc3c21e/media"),
            ["/call/record/", "/dss/call/record/"]
        );
        assert!(!is_call_media_path(
            "/record/1c4c9f96-e8cf-4f45-b27a-74e97bc3c21e"
        ));
        assert!(!is_call_media_path("/record/not-a-uuid/media"));
    }
}

/// Stream recording bytes after checking current call View access.
#[utoipa::path(
    get,
    operation_id = "get_call_recording_media",
    path = "/call/record/{call_id}/media",
    params(("call_id" = Uuid, Path, description = "Call ID")),
    responses(
        (status = 200, description = "Full recording stream"),
        (status = 206, description = "Single byte-range recording stream"),
        (status = 401, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 416, description = "Range is unsatisfiable"),
        (status = 500, body = ErrorResponse),
    )
)]
pub async fn get_call_recording_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    RawQuery(query): RawQuery,
    access: CallAccessLevelExtractor<ViewAccessLevel, Svc, Auth>,
    headers: HeaderMap,
) -> Result<axum::response::Response, CallError> {
    recording_response(state, query, access, headers, false, false).await
}

/// Return recording metadata without downloading its body.
#[utoipa::path(
    head,
    operation_id = "head_call_recording_media",
    path = "/call/record/{call_id}/media",
    params(("call_id" = Uuid, Path, description = "Call ID")),
    responses(
        (status = 200, description = "Recording metadata"),
        (status = 206, description = "Single byte-range recording metadata"),
        (status = 401, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 416, description = "Range is unsatisfiable"),
        (status = 500, body = ErrorResponse),
    )
)]
pub async fn head_call_recording_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    RawQuery(query): RawQuery,
    access: CallAccessLevelExtractor<ViewAccessLevel, Svc, Auth>,
    headers: HeaderMap,
) -> Result<axum::response::Response, CallError> {
    recording_response(state, query, access, headers, false, true).await
}

/// Stream the preview image after checking current call View access.
#[utoipa::path(
    get,
    operation_id = "get_call_recording_preview",
    path = "/call/record/{call_id}/preview",
    params(("call_id" = Uuid, Path, description = "Call ID")),
    responses(
        (status = 200, description = "Full preview stream"),
        (status = 206, description = "Single byte-range preview stream"),
        (status = 401, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 416, description = "Range is unsatisfiable"),
        (status = 500, body = ErrorResponse),
    )
)]
pub async fn get_call_preview_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    RawQuery(query): RawQuery,
    access: CallAccessLevelExtractor<ViewAccessLevel, Svc, Auth>,
    headers: HeaderMap,
) -> Result<axum::response::Response, CallError> {
    recording_response(state, query, access, headers, true, false).await
}

/// Return preview metadata without downloading its body.
#[utoipa::path(
    head,
    operation_id = "head_call_recording_preview",
    path = "/call/record/{call_id}/preview",
    params(("call_id" = Uuid, Path, description = "Call ID")),
    responses(
        (status = 200, description = "Preview metadata"),
        (status = 206, description = "Single byte-range preview metadata"),
        (status = 401, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 416, description = "Range is unsatisfiable"),
        (status = 500, body = ErrorResponse),
    )
)]
pub async fn head_call_preview_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    RawQuery(query): RawQuery,
    access: CallAccessLevelExtractor<ViewAccessLevel, Svc, Auth>,
    headers: HeaderMap,
) -> Result<axum::response::Response, CallError> {
    recording_response(state, query, access, headers, true, true).await
}

async fn recording_response<S, Svc, Auth>(
    state: CallRouterState<S, Svc, Auth>,
    query: Option<String>,
    access: CallAccessLevelExtractor<ViewAccessLevel, Svc, Auth>,
    headers: HeaderMap,
    preview: bool,
    head_only: bool,
) -> Result<axum::response::Response, CallError>
where
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
{
    if has_macro_api_token_query(query.as_deref()) {
        return Err(CallError::Auth);
    }
    let range_values = headers.get_all(header::RANGE);
    let mut range_iter = range_values.iter();
    let range = match (range_iter.next(), range_iter.next()) {
        (None, _) => None,
        (Some(_), Some(_)) => Some(String::new()),
        (Some(value), None) => Some(value.to_str().unwrap_or_default().to_owned()),
    };
    let stream = state
        .service
        .stream_call_recording(access.entity_access_receipt, preview, range, head_only)
        .await?;
    let status = StatusCode::from_u16(stream.status_code)
        .map_err(|error| CallError::Internal(error.into()))?;
    let mut response = axum::response::Response::new(match stream.body {
        Some(body) => Body::from_stream(ReaderStream::new(body.into_async_read())),
        None => Body::empty(),
    });
    *response.status_mut() = status;
    let response_headers = response.headers_mut();
    response_headers.insert(
        header::CACHE_CONTROL,
        "private, no-store"
            .parse()
            .map_err(|error| CallError::Internal(anyhow::anyhow!("{error}")))?,
    );
    response_headers.insert(
        header::ACCEPT_RANGES,
        "bytes"
            .parse()
            .map_err(|error| CallError::Internal(anyhow::anyhow!("{error}")))?,
    );
    response_headers.insert(
        header::CONTENT_LENGTH,
        stream
            .content_length
            .to_string()
            .parse()
            .map_err(|error| CallError::Internal(anyhow::anyhow!("{error}")))?,
    );
    response_headers.insert(
        header::CONTENT_TYPE,
        stream
            .content_type
            .parse()
            .map_err(|error| CallError::Internal(anyhow::anyhow!("{error}")))?,
    );
    response_headers.insert(
        header::CONTENT_DISPOSITION,
        "inline"
            .parse()
            .map_err(|error| CallError::Internal(anyhow::anyhow!("{error}")))?,
    );
    response_headers.insert(
        header::PRAGMA,
        "no-cache"
            .parse()
            .map_err(|error| CallError::Internal(anyhow::anyhow!("{error}")))?,
    );
    if let Some(content_range) = stream.content_range {
        response_headers.insert(
            header::CONTENT_RANGE,
            content_range
                .parse()
                .map_err(|error| CallError::Internal(anyhow::anyhow!("{error}")))?,
        );
    }
    Ok(response)
}

/// Handler for `GET /call/record/{call_id}`.
///
/// Returns the full [`CallRecord`] (metadata + participants + transcript)
/// for a call identified by its own id. Covers both active and archived calls.
/// Access is validated via channel membership (MemberParticipantRole).
#[utoipa::path(
    get,
    operation_id = "get_call_record",
    path = "/call/record/{call_id}",
    params(
        ("call_id" = Uuid, Path, description = "Call ID"),
    ),
    responses(
        (status = 200, body = CallRecord),
        (status = 401, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn get_call_record_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    access: CallAccessLevelExtractor<ViewAccessLevel, Svc, Auth>,
) -> Result<Json<CallRecord>, CallError> {
    let record = state
        .service
        .get_call_record(access.entity_access_receipt)
        .await?;
    Ok(Json(record))
}

/// Handler for `DELETE /call/record/{call_id}`.
///
/// Deletes a call record (and its participants/transcripts via cascade).
/// Access is validated via channel membership (MemberParticipantRole).
#[utoipa::path(
    delete,
    operation_id = "delete_call_record",
    path = "/call/record/{call_id}",
    params(
        ("call_id" = Uuid, Path, description = "Call ID"),
    ),
    responses(
        (status = 204, description = "Call record deleted"),
        (status = 401, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn delete_call_record_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    access: CallAccessLevelExtractor<EditAccessLevel, Svc, Auth>,
) -> Result<StatusCode, CallError> {
    state
        .service
        .delete_call_record(access.entity_access_receipt)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Handler for `PATCH /call/record/{call_id}`.
///
/// Edits a call record: link/channel share permissions, display name, and
/// team sharing. Edit access (channel membership) is required for the request.
/// `sharePermission.teamShareAccessLevel` only accepts `view` or `null`; while
/// the call is live it sets the pending share-with-team toggle, and once the
/// call is archived it is additionally authorized against the call's creator.
#[utoipa::path(
    patch,
    operation_id = "edit_call_record",
    path = "/call/record/{call_id}",
    params(
        ("call_id" = Uuid, Path, description = "Call ID"),
    ),
    request_body = EditCallRecordRequest,
    responses(
        (status = 204, description = "Call record updated"),
        (status = 400, description = "Invalid team-share level, contradictory inputs, or the creator has no team", body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 403, description = "Team sharing of an archived call may only be changed by its creator", body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 409, description = "Team-sharing facts changed, or the call was archived mid-request; reload and retry", body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn edit_call_record_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    access: CallAccessLevelExtractor<EditAccessLevel, Svc, Auth>,
    Json(request): Json<EditCallRecordRequest>,
) -> Result<StatusCode, CallError> {
    state
        .service
        .edit_call_record(access.entity_access_receipt, request)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Handler for `PATCH /call/record/{call_id}/transcript`.
///
/// Applies per-diarized-speaker `custom_speaker` overrides to the call's
/// archived transcript rows. Auth uses the same `EditAccessLevel` extractor
/// as `edit_call_record_handler`.
#[utoipa::path(
    patch,
    operation_id = "edit_call_transcript",
    path = "/call/record/{call_id}/transcript",
    params(
        ("call_id" = Uuid, Path, description = "Call ID"),
    ),
    request_body = EditCallTranscriptRequest,
    responses(
        (status = 204, description = "Transcript updated"),
        (status = 400, body = ErrorResponse),
        (status = 401, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn edit_call_transcript_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    access: CallAccessLevelExtractor<EditAccessLevel, Svc, Auth>,
    Json(request): Json<EditCallTranscriptRequest>,
) -> Result<StatusCode, CallError> {
    state
        .service
        .edit_call_transcript(access.entity_access_receipt, request)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Handler for `POST /call/record/{call_id}/share-with-team/toggle`.
///
/// Flips the live call's share-with-team toggle and returns the new value as
/// the JSON body. The toggle is applied as canonical team sharing (View for
/// the creator's team) when the call is archived; archived calls answer 409
/// and are edited through `PATCH /call/record/{call_id}` instead.
#[utoipa::path(
    post,
    operation_id = "toggle_share_with_team",
    path = "/call/record/{call_id}/share-with-team/toggle",
    params(
        ("call_id" = Uuid, Path, description = "Call ID"),
    ),
    responses(
        (status = 200, body = bool, content_type = "application/json", description = "New value of the share-with-team toggle"),
        (status = 401, body = ErrorResponse),
        (status = 404, body = ErrorResponse),
        (status = 409, description = "The call is no longer active", body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn toggle_share_with_team_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    access: CallAccessLevelExtractor<EditAccessLevel, Svc, Auth>,
) -> Result<Json<bool>, CallError> {
    let new_value = state
        .service
        .toggle_share_with_team(access.entity_access_receipt)
        .await?;
    Ok(Json(new_value))
}

/// Handler for `POST /call/record/preview`.
///
/// Batch-fetches lightweight previews for a list of call ids. Mirrors the
/// `POST /documents/preview` endpoint: no per-id access checks, duplicate
/// ids are deduplicated server-side, and missing ids come back as
/// `CallRecordPreview::DoesNotExist` rather than producing an error.
#[utoipa::path(
    post,
    operation_id = "get_batch_call_record_preview",
    path = "/call/record/preview",
    request_body = GetBatchCallRecordPreviewRequest,
    responses(
        (status = 200, body = GetBatchCallRecordPreviewResponse),
        (status = 400, body = ErrorResponse, description = "call_ids exceeds MAX_BATCH_CALL_IDS"),
        (status = 401, body = ErrorResponse),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn get_batch_call_record_preview_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    user: MacroAuthorizationExtractor<Auth, UserOrInternal>,
    Json(request): Json<GetBatchCallRecordPreviewRequest>,
) -> Result<Json<GetBatchCallRecordPreviewResponse>, CallError> {
    if request.call_ids.len() > MAX_BATCH_CALL_IDS {
        return Err(CallError::InvalidRequest(format!(
            "call_ids exceeds maximum batch size of {MAX_BATCH_CALL_IDS}"
        )));
    }

    let response = state
        .service
        .get_batch_call_record_previews(request, user.authorization.user.macro_user_id.clone())
        .await?;
    Ok(Json(response))
}

/// Handler for `DELETE /call/{channel_id}`.
#[utoipa::path(
    delete,
    operation_id = "leave_or_end_call",
    path = "/call/{channel_id}",
    params(
        ("channel_id" = Uuid, Path, description = "Channel ID"),
    ),
    responses(
        (status = 200, body = LeaveCallResponse),
        (status = 401, body = ErrorResponse),
        (status = 404, body = ErrorResponse, description = "No active call"),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn leave_or_end_call_handler<
    S: CallService,
    Svc: EntityAccessService,
    Auth: MacroAuthorizationService,
>(
    State(state): State<CallRouterState<S, Svc, Auth>>,
    access: CallWithChannelIdAccessLevelExtractor<MemberParticipantRole, Svc, Auth>,
    user: MacroAuthorizationExtractor<Auth, UserOrInternal>,
) -> Result<Json<LeaveCallResponse>, CallError> {
    let channel_id = access.channel_id;

    let response = state
        .service
        .leave_or_end_call(&channel_id, user.authorization.user.macro_user_id.clone())
        .await?;

    Ok(Json(response))
}

/// Handler for `POST /call/webhook`.
///
/// Receives webhook events from the RTC provider (e.g. LiveKit).
/// The `Authorization` header contains the webhook auth token
/// and the body contains the raw event payload.
#[utoipa::path(
    post,
    operation_id = "call_webhook",
    path = "/call/webhook",
    responses(
        (status = 200, description = "Event processed"),
        (status = 401, description = "Invalid webhook signature"),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn webhook_handler<S: CallService>(
    State(state): State<WebhookRouterState<S>>,
    headers: axum::http::HeaderMap,
    body: String,
) -> Result<StatusCode, CallError> {
    let auth_token = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(CallError::Auth)?;

    state
        .service
        .process_webhook_event(&body, auth_token)
        .await?;

    Ok(StatusCode::OK)
}

/// Handler for `GET /call/ring-status/{call_id}`.
///
/// Reports whether the authenticated user should keep ringing for the call.
/// Polled by native clients while the CallKit incoming-call UI is showing, so
/// a ring can be cancelled when the user answers on another device
/// (`answered`) or the call ends before anyone answers (`ended`).
///
/// Outside the user-auth layer: the bearer credential is the recipient's
/// LiveKit JWT from the VoIP push payload, verified with the LiveKit secret.
#[utoipa::path(
    get,
    operation_id = "get_ring_status",
    path = "/call/ring-status/{call_id}",
    params(
        ("call_id" = Uuid, Path, description = "Call ID"),
    ),
    responses(
        (status = 200, body = RingStatusResponse),
        (status = 401, body = ErrorResponse, description = "Missing or invalid bearer token"),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn ring_status_handler<S: CallService>(
    State(state): State<WebhookRouterState<S>>,
    axum::extract::Path(call_id): axum::extract::Path<Uuid>,
    headers: axum::http::HeaderMap,
) -> Result<Json<RingStatusResponse>, CallError> {
    let bearer = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(CallError::Auth)?;

    let response = state.service.get_ring_status(&call_id, bearer).await?;

    Ok(Json(response))
}

/// Handler for `POST /call/{channel_id}/transcript`.
///
/// Receives transcript segments from the transcription agent.
/// Authenticated via the `x-macro-internal-call` shared secret.
/// Duplicate segments (same `segment_id`) are ignored.
#[utoipa::path(
    post,
    operation_id = "ingest_transcript",
    path = "/call/{channel_id}/transcript",
    params(
        ("channel_id" = Uuid, Path, description = "Channel ID"),
    ),
    request_body = TranscriptSegmentRequest,
    responses(
        (status = 200, description = "Segment ingested"),
        (status = 401, body = ErrorResponse),
        (status = 404, body = ErrorResponse, description = "No active call"),
        (status = 500, body = ErrorResponse),
    )
)]
#[tracing::instrument(err, skip_all)]
pub async fn transcript_handler<S: CallService>(
    State(state): State<InternalCallRouterState<S>>,
    _access: InternalCallAccessExtractor,
    axum::extract::Path(channel_id): axum::extract::Path<Uuid>,
    Json(segment): Json<TranscriptSegmentRequest>,
) -> Result<StatusCode, CallError> {
    state
        .service
        .ingest_transcript_segment(&channel_id, segment)
        .await?;

    Ok(StatusCode::OK)
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

impl IntoResponse for CallError {
    fn into_response(self) -> axum::response::Response {
        let status_code = match &self {
            CallError::NotFound(_) => StatusCode::NOT_FOUND,
            CallError::NotInCall => StatusCode::BAD_REQUEST,
            CallError::AlreadyInCall(_) => StatusCode::CONFLICT,
            CallError::Auth => StatusCode::UNAUTHORIZED,
            CallError::InvalidRequest(_) => StatusCode::BAD_REQUEST,
            CallError::Forbidden(_) => StatusCode::FORBIDDEN,
            CallError::Conflict(_) => StatusCode::CONFLICT,
            CallError::Internal(_) => {
                tracing::error!(error=?self, "internal server error");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };

        let message = match &self {
            CallError::Internal(_) => "internal server error".to_string(),
            other => other.to_string(),
        };
        (
            status_code,
            Json(ErrorResponse {
                message: message.into(),
            }),
        )
            .into_response()
    }
}
