use conation_bundle_updater_plugin::domain::{
    asset_service::BundleAssetResolver, bundle_routes::BundleRoutes,
};
use conation_bundle_updater_plugin::inbound::plugin::retry_waiting_for_wifi;
#[cfg(feature = "auto_apply_update")]
use conation_bundle_updater_plugin::inbound::plugin::{
    allow_update_reload_retry, apply_completed_update_from, start_update_check,
};
use conation_bundle_updater_plugin::outbound::fs::FileSystem;
use device::{IsIpad, detect_is_ipad, is_ipad};
use logger::Logger;
use navigation_plugin::scheme::MacroScheme;
use navigation_plugin::{MacroNavigationPlugin, NavigatePayload};
use reqwest::cookie::CookieStore;
use reqwest::header::{COOKIE, ORIGIN};
use rootcause::{Report, report};
use share_target::{
    PendingShareFilesState, clear_shared_files, get_pending_share_filenames, is_share_deep_link,
    maybe_handle_share_deep_link, pop_shared_files, read_shared_file_text,
};
use staged_upload::cleanup_stale_staged_files;
use tauri::http::{HeaderMap, HeaderValue};
use tauri::{AppHandle, Emitter, Manager, RunEvent, Runtime};

mod tauri_protocol;

pub(crate) const APP_SCHEME: &str = env!("CONATION_TAURI_APP_SCHEME");
use tauri_plugin_deep_link::DeepLinkExt;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use url::Url;

mod device;
mod share_target;
mod staged_upload;

#[cfg(test)]
#[path = "../client_profile_config.rs"]
#[allow(
    dead_code,
    reason = "the build-profile module is included solely to run its unit tests"
)]
mod client_profile_config;

