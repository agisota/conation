use crate::api::context::{ApiContext, PropertiesHandlerState};
use anyhow::Context;
use axum::Router;
use axum::extract::FromRef;
use axum::extract::Request;
use axum::http::Method;
use axum::middleware::Next;
use github::inbound::github_sync_router::GithubSyncRouterState;
use macro_axum_utils::compose_layers;
use macro_tower_layers::MacroRequestIdAndTracingLayer;
use model::version::{ServiceNameState, VersionedApiServiceName, validate_api_version};
use search_service::SearchHandlerState;
use std::time::Duration;
use tower::ServiceBuilder;
use tower_http::compression::{
    CompressionLayer,
    predicate::{DefaultPredicate, NotForContentType, Predicate},
};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

// Utilities
pub(crate) mod context;
mod saved_views;
pub(crate) mod util;

// Middleware
mod middleware;

// Routes
mod annotations;
mod documents;
mod graphql_soup;
mod health;
mod history;
mod instructions;
mod internal;
mod notification;
mod pins;
mod recents;
mod user;
mod user_document_view_location;

mod entity;
mod items;
pub(crate) mod swagger;
mod threads;

// Constants
// auth based constants
pub const MACRO_INTERNAL_USER_ID: &str = "macro|INTERNAL@macro.com";

fn response_compression_layer() -> CompressionLayer<impl Predicate> {
    CompressionLayer::new().gzip(true).compress_when(
        DefaultPredicate::new()
            .and(NotForContentType::const_new("video/"))
            .and(NotForContentType::const_new("image/jpeg")),
    )
}

pub async fn setup_and_serve(state: ApiContext) -> anyhow::Result<()> {
    let app = api_router(state.clone())
        .layer(
            ServiceBuilder::new()
                .layer(MacroRequestIdAndTracingLayer::new(Duration::from_millis(200)).into_inner())
                .layer(axum::middleware::from_fn_with_state(
                    ServiceNameState {
                        service_name: VersionedApiServiceName::DocumentStorageService,
                    },
                    validate_api_version,
                ))
                .layer(macro_cors::cors_layer().expose_headers([axum::http::header::RETRY_AFTER]))
                .layer(response_compression_layer()),
        )
        // The health router is attached here so we don't attach the logging middleware to it
        .merge(SwaggerUi::new("/docs").url("/api-doc/openapi.json", swagger::ApiDoc::openapi()))
        .merge(
            SwaggerUi::new("/dss/docs")
                .url("/dss/api-doc/openapi.json", swagger::ApiDoc::openapi()),
        );

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", state.config.port))
        .await
        .unwrap();
    tracing::info!(
        "document storage service is up and running with environment {:?} on port {}",
        &state.config.environment,
        &state.config.port
    );
    axum::serve(listener, app.into_make_service())
        .with_graceful_shutdown(macro_entrypoint::shutdown_signal())
        .await
        .context("error starting service")
}

fn items_router(state: ApiContext) -> Router<ApiContext> {
    soup::inbound::axum_router::soup_router(state.soup_router_state.clone())
        .merge(graphql_soup::router())
}

