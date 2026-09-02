use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AppEnvironment {
    Development,
    Production,
}

impl AppEnvironment {
    pub(crate) fn parse(value: &str) -> Result<Self, String> {
        match value {
            "development" => Ok(Self::Development),
            "production" => Ok(Self::Production),
            other => Err(format!(
                ".conation-tauri-env must contain `development` or `production`, found `{other}`"
            )),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ClientProfile {
    Standalone,
    HostedLegacy,
}

impl ClientProfile {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Standalone => "standalone",
            Self::HostedLegacy => "hosted-legacy",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ClientProfileConfig {
    pub(crate) profile: ClientProfile,
    pub(crate) operator_origin: String,
    pub(crate) auth_service_url: String,
    pub(crate) bundle_update_base_url: String,
    pub(crate) app_link_hosts: Vec<String>,
    pub(crate) app_scheme: &'static str,
}

fn is_managed_legacy_host(hostname: &str) -> bool {
    ["macro.com", "macroverse.workers.dev"]
        .iter()
        .any(|suffix| {
            hostname.eq_ignore_ascii_case(suffix)
                || hostname
                    .to_ascii_lowercase()
                    .ends_with(&format!(".{suffix}"))
        })
}

fn parse_root_origin(value: &str, reject_managed: bool) -> Result<Url, String> {
    let parsed = Url::parse(value)
        .map_err(|error| format!("operator origin must be an absolute URL: {error}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("operator origin must use http or https".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("operator origin must not contain credentials".to_string());
    }
    if parsed.path() != "/" || parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("operator origin must not contain a path, query, or fragment".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "operator origin must contain a host".to_string())?;
    if reject_managed && is_managed_legacy_host(host) {
        return Err(format!(
            "standalone Conation cannot target managed legacy host {host}"
        ));
    }
    Ok(parsed)
}

fn normalize_update_base(value: &str, reject_managed: bool) -> Result<String, String> {
    let mut parsed = Url::parse(value)
        .map_err(|error| format!("bundle update base URL must be absolute: {error}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("bundle update base URL must use http or https".to_string());
    }
    if !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(
            "bundle update base URL must not contain credentials, query, or fragment".to_string(),
        );
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "bundle update base URL must contain a host".to_string())?;
    if reject_managed && is_managed_legacy_host(host) {
        return Err(format!(
            "standalone Conation bundle updates cannot target managed legacy host {host}"
        ));
    }
    if !parsed.path().ends_with('/') {
        parsed.set_path(&format!("{}/", parsed.path()));
    }
    Ok(parsed.to_string())
}

pub(crate) fn resolve_client_profile(
    environment: AppEnvironment,
    profile: Option<&str>,
    operator_origin: Option<&str>,
    bundle_update_base_url: Option<&str>,
) -> Result<ClientProfileConfig, String> {
    let profile = match profile {
        None | Some("") | Some("standalone") => ClientProfile::Standalone,
        Some("hosted-legacy") => ClientProfile::HostedLegacy,
        Some(other) => {
            return Err(format!(
                "CONATION_CLIENT_PROFILE must be `standalone` or `hosted-legacy`, found `{other}`"
            ));
        }
    };

    match profile {
        ClientProfile::Standalone => {
            let default_origin = match environment {
                AppEnvironment::Development => "http://localhost:8090",
                AppEnvironment::Production => "https://conation.dev",
            };
            let requested_origin = match operator_origin {
                Some(value) if value.trim().is_empty() => {
                    return Err("CONATION_OPERATOR_ORIGIN must not be blank".to_string());
                }
                Some(value) => value.trim(),
                None => default_origin,
            };
            let origin = parse_root_origin(requested_origin, true)?;
            let origin_string = origin.origin().ascii_serialization();
            let auth_service_url = format!("{origin_string}/auth/");
            let bundle_update_base_url = match bundle_update_base_url {
                Some(value) if value.trim().is_empty() => {
                    return Err("CONATION_BUNDLE_UPDATE_BASE_URL must not be blank".to_string());
                }
                Some(value) => normalize_update_base(value.trim(), true)?,
                None => auth_service_url.clone(),
            };
            Ok(ClientProfileConfig {
                profile,
                operator_origin: origin_string,
                auth_service_url,
                bundle_update_base_url,
                app_link_hosts: vec![origin.host_str().expect("validated host").to_string()],
                app_scheme: "conation",
            })
        }
        ClientProfile::HostedLegacy => {
            let (operator_origin, auth_service_url) = match environment {
                AppEnvironment::Development => (
                    "https://dev.macro.com",
                    "https://auth-service-dev.macro.com/",
                ),
                AppEnvironment::Production => {
                    ("https://macro.com", "https://auth-service.macro.com/")
                }
            };
            let bundle_update_base_url = match bundle_update_base_url {
                Some(value) if value.trim().is_empty() => {
                    return Err("CONATION_BUNDLE_UPDATE_BASE_URL must not be blank".to_string());
                }
                Some(value) => normalize_update_base(value.trim(), false)?,
                None => auth_service_url.to_string(),
            };
            Ok(ClientProfileConfig {
                profile,
                operator_origin: operator_origin.to_string(),
                auth_service_url: auth_service_url.to_string(),
                bundle_update_base_url,
                app_link_hosts: vec![
                    "macro.com".to_string(),
                    "dev.macro.com".to_string(),
                    "staging.macro.com".to_string(),
                ],
                app_scheme: "macro",
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_defaults_to_conation_standalone() {
        let config = resolve_client_profile(AppEnvironment::Production, None, None, None).unwrap();
        assert_eq!(config.profile, ClientProfile::Standalone);
        assert_eq!(config.operator_origin, "https://conation.dev");
        assert_eq!(config.auth_service_url, "https://conation.dev/auth/");
        assert_eq!(config.app_link_hosts, ["conation.dev"]);
        assert_eq!(config.app_scheme, "conation");
        assert!(!format!("{config:?}").contains("macro.com"));
    }

    #[test]
    fn standalone_custom_origin_configures_every_native_endpoint() {
        let config = resolve_client_profile(
            AppEnvironment::Production,
            Some("standalone"),
            Some("https://team.example.test:8443"),
            Some("https://updates.example.test/native"),
        )
        .unwrap();
        assert_eq!(config.operator_origin, "https://team.example.test:8443");
        assert_eq!(
            config.auth_service_url,
            "https://team.example.test:8443/auth/"
        );
        assert_eq!(
            config.bundle_update_base_url,
            "https://updates.example.test/native/"
        );
        assert_eq!(config.app_link_hosts, ["team.example.test"]);
    }

    #[test]
    fn standalone_rejects_managed_or_non_origin_values() {
        for origin in [
            "https://macro.com",
            "https://auth-service.macro.com",
            "https://conation.dev/app",
            "ftp://conation.dev",
        ] {
            assert!(
                resolve_client_profile(
                    AppEnvironment::Production,
                    Some("standalone"),
                    Some(origin),
                    None,
                )
                .is_err(),
                "{origin}"
            );
        }
        assert!(
            resolve_client_profile(
                AppEnvironment::Production,
                Some("standalone"),
                None,
                Some("https://updates.macro.com/native"),
            )
            .is_err()
        );
    }

    #[test]
    fn hosted_values_require_explicit_profile() {
        let config = resolve_client_profile(
            AppEnvironment::Production,
            Some("hosted-legacy"),
            None,
            None,
        )
        .unwrap();
        assert_eq!(config.profile, ClientProfile::HostedLegacy);
        assert_eq!(config.operator_origin, "https://macro.com");
        assert_eq!(config.app_scheme, "macro");
    }
}