fn app_link_hosts() -> &'static [&'static str] {
    static HOSTS: std::sync::OnceLock<Box<[&'static str]>> = std::sync::OnceLock::new();
    HOSTS.get_or_init(|| {
        env!("CONATION_TAURI_APP_LINK_HOSTS")
            .split(',')
            .filter(|host| !host.is_empty())
            .collect()
    })
}

fn embedded_bundle_build() -> u64 {
    env!("CONATION_EMBEDDED_BUNDLE_BUILD")
        .parse()
        .expect("CONATION_EMBEDDED_BUNDLE_BUILD must be an unsigned integer")
}

/// This module provides debuging utilities and should not be compiled in prodiction builds
#[cfg(debug_assertions)] // do not remove this
mod debug;

/// domains which the tauri webview can render.
/// This should be as restrictive as possible.
/// If the webview attempts to naviate to other domains,
/// they will be opened in the systems default browser
static ALLOWED_DOMAINS: &[&str] = &[
    "http://tauri.localhost",
    "tauri://localhost",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "http://localhost:3004",
    "http://localhost:3005",
    "http://localhost:3006",
    "http://localhost:3007",
    "http://localhost:3008",
    "http://localhost:3009",
];

/// Hosts whose `/app` URLs are Conation app links. Main-frame navigations to
/// these are routed through the SPA router instead of loading the remote
/// site in the webview. Keep in parity with the deep-link hosts in
/// tauri.conf.json.
type Type = std::sync::OnceLock<
    Box<dyn Fn(&str, http::Request<Vec<u8>>, tauri::UriSchemeResponder) + Send + Sync + 'static>,
>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tracing_subscriber::EnvFilter;

    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        if cfg!(debug_assertions) {
            "debug,tungstenite=info,tokio_tungstenite=info,reqwest=info,hyper=info,h2=info".into()
        } else {
            "info,tungstenite=info,tokio_tungstenite=info,reqwest=info".into()
        }
    });

    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_file(true)
        .with_target(false)
        .with_writer(std::io::stderr)
        .with_line_number(true)
        .pretty();

    let registry = tracing_subscriber::registry().with(filter).with(fmt_layer);

    #[cfg(target_os = "ios")]
    let registry = registry.with(tracing_oslog::OsLogger::new("dev.conation.app", "default"));

    registry.init();

    // UIKit must be queried on the main thread, and `run()` is called straight
    // from `main()` (`ffi::start_app()` on iOS), so this is it. The idiom never
    // changes at runtime, so a one-shot snapshot is enough.
    let is_ipad_device = detect_is_ipad();

    let embedded_bundle_build = embedded_bundle_build();
    let bundle_routes = BundleRoutes::new(embedded_bundle_build);
    let bundle_asset_resolver = BundleAssetResolver::new(bundle_routes.clone(), FileSystem);
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // single instance plugin should always be the first registered
        tracing::debug!("register single instance plugin");
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, argv, _cwd| {
            tracing::debug!("single instance callback with argv: {argv:?}");
        }))
    }

    #[cfg(target_os = "ios")]
    {
        builder = builder
            .plugin(tauri_plugin_haptics::init())
            .plugin(tauri_plugin_input_accessory::init())
            .plugin(tauri_plugin_network_status::init())
            .plugin(tauri_plugin_pasteboard::init())
            .plugin(tauri_plugin_photo_library::init())
            .plugin(tauri_plugin_call_kit::init());
    }

    // register the rest of the common plugins
    // The log plugin with "tracing" feature emits tracing::event! directly,
    // so logs from the webview will go through our tracing subscriber
    builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Debug)
                .skip_logger() // Don't set up log crate logger, we only want the tracing events
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_device_info::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_websocket::Builder::new()
                .merge_header_callback(Box::new(merge_header_callback))
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(
            MacroNavigationPlugin::new(ALLOWED_DOMAINS)
                .expect("Domains must be valid urls")
                .with_app_link_hosts(app_link_hosts())
                .with_app_scheme(APP_SCHEME),
        )
        .plugin(
            conation_bundle_updater_plugin::inbound::plugin::MacroBundleUpdaterPlugin::new(
                env!("CONATION_BUNDLE_UPDATE_BASE_URL")
                    .parse()
                    .expect("valid url"),
                embedded_bundle_build,
                bundle_routes.clone(),
            )
            // Builds without this feature (just ios-dev, ios-build-no-update)
            // must never check for or apply OTA bundles on their own; manual
            // checks from settings still work.
            .with_auto_update(cfg!(feature = "auto_apply_update")),
        );

    #[cfg(mobile)]
    {
        // register mobile specific plugins
        builder = builder
            .plugin(tauri_plugin_safe_area_insets::init())
            .plugin(tauri_plugin_notifications::init())
            .plugin(tauri_plugin_virtual_keyboard::init())
            .plugin(tauri_plugin_auth::init());
    }

    // Window origin differs by platform:
    // macOS/iOS/Linux: tauri://localhost
    // Windows/Android: https://tauri.localhost (or http://)
    let window_origin = if cfg!(any(target_os = "windows", target_os = "android")) {
        "https://tauri.localhost"
    } else {
        "tauri://localhost"
    };

    builder
        .register_asynchronous_uri_scheme_protocol("tauri", {
            // Build this outside the closure so we only create it once.
            // We need the AppHandle which isn't available until setup, but
            // register_asynchronous_uri_scheme_protocol gives us UriSchemeContext.
            // However, tauri_protocol::get needs AppHandle upfront.
            // Use a lazy init pattern via the context.
            let window_origin = window_origin.to_string();
            let handler: Type = std::sync::OnceLock::new();

            move |ctx, request, responder| {
                let h = handler.get_or_init(|| {
                    let app = ctx.app_handle();
                    tauri_protocol::get(app.clone(), &window_origin, bundle_asset_resolver.clone())
                });
                h(ctx.webview_label(), request, responder);
            }
        })
        .manage(PendingShareFilesState::default())
        .manage(DeepLinkDelivery::default())
        .manage(graphql_cache_plugin::CacheState::default())
        .manage(IsIpad(is_ipad_device))
        .invoke_handler(tauri::generate_handler![
            graphql_cache_plugin::commands::graphql_cache_init,
            graphql_cache_plugin::commands::graphql_cache_current_revision,
            graphql_cache_plugin::commands::graphql_cache_read,
            graphql_cache_plugin::commands::graphql_cache_read_records_by_keys,
            graphql_cache_plugin::commands::graphql_cache_search,
            graphql_cache_plugin::commands::graphql_cache_write,
            graphql_cache_plugin::commands::graphql_cache_hydrate,
            graphql_cache_plugin::commands::graphql_cache_enqueue_optimistic_mutation,
            graphql_cache_plugin::commands::graphql_cache_inspect_query_variants,
            graphql_cache_plugin::commands::graphql_cache_inspect_query,
            graphql_cache_plugin::commands::graphql_cache_claim_next_mutation,
            graphql_cache_plugin::commands::graphql_cache_defer_optimistic_write,
            graphql_cache_plugin::commands::graphql_cache_commit_optimistic_write,
            graphql_cache_plugin::commands::graphql_cache_rollback_optimistic_write,
            graphql_cache_plugin::commands::graphql_cache_invalidate,
            graphql_cache_plugin::commands::graphql_cache_delete_records,
            graphql_cache_plugin::commands::graphql_cache_teardown,
            graphql_cache_plugin::commands::graphql_cache_clear,
            conation_bundle_updater_plugin::inbound::plugin::grant_bundle_update,
            conation_bundle_updater_plugin::inbound::plugin::perform_update,
            conation_bundle_updater_plugin::inbound::plugin::ack_bundle_update_reload,
            conation_bundle_updater_plugin::inbound::plugin::check_for_update,
            conation_bundle_updater_plugin::inbound::plugin::get_bundle_debug_info,
            conation_bundle_updater_plugin::inbound::plugin::get_bundle_update_status,
            conation_bundle_updater_plugin::inbound::plugin::clear_bundle,
            is_ipad,
            get_pending_share_filenames,
            pop_shared_files,
            clear_shared_files,
            read_shared_file_text,
            flush_launch_deep_link,
            staged_upload::upload_staged_file_to_presigned_url,
        ])
        .setup(|app| {
            #[cfg(any(target_os = "linux", all(windows, debug_assertions)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link()
                    .register_all()
                    .inspect(|_| tracing::debug!("attached scheme handler"))
                    .log_and_consume();
            }

            app.chain(attach_deep_link_handler);
            cleanup_stale_staged_files(&app.handle());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |app_handle, event| match &event {
            RunEvent::Ready => {
                #[cfg(feature = "auto_apply_update")]
                {
                    let app = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        match apply_completed_update_from(&app, "run_event_ready").await {
                            Ok(_) => {}
                            Err(e) => {
                                tracing::error!("Failed to auto-apply bundle update on ready: {e}");
                            }
                        }
                    });
                }
            }
            RunEvent::Resumed => {
                let app = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = retry_waiting_for_wifi(&app).await {
                        tracing::warn!("Failed to retry bundle update Wi-Fi wait on resume: {e}");
                    }
                });
                #[cfg(feature = "auto_apply_update")]
                {
                    let app = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = allow_update_reload_retry(&app).await {
                            tracing::warn!(
                                "Failed to allow bundle update reload retry on resume: {e}"
                            );
                        }
                        match apply_completed_update_from(&app, "run_event_resumed").await {
                            Ok(true) => {}
                            Ok(false) => {
                                if let Err(e) = start_update_check(&app).await {
                                    tracing::error!(
                                        "Failed to start bundle update check on resume: {e}"
                                    );
                                }
                            }
                            Err(e) => {
                                tracing::error!("Failed to auto-apply bundle update: {e}");
                            }
                        }
                    });
                }
            }
            RunEvent::Exit => {
                if let Some(state) = app_handle.try_state::<graphql_cache_plugin::CacheState>() {
                    state
                        .shutdown()
                        .inspect_err(
                            |error| tracing::error!(error=?error, "failed to close graphql cache"),
                        )
                        .ok();
                }
            }
            _ => {}
        });
}