fn api_router(state: ApiContext) -> Router {
    let github_sync_service_router_state = GithubSyncRouterState {
        service: state.github_sync_service.clone(),
        entity_access_service: state.entity_access_service.clone(),
        authorization_state: state.authorization_state.clone(),
    };

    // Webhook router is outside auth — LiveKit validates via its own JWT,
    // cal.com validates via HMAC signature.
    let webhook_router = Router::new()
        .nest(
            "/call",
            call::inbound::axum_router::webhook_router(state.call_webhook_state.clone()),
        )
        .nest(
            "/cal",
            cal::inbound::cal_webhook_router::cal_webhook_router(state.cal_webhook_state.clone()),
        );

    // Internal call router — agent-authenticated via x-macro-internal-call header.
    let internal_call_router = Router::new().nest(
        "/call",
        call::inbound::axum_router::internal_call_router(state.call_internal_state.clone()),
    );

    let internal_router = Router::new()
        .nest(
            "/dictation",
            dictation::inbound::axum_router::dictation_router(state.dictation_state.clone()),
        )
        .nest(
            "/github",
            github::inbound::github_sync_router::github_sync_router(
                github_sync_service_router_state,
            ),
        )
        .nest(
            "/documents",
            documents::router(state.clone())
                .merge(documents_hex::inbound::axum_router::documents_router(
                    state.documents_state.clone(),
                ))
                .layer(ServiceBuilder::new().layer(axum::middleware::from_fn(
                    macro_middleware::connection_drop_prevention_handler,
                ))),
        )
        .nest(
            "/history",
            history::router().layer(compose_layers![
                axum::middleware::from_fn(macro_middleware::connection_drop_prevention_handler),
                CompressionLayer::new(),
            ]),
        )
        .nest("/instructions", instructions::router())
        .nest("/items", items_router(state.clone()))
        .nest(
            "/threads",
            threads::router(state.clone()).layer(axum::middleware::from_fn(
                macro_middleware::connection_drop_prevention_handler,
            )),
        )
        .nest(
            "/user_document_view_location",
            user_document_view_location::router(state.clone()).layer(axum::middleware::from_fn(
                macro_middleware::connection_drop_prevention_handler,
            )),
        )
        .nest(
            "/pins",
            pins::router().layer(axum::middleware::from_fn(
                macro_middleware::connection_drop_prevention_handler,
            )),
        )
        .nest(
            "/projects",
            projects_hex::inbound::axum_router::projects_router(state.projects_state.clone())
                .layer(ServiceBuilder::new().layer(axum::middleware::from_fn(
                    |req: Request, next: Next| async move {
                        match req.method() {
                            &Method::PUT | &Method::POST | &Method::PATCH | &Method::DELETE => {
                                let uri = req.uri().to_string();
                                // We do not want the upload a folder in the background
                                // If a user cancels the call we need to make sure we aren't
                                // creating documents/projects
                                if !uri.contains("/upload") {
                                    return next.run(req).await;
                                }
                                tokio::task::spawn(next.run(req)).await.unwrap()
                            }
                            _ => next.run(req).await,
                        }
                    },
                ))),
        )
        .nest(
            "/annotations",
            annotations::router(state.clone()).layer(axum::middleware::from_fn(
                macro_middleware::connection_drop_prevention_handler,
            )),
        )
        .nest(
            "/properties",
            properties::inbound::axum_router::router()
                .with_state(PropertiesHandlerState::from_ref(&state)),
        )
        .nest(
            "/search",
            search_service::search_router().with_state(SearchHandlerState::from_ref(&state)),
        )
        .nest(
            "/sync_service",
            sync_service_hex::inbound::axum_router::sync_service_router(
                sync_service_hex::inbound::axum_router::SyncServiceRouterState {
                    service: state.sync_service_client.clone(),
                    authorization_state: state.authorization_state.clone(),
                },
            ),
        )
        .nest(
            "/comms",
            channels::inbound::list_router::channel_list_router(state.channel_list_state.clone()),
        )
        .nest("/entity", entity::router())
        .merge(calendar_events::inbound::axum_router::calendar_router(
            state.calendar_state.clone(),
        ))
        .nest(
            "/channels",
            channels::inbound::axum_router::channels_router(state.channels_state.clone()),
        )
        .nest(
            "/messages",
            messages::inbound::axum_router::router(state.messages_state.clone()),
        )
        .merge(bots::inbound::axum_router::bots_router(
            state.bots_state.clone(),
        ))
        .merge(harnesses::inbound::axum_router::harnesses_router(
            state.harnesses_state.clone(),
        ))
        .merge(
            bots::inbound::channel_webhook_router::channel_scoped_bot_router(
                state.channel_bot_webhook_state.clone(),
            ),
        )
        .nest(
            "/favorites",
            favorites::inbound::axum_router::favorites_router(state.favorites_state.clone()),
        )
        .nest(
            "/channel-labels",
            channel_labels::inbound::axum_router::channel_labels_router(
                state.channel_labels_state.clone(),
            ),
        )
        .nest(
            "/user-api-keys",
            user_api_key::inbound::axum_router::user_api_key_router(
                state.user_api_key_state.clone(),
            ),
        )
        .nest(
            "/reminders",
            reminders::inbound::axum_router::reminders_router(state.reminders_state.clone()),
        )
        .nest(
            "/initiatives",
            initiative::inbound::axum_router::initiative_router(state.initiative_state.clone()),
        )
        .nest(
            "/collab_surfaces",
            collab_surface::inbound::axum_router::collab_surface_router(
                state.collab_surface_state.clone(),
            ),
        )
        .nest(
            "/foreign_entity",
            foreign_entity::inbound::axum_router::foreign_entity_router(
                state.foreign_entity_state.clone(),
            ),
        )
        .nest(
            "/call",
            call::inbound::axum_router::call_router(state.call_state.clone()),
        )
        .nest(
            "/webhook",
            webhook::inbound::axum_router::webhook_router(state.webhook_state.clone()).merge(
                webhook::inbound::stream_router::webhook_stream_router(
                    state.sse_stream_state.clone(),
                ),
            ),
        )
        .nest(
            "/crm",
            crm::inbound::axum_router::crm_router(state.crm_state.clone()),
        )
        .merge(
            bots::inbound::channel_webhook_router::channel_bot_webhook_router(
                state.channel_bot_webhook_state.clone(),
            ),
        )
        .nest(
            "/internal",
            internal::router(state.clone())
                .nest("/notifications", notification::router())
                .nest(
                    "/search",
                    search_service::search_router()
                        .with_state(SearchHandlerState::from_ref(&state)),
                )
                .nest(
                    "/sync_service",
                    sync_service_hex::inbound::axum_router::sync_service_router(
                        sync_service_hex::inbound::axum_router::SyncServiceRouterState {
                            service: state.sync_service_client.clone(),
                            authorization_state: state.authorization_state.clone(),
                        },
                    ),
                )
                .layer(ServiceBuilder::new().layer(axum::middleware::from_fn(
                    macro_middleware::connection_drop_prevention_handler,
                ))),
        )
        .nest("/recents", recents::router())
        .nest("/saved_views", saved_views::router())
        .with_state(state);
    let dss_router = Router::new()
        .nest("/{version}", internal_router.clone())
        .merge(internal_router)
        .merge(webhook_router)
        .merge(internal_call_router)
        .merge(health::router());

    Router::new()
        .merge(dss_router.clone())
        .nest("/dss", dss_router)
}

