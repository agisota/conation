//! ACP sidecar
//!
//! An ACP bridge plus a loopback-only OpenAI-compatible fallback proxy.
//!
//! The bridge forwards one websocket connection to one `<harness> acp`
//! process's stdio. The local proxy keeps OmniRoute credentials out of
//! OpenCode and tries the configured models only before an upstream response
//! has started.
//!
//! Process-per-connection: connect spawns the harness, disconnect kills it.
//! GET /ping is a readiness probe callers poll before connecting.

use clap::Parser;

use crate::server::{Config, acp_app, proxy_app};

mod server;

/// Bridge one websocket connection to one ACP harness process's stdio.
#[derive(Parser)]
struct Args {
    /// ACP harness binary (name or absolute path).
    #[arg(long, env = "ACP_HARNESS", default_value = "opencode")]
    harness: String,
    /// Directory the harness runs the agent in.
    #[arg(long, env = "ACP_WORKSPACE", default_value = "/workspace")]
    workspace: String,
    /// Port to listen on.
    #[arg(long, env = "ACP_PORT", default_value_t = 8700)]
    port: u16,
    /// Loopback-only port for OpenCode's OpenAI-compatible provider.
    #[arg(long, env = "ROX_PROXY_PORT", default_value_t = 8701)]
    rox_proxy_port: u16,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().init();

    let args = Args::parse();
    tracing::info!(
        port = args.port,
        harness = %args.harness,
        workspace = %args.workspace,
        rox_proxy_port = args.rox_proxy_port,
        "acp-sidecar listening"
    );
    let config = Config::from_env(args.harness, args.workspace).unwrap_or_else(|error| {
        tracing::error!(reason = %error, "invalid OmniRoute fallback proxy configuration");
        std::process::exit(2);
    });
    let acp_listener = tokio::net::TcpListener::bind(("0.0.0.0", args.port))
        .await
        .expect("bind sidecar port");
    let proxy_listener = tokio::net::TcpListener::bind(("127.0.0.1", args.rox_proxy_port))
        .await
        .expect("bind OmniRoute fallback proxy port");

    tokio::select! {
        result = axum::serve(acp_listener, acp_app(config.clone())) => result.expect("serve ACP bridge"),
        result = axum::serve(proxy_listener, proxy_app(config)) => result.expect("serve OmniRoute fallback proxy"),
    }
}