/// fn to merge the headers from the http cookie store into the initial
/// GET request to open a websocket
fn merge_header_callback<R: Runtime>(url: String, headers: &mut HeaderMap, handle: &AppHandle<R>) {
    let Ok(mut parsed_url) = Url::parse(&url) else {
        return;
    };

    // Standalone services share the operator host and need its public web
    // origin rather than the synthetic tauri://localhost origin. Compare a
    // complete origin mapping, not just the hostname: localhost services on
    // distinct ports are distinct security origins.
    if websocket_matches_operator_origin(&parsed_url, env!("CONATION_TAURI_OPERATOR_ORIGIN")) {
        headers.insert(
            ORIGIN,
            HeaderValue::from_static(env!("CONATION_TAURI_OPERATOR_ORIGIN")),
        );
    }

    // Cookie forwarding requires the HTTP plugin's cookie jar.
    let Some(s) = handle.try_state::<tauri_plugin_http::Http>() else {
        return;
    };
    parsed_url
        .set_scheme(match parsed_url.scheme() {
            "ws" => "http",
            _ => "https",
        })
        .ok();
    tracing::trace!("checking cookies for {parsed_url}");

    if let Some(cookie) = s.inner().cookies_jar.as_ref().cookies(&parsed_url) {
        tracing::trace!("inserting cookie value for {parsed_url}");
        headers.insert(COOKIE, cookie);
    }
}