#[cfg(test)]
mod compression_tests {
    use super::response_compression_layer;
    use axum::{
        Router,
        body::Body,
        http::{Request, header},
        routing::get,
    };
    use tower::ServiceExt;

    #[tokio::test]
    async fn recording_keeps_byte_offsets_while_json_remains_compressible() {
        let app = Router::new()
            .route(
                "/recording",
                get(|| async {
                    (
                        [
                            (header::CONTENT_TYPE, "video/mp4"),
                            (header::CONTENT_LENGTH, "64"),
                            (header::ACCEPT_RANGES, "bytes"),
                        ],
                        vec![0_u8; 64],
                    )
                }),
            )
            .route(
                "/preview",
                get(|| async {
                    (
                        [
                            (header::CONTENT_TYPE, "image/jpeg"),
                            (header::CONTENT_LENGTH, "64"),
                            (header::ACCEPT_RANGES, "bytes"),
                        ],
                        vec![0_u8; 64],
                    )
                }),
            )
            .route(
                "/json",
                get(|| async { ([(header::CONTENT_TYPE, "application/json")], "x".repeat(64)) }),
            )
            .layer(response_compression_layer());

        let recording = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/recording")
                    .header(header::ACCEPT_ENCODING, "gzip")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(recording.headers().get(header::CONTENT_ENCODING).is_none());
        assert_eq!(recording.headers()[header::CONTENT_LENGTH], "64");
        assert_eq!(recording.headers()[header::ACCEPT_RANGES], "bytes");

        let preview = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/preview")
                    .header(header::ACCEPT_ENCODING, "gzip")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert!(preview.headers().get(header::CONTENT_ENCODING).is_none());
        assert_eq!(preview.headers()[header::CONTENT_LENGTH], "64");
        assert_eq!(preview.headers()[header::ACCEPT_RANGES], "bytes");

        let json = app
            .oneshot(
                Request::builder()
                    .uri("/json")
                    .header(header::ACCEPT_ENCODING, "gzip")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(json.headers()[header::CONTENT_ENCODING], "gzip");
    }

    #[tokio::test]
    async fn cross_origin_head_media_preflight_allows_bearer_access() {
        let app = Router::new()
            .route("/call/record/{call_id}/media", get(|| async { "media" }))
            .layer(macro_cors::cors_layer());
        let response = app
            .oneshot(
                Request::builder()
                    .method("OPTIONS")
                    .uri("/call/record/1c4c9f96-e8cf-4f45-b27a-74e97bc3c21e/media")
                    .header(header::ORIGIN, "https://macro.com")
                    .header(header::ACCESS_CONTROL_REQUEST_METHOD, "HEAD")
                    .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "authorization")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let methods = response.headers()[header::ACCESS_CONTROL_ALLOW_METHODS]
            .to_str()
            .unwrap();
        assert!(methods.split(',').any(|method| method.trim() == "HEAD"));
        assert_eq!(
            response.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN],
            "https://macro.com"
        );
        assert_eq!(
            response.headers()[header::ACCESS_CONTROL_ALLOW_CREDENTIALS],
            "true"
        );
    }
}
