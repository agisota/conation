use super::*;
use crate::local::{inventory, repo_root};

/// Every inventoried service that declares a path prefix must get a route in the
/// generated Caddyfile, targeting its canonical compose service name. This is
/// the guarantee that replaces the old hand-maintained route list.
#[test]
fn generates_a_route_for_every_prefixed_service() {
    let caddy = caddyfile(Mode::Local, false);
    for svc in inventory::RUST_SERVICES {
        let Some(prefix) = svc.path_prefix else {
            continue;
        };
        assert!(
            caddy.contains(&format!("reverse_proxy {}:8080", svc.compose_name)),
            "Caddyfile is missing a route to {}",
            svc.compose_name
        );
        assert!(
            caddy.contains(&format!("{prefix}/*")),
            "Caddyfile is missing the {prefix} prefix"
        );
    }
}

/// WebSocket services use the bare-prefix `@matcher` + explicit strip; HTTP
/// services use `handle_path`.
#[test]
fn websocket_services_use_a_matcher() {
    let caddy = caddyfile(Mode::Local, false);
    // connection-gateway is the inventoried WebSocket service.
    assert!(caddy.contains("@connection_gateway path /connection-gateway /connection-gateway/*"));
    assert!(caddy.contains("uri strip_prefix /connection-gateway"));
    // A plain HTTP service uses handle_path.
    assert!(caddy.contains("handle_path /auth/* {"));
}

/// The analytics-proxy worker is reached through the single origin at `/i/*`
/// (PostHog and OTLP traces/logs), un-stripped, on its own :8098 port.
#[test]
fn analytics_proxy_route_is_present() {
    let caddy = caddyfile(Mode::Local, false);
    assert!(caddy.contains("handle /i/* {"));
    assert!(caddy.contains("reverse_proxy analytics-proxy:8098"));
}

#[test]
fn document_content_services_are_available_through_the_proxy() {
    let caddy = caddyfile(Mode::Local, false);

    assert!(caddy.contains("uri strip_prefix /sync"));
    assert!(caddy.contains("reverse_proxy sync-service:8787"));
    assert!(caddy.contains("handle_path /lexical/*"));
    assert!(caddy.contains("reverse_proxy lexical-service:8096"));
    assert!(caddy.contains("handle_path /ai-editing/*"));
    assert!(caddy.contains("reverse_proxy ai-editing-worker:8933"));
}

#[test]
fn mcp_transport_and_oauth_routes_preserve_protocol_paths() {
    let caddy = caddyfile(Mode::Local, false);

    assert!(caddy.contains("@mcp path /mcp /mcp/*"));
    assert!(caddy.contains("reverse_proxy mcp_service:8080"));
    assert!(!caddy.contains("uri strip_prefix /mcp"));
    for path in [
        "/authorize",
        "/register",
        "/token",
        "/oauth/callback",
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
        "/.well-known/oauth-authorization-server",
        "/.well-known/oauth-authorization-server/mcp",
    ] {
        assert!(
            caddy.contains(path),
            "Caddyfile is missing MCP OAuth route {path}"
        );
    }
    assert!(
        !caddy.contains("/.well-known/*"),
        "MCP must not claim unrelated well-known resources"
    );
    assert!(caddy.contains("respond \"Conation local proxy\" 200"));
}

#[test]
fn public_proxy_rejects_non_public_mcp_egress_routes() {
    let caddy = caddyfile(Mode::Local, false);

    let rejected_routes = "@non_public_mcp_egress path /mcp-conation /mcp-conation/*";
    assert!(caddy.contains(rejected_routes));
    assert!(
        caddy.contains("handle @non_public_mcp_egress {\n        respond \"Not Found\" 404\n    }")
    );
    assert!(
        caddy.find(rejected_routes).unwrap() < caddy.find("@mcp path /mcp /mcp/*").unwrap(),
        "the negative matcher must run before public MCP ingress"
    );
}

/// The static-file block is the one route that differs by mode: LocalStack S3
/// fan-out locally, the dev-pointed service in dev.
#[test]
fn static_file_block_is_mode_specific() {
    assert!(caddyfile(Mode::Local, false).contains("/static-file-storage"));
    assert!(caddyfile(Mode::Dev, false).contains("handle_path /static-file/*"));
    assert!(!caddyfile(Mode::Dev, false).contains("/static-file-storage"));
}

/// Browser object PUTs (canvas, files) hit `/s3/{bucket}/{key}` on the
/// single-origin proxy. Dev talks to real S3, so it must not grow this route.
#[test]
fn local_proxy_exposes_path_style_s3() {
    let local = caddyfile(Mode::Local, false);
    assert!(local.contains("handle_path /s3/* {"));
    assert!(local.contains("reverse_proxy localstack:4566"));
    assert!(local.contains("header_up Host localstack:4566"));
    assert!(!caddyfile(Mode::Dev, false).contains("handle_path /s3/*"));
}

/// Drift gate across the Rust↔TypeScript seam: every proxied service's prefix
/// must be wired into `createStandaloneServers()` in `serverProfile.ts`, or
/// the frontend can't reach it through the single-origin proxy. The frontend
/// profile can't be derived from Rust, so this test keeps the two in sync.
#[test]
fn frontend_wires_every_inventory_prefix() {
    let profile = repo_root().join("apps/web/src/lib/core/constant/serverProfile.ts");
    let src = std::fs::read_to_string(&profile)
        .unwrap_or_else(|e| panic!("reading {}: {e}", profile.display()));
    for svc in inventory::RUST_SERVICES {
        let Some(prefix) = svc.path_prefix else {
            continue;
        };
        let http = format!("${{origin}}{prefix}");
        let ws = format!("${{wsOrigin}}{prefix}");
        assert!(
            src.contains(&http) || src.contains(&ws),
            "serverProfile.ts createStandaloneServers() is missing prefix {prefix} (for {}); \
             the frontend can't reach it through the proxy",
            svc.compose_name
        );
    }
}

/// The static-frontend block only appears in headless mode, and serves the
/// mounted bundle under `/app` with an SPA fallback. Attached `run_local` keeps
/// the dev server as the frontend origin and must not grow the block.
#[test]
fn static_frontend_block_is_opt_in() {
    let headless = caddyfile(Mode::Local, true);
    assert!(headless.contains("handle_path /app/* {"));
    assert!(headless.contains("root * /srv/frontend"));
    assert!(headless.contains("try_files {path} /index.html"));
    assert!(headless.contains("redir / \"/app/?{query}\" 302"));
    assert!(headless.contains("handle /mailpit/*"));

    let attached = caddyfile(Mode::Local, false);
    assert!(!attached.contains("/srv/frontend"));
    assert!(!attached.contains("redir / /app/ 302"));
    assert!(!attached.contains("handle /mailpit/*"));

    let headless_dev = caddyfile(Mode::Dev, true);
    assert!(!headless_dev.contains("handle /mailpit/*"));
}

#[test]
fn headless_support_avatar_urls_are_served_by_static_frontend() {
    let headless = caddyfile(Mode::Local, true);
    let instance = Instance::derive(Some("headless-support"), Some(31_000)).unwrap();
    let avatar_url = format!(
        "{}/support-avatars/pythia.svg",
        super::super::frontend::static_url(&instance).trim_end_matches('/')
    );

    assert_eq!(
        avatar_url,
        "http://localhost:31009/app/support-avatars/pythia.svg"
    );
    assert!(headless.contains("handle_path /app/* {"));
    assert!(headless.contains("file_server"));
}