/// Returns whether a WebSocket URL is the WS equivalent of the public
/// operator origin. HTTP operators are reached over `ws`, HTTPS operators over
/// `wss`; hostname comparison is case-insensitive and ports include defaults.
fn websocket_matches_operator_origin(websocket: &Url, operator_origin: &str) -> bool {
    let Ok(operator) = Url::parse(operator_origin) else {
        return false;
    };
    let expected_websocket_scheme = match operator.scheme() {
        "http" => "ws",
        "https" => "wss",
        _ => return false,
    };

    websocket.scheme() == expected_websocket_scheme
        && websocket
            .host_str()
            .zip(operator.host_str())
            .is_some_and(|(websocket_host, operator_host)| {
                websocket_host.eq_ignore_ascii_case(operator_host)
            })
        && websocket.port_or_known_default() == operator.port_or_known_default()
}

#[cfg(test)]
mod websocket_origin_tests {
    use super::websocket_matches_operator_origin;
    use url::Url;

    #[test]
    fn only_sets_the_public_origin_for_the_matching_websocket_origin() {
        let cases = [
            ("ws://localhost:8090/websocket", "http://localhost:8090", true),
            ("wss://operator.example.test/websocket", "https://operator.example.test", true),
            ("wss://OPERATOR.example.test/websocket", "https://operator.example.test", true),
            ("wss://operator.example.test/websocket", "https://operator.example.test:443", true),
            ("ws://localhost:9999/websocket", "http://localhost:8090", false),
            ("wss://operator.example.test/websocket", "http://operator.example.test", false),
            ("ws://operator.example.test/websocket", "https://operator.example.test", false),
            ("wss://other.example.test/websocket", "https://operator.example.test", false),
        ];

        for (websocket, operator, expected) in cases {
            assert_eq!(
                websocket_matches_operator_origin(&Url::parse(websocket).unwrap(), operator),
                expected,
                "websocket={websocket}, operator={operator}"
            );
        }
    }
}

trait AppChain {
    fn chain(&mut self, f: impl FnOnce(&mut Self)) -> &mut Self;
}

impl AppChain for tauri::App {
    fn chain(&mut self, f: impl FnOnce(&mut Self)) -> &mut Self {
        f(self);
        self
    }
}

/// Buffers deep links until the frontend can receive them. `on_open_url`
/// starts firing during startup, before the webview has registered its
/// `navigate` listener, so an early link would be emitted into the void; it is
/// held here instead (latest wins) and delivered when the frontend signals
/// readiness by calling `flush_launch_deep_link`. After that, links emit
/// directly.
#[derive(Default)]
struct DeepLinkDelivery {
    launch: std::sync::Mutex<LaunchState>,
}

#[derive(Default)]
enum LaunchState {
    /// Frontend `navigate` listener not registered yet; no link has arrived.
    #[default]
    NotReady,
    /// Frontend listener not registered yet and a link arrived; held for the
    /// flush (latest wins).
    PendingNavigation(Url),
    /// Frontend is ready; links emit directly.
    Ready,
}

