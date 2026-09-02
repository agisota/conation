mod client_profile_config;

use client_profile_config::{AppEnvironment, resolve_client_profile};
use serde::Deserialize;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BuildProfile {
    profile: Option<String>,
    operator_origin: Option<String>,
    bundle_update_base_url: Option<String>,
}

fn main() {
    println!("cargo:rerun-if-changed=.conation-tauri-env");
    println!("cargo:rerun-if-changed=.conation-tauri-profile.json");
    println!("cargo:rerun-if-changed=../../dist/bundle-manifest.json");
    let contents = std::fs::read_to_string(".conation-tauri-env")
        .unwrap_or_else(|_| "development".to_string());
    let environment =
        AppEnvironment::parse(contents.trim()).unwrap_or_else(|error| panic!("{error}"));

    let build_profile = read_build_profile()
        .unwrap_or_else(|error| panic!("invalid Conation Tauri build profile: {error}"));
    let config = resolve_client_profile(
        environment,
        build_profile.profile.as_deref(),
        build_profile.operator_origin.as_deref(),
        build_profile.bundle_update_base_url.as_deref(),
    )
    .unwrap_or_else(|error| panic!("invalid Conation Tauri client profile: {error}"));

    let app_environment = match environment {
        AppEnvironment::Development => "development",
        AppEnvironment::Production => "production",
    };
    println!("cargo:rustc-env=CONATION_TAURI_APP_ENV={app_environment}");
    println!(
        "cargo:rustc-env=CONATION_TAURI_CLIENT_PROFILE={}",
        config.profile.as_str()
    );
    println!(
        "cargo:rustc-env=CONATION_TAURI_OPERATOR_ORIGIN={}",
        config.operator_origin
    );
    println!(
        "cargo:rustc-env=CONATION_TAURI_AUTH_SERVICE_URL={}",
        config.auth_service_url
    );
    println!(
        "cargo:rustc-env=CONATION_BUNDLE_UPDATE_BASE_URL={}",
        config.bundle_update_base_url
    );
    println!(
        "cargo:rustc-env=CONATION_TAURI_APP_LINK_HOSTS={}",
        config.app_link_hosts.join(",")
    );
    println!(
        "cargo:rustc-env=CONATION_TAURI_APP_SCHEME={}",
        config.app_scheme
    );

    let embedded_bundle_build = match read_embedded_bundle_build() {
        Ok(bundle_build) => bundle_build,
        Err(error) if environment == AppEnvironment::Production => {
            panic!("{error}");
        }
        Err(error) => {
            println!("cargo:warning={error}; falling back to embedded bundle build 0");
            0
        }
    };
    println!("cargo:rustc-env=CONATION_EMBEDDED_BUNDLE_BUILD={embedded_bundle_build}");

    tauri_build::build()
}

fn read_build_profile() -> Result<BuildProfile, String> {
    let path = ".conation-tauri-profile.json";
    match std::fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|error| format!("failed to parse {path}: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(BuildProfile::default()),
        Err(error) => Err(format!("failed to read {path}: {error}")),
    }
}

fn read_embedded_bundle_build() -> Result<u64, String> {
    let path = "../../dist/bundle-manifest.json";
    let contents =
        std::fs::read_to_string(path).map_err(|e| format!("failed to read {path}: {e}"))?;
    let manifest = serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|e| format!("failed to parse {path}: {e}"))?;
    manifest
        .get("bundleBuild")
        .and_then(|value| value.as_u64())
        .ok_or_else(|| format!("{path} missing unsigned integer bundleBuild"))
}