/// Convert a deep link url into a `navigate` event for the frontend router.
#[tracing::instrument(err, skip(handle))]
fn emit_navigate_for_deep_link(url: Url, handle: &AppHandle) -> Result<(), Report> {
    // Universal/App links come in as https:// URLs; custom links use
    // conation://.
    let conation_scheme = match url.scheme() {
        s if s == APP_SCHEME => MacroScheme::new_with_scheme(url, APP_SCHEME)?,
        "http" | "https" => MacroScheme::from_url_with_scheme(&url, APP_SCHEME)?,
        scheme => {
            return Err(report!("unexpected deep link scheme: {}", scheme));
        }
    };

    let payload = NavigatePayload {
        path: conation_scheme.0.path(),
        query: conation_scheme.0.query().unwrap_or_default(),
    };
    // we send a navigate event instead of calling navigate directly
    // because navigate performs a full browser navigation

    tracing::trace!("{payload:?}");
    Ok(handle.emit("navigate", payload)?)
}

fn attach_deep_link_handler(app: &mut tauri::App) {
    app.deep_link().on_open_url({
        let handle = app.handle().clone();
        move |ev| {
            let urls = ev.urls();
            tracing::trace!("received open url event {urls:?}");
            let Some(url) = urls.into_iter().next() else {
                tracing::warn!("open url event contained no urls");
                return;
            };
            if maybe_handle_share_deep_link(&handle, &url) {
                return;
            }

            let delivery = handle.state::<DeepLinkDelivery>();
            let to_emit = {
                let Ok(mut state) = delivery.launch.lock() else {
                    tracing::error!("deep link state mutex poisoned; dropping deep link");
                    return;
                };
                match &*state {
                    // Emitting now would be lost — hold the link for the flush.
                    LaunchState::NotReady | LaunchState::PendingNavigation(_) => {
                        tracing::trace!("frontend not ready; buffering deep link");
                        *state = LaunchState::PendingNavigation(url);
                        None
                    }
                    LaunchState::Ready => Some(url),
                }
            };
            if let Some(url) = to_emit {
                emit_navigate_for_deep_link(url, &handle).log_and_consume();
            }
        }
    });
}

/// Delivers any deep link that arrived before the frontend registered its
/// `navigate` listener, and switches subsequent links to direct delivery. The
/// frontend calls this once its listener exists. Only the first call delivers —
/// a later call (listener remount, SPA reload) must not re-navigate to a stale
/// launch link.
#[tauri::command]
fn flush_launch_deep_link(app: AppHandle, delivery: tauri::State<'_, DeepLinkDelivery>) {
    // The link that launched the app, as recorded by the deep-link plugin.
    // Needed when the launch link's open-url event fires before our listener
    // in setup() exists and so was never buffered — on Windows/Linux the
    // plugin processes the launch argv during its own init, and on Android the
    // native intent can arrive equally early. Share deep links are skipped:
    // their native handling already ran at launch and the frontend pulls the
    // files through the share commands.
    // The plugin's vec is not a history: it holds the URLs of the most recent
    // open event only (usually one; macOS can batch several in one event) and
    // is replaced wholesale per event. Within a batch, prefer the last entry
    // as the most recent, falling back past any share links.
    let launch_url = match app.deep_link().get_current() {
        Ok(Some(urls)) => urls.into_iter().rev().find(|url| !is_share_deep_link(url)),
        Ok(None) => None,
        Err(e) => {
            tracing::warn!(error=?e, "failed to read launch deep link");
            None
        }
    };

    let to_emit = {
        let Ok(mut state) = delivery.launch.lock() else {
            tracing::error!("deep link state mutex poisoned; dropping launch deep link");
            return;
        };
        match std::mem::replace(&mut *state, LaunchState::Ready) {
            // A buffered link is newer than the launch link, so it wins.
            LaunchState::PendingNavigation(url) => Some(url),
            LaunchState::NotReady => launch_url,
            LaunchState::Ready => None,
        }
    };

    if let Some(url) = to_emit {
        tracing::debug!("flushing deep link {url}");
        emit_navigate_for_deep_link(url, &app).log_and_consume();
    }
}
