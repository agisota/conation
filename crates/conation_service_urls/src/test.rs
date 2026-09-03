use super::testing_harness::{with_mock_override_env, with_mock_service_url_profile_env};
use super::*;
use conation_env::Environment;

const ENVS: [Environment; 3] = [
    Environment::Production,
    Environment::Develop,
    Environment::Local,
];

fn assert_parses_for_all_environments<T>(service_url_for_environment: impl Fn(Environment) -> T)
where
    T: AsRef<str>,
{
    for environment in ENVS {
        service_url_for_environment(environment)
            .as_ref()
            .parse::<Url>()
            .unwrap();
    }
}

#[test]
fn app_service_url_parses() {
    assert_parses_for_all_environments(AppServiceUrl::default_for_environment);
}

#[test]
fn auth_service_url_parses() {
    assert_parses_for_all_environments(AuthServiceUrl::default_for_environment);
}

#[test]
fn pdf_service_url_parses() {
    assert_parses_for_all_environments(PdfServiceUrl::default_for_environment);
}

#[test]
fn document_storage_service_url_parses() {
    assert_parses_for_all_environments(DocumentStorageServiceUrl::default_for_environment);
}

#[test]
fn websocket_service_url_parses() {
    assert_parses_for_all_environments(WebsocketServiceUrl::default_for_environment);
}

#[test]
fn connection_gateway_url_parses() {
    assert_parses_for_all_environments(ConnectionGatewayUrl::default_for_environment);
}

#[test]
fn connection_gateway_websocket_url_parses() {
    assert_parses_for_all_environments(ConnectionGatewayWebsocketUrl::default_for_environment);
}

#[test]
fn agent_proxy_websocket_url_parses() {
    assert_parses_for_all_environments(AgentProxyWebsocketUrl::default_for_environment);
}

#[test]
fn document_cognition_service_url_parses() {
    assert_parses_for_all_environments(DocumentCognitionServiceUrl::default_for_environment);
}

#[test]
fn notification_service_url_parses() {
    assert_parses_for_all_environments(NotificationServiceUrl::default_for_environment);
}

#[test]
fn static_file_service_url_parses() {
    assert_parses_for_all_environments(StaticFileServiceUrl::default_for_environment);
}

#[test]
fn agent_harness_service_url_parses() {
    assert_parses_for_all_environments(AgentHarnessServiceUrl::default_for_environment);
}

#[test]
fn unfurl_service_url_parses() {
    assert_parses_for_all_environments(UnfurlServiceUrl::default_for_environment);
}

#[test]
fn contacts_service_url_parses() {
    assert_parses_for_all_environments(ContactsServiceUrl::default_for_environment);
}

#[test]
fn email_service_url_parses() {
    assert_parses_for_all_environments(EmailServiceUrl::default_for_environment);
}

#[test]
fn image_proxy_service_url_parses() {
    assert_parses_for_all_environments(ImageProxyServiceUrl::default_for_environment);
}

#[test]
fn lexical_service_url_parses() {
    assert_parses_for_all_environments(LexicalServiceUrl::default_for_environment);
}

#[test]
fn sync_service_url_parses() {
    assert_parses_for_all_environments(SyncServiceUrl::default_for_environment);
}

#[test]
fn ai_editing_worker_url_parses() {
    assert_parses_for_all_environments(AiEditingWorkerUrl::default_for_environment);
}

crate::service_url! {
    #[derive(Debug, Clone)]
    pub struct TestServiceUrl {
        local: "http://localhost:8080",
        dev: "https://test-dev.macro.com",
        prod: "https://test.macro.com",
    }
}

fn missing_override(_: &'static str) -> Result<String, std::env::VarError> {
    Err(std::env::VarError::NotPresent)
}

#[test]
fn defaults_are_selected_by_environment() {
    with_mock_override_env(missing_override, || {
        assert_eq!(
            TestServiceUrl::new_for_environment_with_profile(
                conation_env::Environment::Local,
                ServiceUrlProfile::Managed,
            )
            .unwrap()
            .as_ref(),
            "http://localhost:8080",
        );
        assert_eq!(
            TestServiceUrl::new_for_environment_with_profile(
                conation_env::Environment::Develop,
                ServiceUrlProfile::Managed,
            )
            .unwrap()
            .as_ref(),
            "https://test-dev.macro.com",
        );
        assert_eq!(
            TestServiceUrl::new_for_environment_with_profile(
                conation_env::Environment::Production,
                ServiceUrlProfile::Managed,
            )
            .unwrap()
            .as_ref(),
            "https://test.macro.com",
        );
    });
}

#[test]
fn default_values_are_borrowed() {
    let service_url = TestServiceUrl::default_for_environment(conation_env::Environment::Local);

    assert_eq!(service_url.as_ref(), "http://localhost:8080");
    assert_eq!(
        service_url.inner().borrowed_inner(),
        Some("http://localhost:8080"),
    );
}

fn mock_test_service_override(var_name: &'static str) -> Result<String, std::env::VarError> {
    (var_name == "OVERRIDE_TEST_SERVICE_URL")
        .then(|| "https://override.macro.com".to_string())
        .ok_or(std::env::VarError::NotPresent)
}

#[test]
fn override_env_var_wins_over_environment_default() {
    let service_url = with_mock_override_env(mock_test_service_override, || {
        TestServiceUrl::new_for_environment_with_profile(
            conation_env::Environment::Local,
            ServiceUrlProfile::Managed,
        )
        .unwrap()
    });

    assert_eq!(service_url.as_ref(), "https://override.macro.com");
    assert_eq!(
        service_url.override_env_var_name(),
        "OVERRIDE_TEST_SERVICE_URL",
    );
    assert_eq!(
        service_url.inner().owned_inner().unwrap(),
        "https://override.macro.com",
    );
}

#[test]
fn helpers_construct_expected_defaults() {
    assert_eq!(TestServiceUrl::local().as_ref(), "http://localhost:8080");
    assert_eq!(TestServiceUrl::dev().as_ref(), "https://test-dev.macro.com");
    assert_eq!(TestServiceUrl::prod().as_ref(), "https://test.macro.com");
}

#[test]
fn copied_returns_a_borrowed_view() {
    let service_url = TestServiceUrl::from_owned("https://runtime.macro.com");
    let copied = service_url.copied();

    assert_eq!(copied.as_ref(), "https://runtime.macro.com");
    assert_eq!(copied.borrowed_inner(), Some("https://runtime.macro.com"));
}

crate::service_url! {
    #[derive(Debug)]
    pub struct TestServiceUrls {
        #[derive(Debug, Clone)]
        pub TestDocumentStorageServiceUrl {
            local: "http://localhost:8086",
            dev: "https://cloud-storage-dev.macro.com",
            prod: "https://cloud-storage.macro.com",
        },
        #[derive(Debug, Clone)]
        pub TestEmailServiceUrl {
            local: "http://localhost:8087",
            dev: "https://email-service-dev.macro.com",
            prod: "https://email-service.macro.com",
        },
    }
}

fn mock_group_overrides(var_name: &'static str) -> Result<String, std::env::VarError> {
    match var_name {
        "OVERRIDE_TEST_EMAIL_SERVICE_URL" => Ok("https://email-override.macro.com".to_string()),
        _ => Err(std::env::VarError::NotPresent),
    }
}

#[test]
fn grouped_conation_resolves_all_service_urls() {
    let service_urls = with_mock_override_env(mock_group_overrides, || {
        TestServiceUrls::new_for_environment_with_profile(
            conation_env::Environment::Develop,
            ServiceUrlProfile::Managed,
        )
        .unwrap()
    });

    assert_eq!(
        service_urls.test_document_storage_service_url.as_ref(),
        "https://cloud-storage-dev.macro.com",
    );
    assert_eq!(
        service_urls.test_email_service_url.as_ref(),
        "https://email-override.macro.com",
    );
}

#[test]
fn grouped_defaults_do_not_check_overrides() {
    let service_urls =
        TestServiceUrls::default_for_environment(conation_env::Environment::Production);

    assert_eq!(
        service_urls.test_document_storage_service_url.as_ref(),
        "https://cloud-storage.macro.com",
    );
    assert_eq!(
        service_urls.test_email_service_url.as_ref(),
        "https://email-service.macro.com",
    );
}

#[test]
fn exported_service_urls_match_local_values() {
    let service_urls = ServiceUrls::default_for_environment(conation_env::Environment::Local);

    assert_eq!(
        service_urls.app_service_url.as_ref(),
        "http://localhost:3000"
    );
    assert_eq!(
        service_urls.auth_service_url.as_ref(),
        "http://localhost:8080"
    );
    assert_eq!(
        service_urls.pdf_service_url.as_ref(),
        "http://localhost:4567"
    );
    assert_eq!(
        service_urls.document_storage_service_url.as_ref(),
        "http://localhost:8086",
    );
    assert_eq!(
        service_urls.websocket_service_url.as_ref(),
        "ws://localhost:6969"
    );
    assert_eq!(
        service_urls.connection_gateway_url.as_ref(),
        "http://localhost:8082",
    );
    assert_eq!(
        service_urls.connection_gateway_websocket_url.as_ref(),
        "ws://localhost:8082",
    );
    assert_eq!(
        service_urls.agent_proxy_websocket_url.as_ref(),
        "ws://localhost:8091",
    );
    assert_eq!(
        service_urls.document_cognition_service_url.as_ref(),
        "http://localhost:8085",
    );
    assert_eq!(
        service_urls.notification_service_url.as_ref(),
        "http://localhost:8089",
    );
    assert_eq!(
        service_urls.static_file_service_url.as_ref(),
        "http://localhost:8100",
    );
    assert_eq!(
        service_urls.agent_harness_service_url.as_ref(),
        "http://localhost:8101",
    );
    assert_eq!(
        service_urls.unfurl_service_url.as_ref(),
        "http://localhost:8095"
    );
    assert_eq!(
        service_urls.contacts_service_url.as_ref(),
        "http://localhost:8083"
    );
    assert_eq!(
        service_urls.email_service_url.as_ref(),
        "http://localhost:8087"
    );
    assert_eq!(
        service_urls.image_proxy_service_url.as_ref(),
        "http://localhost:8097",
    );
    assert_eq!(
        service_urls.lexical_service_url.as_ref(),
        "http://localhost:8096"
    );
    assert_eq!(
        service_urls.sync_service_url.as_ref(),
        "http://localhost:8787"
    );
    assert_eq!(
        service_urls.ai_editing_worker_url.as_ref(),
        "http://localhost:8933"
    );
}

#[test]
fn exported_service_urls_match_dev_values() {
    let service_urls = ServiceUrls::default_for_environment(conation_env::Environment::Develop);

    assert_eq!(
        service_urls.app_service_url.as_ref(),
        "https://dev.macro.com"
    );
    assert_eq!(
        service_urls.auth_service_url.as_ref(),
        "https://auth-service-dev.macro.com",
    );
    assert_eq!(
        service_urls.pdf_service_url.as_ref(),
        "https://pdf-service-dev.macro.com",
    );
    assert_eq!(
        service_urls.document_storage_service_url.as_ref(),
        "https://cloud-storage-dev.macro.com",
    );
    assert_eq!(
        service_urls.websocket_service_url.as_ref(),
        "wss://services-dev.macro.com",
    );
    assert_eq!(
        service_urls.connection_gateway_url.as_ref(),
        "https://connection-gateway-dev.macro.com",
    );
    assert_eq!(
        service_urls.connection_gateway_websocket_url.as_ref(),
        "wss://connection-gateway-dev.macro.com",
    );
    assert_eq!(
        service_urls.agent_proxy_websocket_url.as_ref(),
        "wss://agent-proxy-dev.macro.com",
    );
    assert_eq!(
        service_urls.document_cognition_service_url.as_ref(),
        "https://document-cognition-dev.macro.com",
    );
    assert_eq!(
        service_urls.notification_service_url.as_ref(),
        "https://notifications-dev.conation.dev",
    );
    assert_eq!(
        service_urls.static_file_service_url.as_ref(),
        "https://static-file-service-dev.macro.com",
    );
    assert_eq!(
        service_urls.agent_harness_service_url.as_ref(),
        "https://agent-harness-dev.macro.com",
    );
    assert_eq!(
        service_urls.unfurl_service_url.as_ref(),
        "https://unfurl-service-dev.macro.com",
    );
    assert_eq!(
        service_urls.contacts_service_url.as_ref(),
        "https://contacts-dev.macro.com",
    );
    assert_eq!(
        service_urls.email_service_url.as_ref(),
        "https://email-service-dev.macro.com",
    );
    assert_eq!(
        service_urls.image_proxy_service_url.as_ref(),
        "https://image-proxy-dev.macro.com",
    );
    assert_eq!(
        service_urls.lexical_service_url.as_ref(),
        "https://lexical-service-dev.macroverse.workers.dev",
    );
    assert_eq!(
        service_urls.sync_service_url.as_ref(),
        "https://sync-service-dev3.macroverse.workers.dev",
    );
    assert_eq!(
        service_urls.ai_editing_worker_url.as_ref(),
        "https://ai-editing-worker-dev.macroverse.workers.dev",
    );
}

#[test]
fn exported_service_urls_match_prod_values() {
    let service_urls = ServiceUrls::default_for_environment(conation_env::Environment::Production);

    assert_eq!(service_urls.app_service_url.as_ref(), "https://macro.com");
    assert_eq!(
        service_urls.auth_service_url.as_ref(),
        "https://auth-service.macro.com",
    );
    assert_eq!(
        service_urls.pdf_service_url.as_ref(),
        "https://pdf-service.macro.com",
    );
    assert_eq!(
        service_urls.document_storage_service_url.as_ref(),
        "https://cloud-storage.macro.com",
    );
    assert_eq!(
        service_urls.websocket_service_url.as_ref(),
        "wss://services.macro.com",
    );
    assert_eq!(
        service_urls.connection_gateway_url.as_ref(),
        "https://connection-gateway.macro.com",
    );
    assert_eq!(
        service_urls.connection_gateway_websocket_url.as_ref(),
        "wss://connection-gateway.macro.com",
    );
    assert_eq!(
        service_urls.agent_proxy_websocket_url.as_ref(),
        "wss://agent-proxy.macro.com",
    );
    assert_eq!(
        service_urls.document_cognition_service_url.as_ref(),
        "https://document-cognition.macro.com",
    );
    assert_eq!(
        service_urls.notification_service_url.as_ref(),
        "https://notifications.conation.dev",
    );
    assert_eq!(
        service_urls.static_file_service_url.as_ref(),
        "https://static-file-service.macro.com",
    );
    assert_eq!(
        service_urls.agent_harness_service_url.as_ref(),
        "https://agent-harness.macro.com",
    );
    assert_eq!(
        service_urls.unfurl_service_url.as_ref(),
        "https://unfurl-service.macro.com",
    );
    assert_eq!(
        service_urls.contacts_service_url.as_ref(),
        "https://contacts.macro.com",
    );
    assert_eq!(
        service_urls.email_service_url.as_ref(),
        "https://email-service.macro.com",
    );
    assert_eq!(
        service_urls.image_proxy_service_url.as_ref(),
        "https://image-proxy.macro.com",
    );
    assert_eq!(
        service_urls.lexical_service_url.as_ref(),
        "https://lexical-service-prod.macroverse.workers.dev",
    );
    assert_eq!(
        service_urls.sync_service_url.as_ref(),
        "https://sync-service-prod2.macroverse.workers.dev",
    );
    assert_eq!(
        service_urls.ai_editing_worker_url.as_ref(),
        "https://ai-editing-worker.macroverse.workers.dev",
    );
}

#[test]
fn exported_service_url_override_names_are_derived_from_env_var_names() {
    assert_eq!(
        AppServiceUrl::local().override_env_var_name(),
        "OVERRIDE_APP_SERVICE_URL",
    );
    assert_eq!(
        AuthServiceUrl::local().override_env_var_name(),
        "OVERRIDE_AUTH_SERVICE_URL",
    );
    assert_eq!(
        PdfServiceUrl::local().override_env_var_name(),
        "OVERRIDE_PDF_SERVICE_URL",
    );
    assert_eq!(
        DocumentStorageServiceUrl::local().override_env_var_name(),
        "OVERRIDE_DOCUMENT_STORAGE_SERVICE_URL",
    );
    assert_eq!(
        WebsocketServiceUrl::local().override_env_var_name(),
        "OVERRIDE_WEBSOCKET_SERVICE_URL",
    );
    assert_eq!(
        ConnectionGatewayUrl::local().override_env_var_name(),
        "OVERRIDE_CONNECTION_GATEWAY_URL",
    );
    assert_eq!(
        ConnectionGatewayWebsocketUrl::local().override_env_var_name(),
        "OVERRIDE_CONNECTION_GATEWAY_WEBSOCKET_URL",
    );
    assert_eq!(
        AgentProxyWebsocketUrl::local().override_env_var_name(),
        "OVERRIDE_AGENT_PROXY_WEBSOCKET_URL",
    );
    assert_eq!(
        DocumentCognitionServiceUrl::local().override_env_var_name(),
        "OVERRIDE_DOCUMENT_COGNITION_SERVICE_URL",
    );
    assert_eq!(
        NotificationServiceUrl::local().override_env_var_name(),
        "OVERRIDE_NOTIFICATION_SERVICE_URL",
    );
    assert_eq!(
        StaticFileServiceUrl::local().override_env_var_name(),
        "OVERRIDE_STATIC_FILE_SERVICE_URL",
    );
    assert_eq!(
        AgentHarnessServiceUrl::local().override_env_var_name(),
        "OVERRIDE_AGENT_HARNESS_SERVICE_URL",
    );
    assert_eq!(
        UnfurlServiceUrl::local().override_env_var_name(),
        "OVERRIDE_UNFURL_SERVICE_URL",
    );
    assert_eq!(
        ContactsServiceUrl::local().override_env_var_name(),
        "OVERRIDE_CONTACTS_SERVICE_URL",
    );
    assert_eq!(
        EmailServiceUrl::local().override_env_var_name(),
        "OVERRIDE_EMAIL_SERVICE_URL",
    );
    assert_eq!(
        ImageProxyServiceUrl::local().override_env_var_name(),
        "OVERRIDE_IMAGE_PROXY_SERVICE_URL",
    );
    assert_eq!(
        LexicalServiceUrl::local().override_env_var_name(),
        "OVERRIDE_LEXICAL_SERVICE_URL",
    );
    assert_eq!(
        SyncServiceUrl::local().override_env_var_name(),
        "OVERRIDE_SYNC_SERVICE_URL",
    );
    assert_eq!(
        AiEditingWorkerUrl::local().override_env_var_name(),
        "OVERRIDE_AI_EDITING_WORKER_URL",
    );
}

#[test]
fn service_url_converts_to_string() {
    let service_url = ServiceUrl::borrowed("https://borrowed.macro.com");
    let url_string: String = service_url.into();

    assert_eq!(url_string, "https://borrowed.macro.com");
}

#[test]
fn service_url_profiles_parse_supported_values() {
    assert_eq!(
        "managed".parse::<ServiceUrlProfile>().unwrap(),
        ServiceUrlProfile::Managed,
    );
    assert_eq!(
        "strict-self-host".parse::<ServiceUrlProfile>().unwrap(),
        ServiceUrlProfile::StrictSelfHost,
    );
    assert_eq!(ServiceUrlProfile::default(), ServiceUrlProfile::Managed);
}

#[test]
fn unset_service_url_profile_preserves_managed_defaults() {
    let service_url = with_mock_service_url_profile_env(missing_override, || {
        with_mock_override_env(missing_override, || {
            TestServiceUrl::new_for_environment(conation_env::Environment::Develop).unwrap()
        })
    });

    assert_eq!(service_url.as_ref(), "https://test-dev.macro.com");
    assert_eq!(
        service_url.inner().borrowed_inner(),
        Some("https://test-dev.macro.com"),
    );
}

#[test]
fn managed_service_url_profile_preserves_existing_unvalidated_overrides() {
    let service_url = with_mock_service_url_profile_env(
        |_| Ok("managed".to_owned()),
        || {
            with_mock_override_env(mock_test_service_override, || {
                TestServiceUrl::new_for_environment(conation_env::Environment::Local).unwrap()
            })
        },
    );

    assert_eq!(service_url.as_ref(), "https://override.macro.com");
}

#[test]
fn invalid_service_url_profile_errors() {
    let error = with_mock_service_url_profile_env(
        |_| Ok("unsupported-profile".to_owned()),
        || {
            TestServiceUrl::new_for_environment(conation_env::Environment::Local)
                .expect_err("invalid profile must fail")
        },
    );

    match error {
        ServiceUrlResolutionError::InvalidProfile(error) => {
            assert_eq!(error.value(), "unsupported-profile");
        }
        other => panic!("expected invalid profile error, got {other:?}"),
    }
}

#[test]
fn strict_profile_from_environment_requires_an_override() {
    let error = with_mock_service_url_profile_env(
        |_| Ok("strict-self-host".to_owned()),
        || {
            with_mock_override_env(missing_override, || {
                TestServiceUrl::new_for_environment(conation_env::Environment::Local)
                    .expect_err("strict profile must require an override")
            })
        },
    );

    assert!(matches!(
        error,
        ServiceUrlResolutionError::MissingOverride {
            var_name: "OVERRIDE_TEST_SERVICE_URL"
        }
    ));
}

fn strict_test_service_error(value: &'static str) -> ServiceUrlResolutionError {
    with_mock_override_env(
        move |var_name| {
            (var_name == "OVERRIDE_TEST_SERVICE_URL")
                .then(|| value.to_owned())
                .ok_or(std::env::VarError::NotPresent)
        },
        || {
            TestServiceUrl::new_for_environment_with_profile(
                conation_env::Environment::Local,
                ServiceUrlProfile::StrictSelfHost,
            )
            .expect_err("invalid strict URL must fail")
        },
    )
}

#[test]
fn strict_self_host_rejects_invalid_http_url_shapes() {
    let cases = [
        ("/relative", StrictSelfHostUrlError::NotAbsolute),
        (
            "ws://document-storage-service:8086",
            StrictSelfHostUrlError::UnsupportedScheme {
                actual: "ws".to_owned(),
                expected: "`http` or `https`",
            },
        ),
        (
            "http://operator:secret@document-storage-service:8086",
            StrictSelfHostUrlError::UserInfo,
        ),
        (
            "http://document-storage-service:8086?debug=true",
            StrictSelfHostUrlError::Query,
        ),
        (
            "http://document-storage-service:8086#internal",
            StrictSelfHostUrlError::Fragment,
        ),
        (
            "https://macro.com",
            StrictSelfHostUrlError::ForbiddenManagedHost {
                host: "macro.com".to_owned(),
            },
        ),
        (
            "https://api.macro.com",
            StrictSelfHostUrlError::ForbiddenManagedHost {
                host: "api.macro.com".to_owned(),
            },
        ),
        (
            "https://macroverse.workers.dev",
            StrictSelfHostUrlError::ForbiddenManagedHost {
                host: "macroverse.workers.dev".to_owned(),
            },
        ),
        (
            "https://worker.macroverse.workers.dev",
            StrictSelfHostUrlError::ForbiddenManagedHost {
                host: "worker.macroverse.workers.dev".to_owned(),
            },
        ),
    ];

    for (value, expected_reason) in cases {
        let error = strict_test_service_error(value);
        match error {
            ServiceUrlResolutionError::InvalidOverrideUrl {
                var_name,
                value: actual_value,
                reason,
            } => {
                assert_eq!(var_name, "OVERRIDE_TEST_SERVICE_URL");
                assert_eq!(actual_value, value);
                assert_eq!(reason, expected_reason);
            }
            other => panic!("expected invalid strict URL error, got {other:?}"),
        }
    }
}

#[test]
fn strict_self_host_allows_http_and_https_hosts_and_paths() {
    let service_url = with_mock_override_env(
        |var_name| {
            (var_name == "OVERRIDE_TEST_SERVICE_URL")
                .then(|| "http://document-storage-service:8086/internal/api".to_owned())
                .ok_or(std::env::VarError::NotPresent)
        },
        || {
            TestServiceUrl::new_for_environment_with_profile(
                conation_env::Environment::Local,
                ServiceUrlProfile::StrictSelfHost,
            )
            .unwrap()
        },
    );

    assert_eq!(
        service_url.as_ref(),
        "http://document-storage-service:8086/internal/api",
    );

    let https_url = with_mock_override_env(
        |var_name| {
            (var_name == "OVERRIDE_TEST_SERVICE_URL")
                .then(|| "https://api.conation.internal/v1".to_owned())
                .ok_or(std::env::VarError::NotPresent)
        },
        || {
            TestServiceUrl::new_for_environment_with_profile(
                conation_env::Environment::Local,
                ServiceUrlProfile::StrictSelfHost,
            )
            .unwrap()
        },
    );

    assert_eq!(https_url.as_ref(), "https://api.conation.internal/v1");

    let unrelated_domain_url = with_mock_override_env(
        |var_name| {
            (var_name == "OVERRIDE_TEST_SERVICE_URL")
                .then(|| "https://notmacro.com/v1".to_owned())
                .ok_or(std::env::VarError::NotPresent)
        },
        || {
            TestServiceUrl::new_for_environment_with_profile(
                conation_env::Environment::Local,
                ServiceUrlProfile::StrictSelfHost,
            )
            .unwrap()
        },
    );

    assert_eq!(unrelated_domain_url.as_ref(), "https://notmacro.com/v1");
}

#[test]
fn strict_self_host_enforces_websocket_schemes() {
    let invalid_result = with_mock_override_env(
        |var_name| {
            (var_name == "OVERRIDE_WEBSOCKET_SERVICE_URL")
                .then(|| "https://websocket-service:6969".to_owned())
                .ok_or(std::env::VarError::NotPresent)
        },
        || {
            WebsocketServiceUrl::new_for_environment_with_profile(
                conation_env::Environment::Local,
                ServiceUrlProfile::StrictSelfHost,
            )
        },
    );

    let invalid_error = match invalid_result {
        Ok(_) => panic!("HTTP URL must be rejected for websocket service"),
        Err(error) => error,
    };

    assert!(matches!(
        invalid_error,
        ServiceUrlResolutionError::InvalidOverrideUrl {
            reason: StrictSelfHostUrlError::UnsupportedScheme {
                actual,
                expected: "`ws` or `wss`",
            },
            ..
        } if actual == "https"
    ));

    let websocket_url = with_mock_override_env(
        |var_name| {
            (var_name == "OVERRIDE_WEBSOCKET_SERVICE_URL")
                .then(|| "wss://websocket-service.example:6969".to_owned())
                .ok_or(std::env::VarError::NotPresent)
        },
        || {
            WebsocketServiceUrl::new_for_environment_with_profile(
                conation_env::Environment::Local,
                ServiceUrlProfile::StrictSelfHost,
            )
            .unwrap()
        },
    );

    assert_eq!(
        websocket_url.as_ref(),
        "wss://websocket-service.example:6969",
    );
}

const EXPORTED_SERVICE_URL_OVERRIDE_ENV_VARS: [&str; 19] = [
    "OVERRIDE_APP_SERVICE_URL",
    "OVERRIDE_AUTH_SERVICE_URL",
    "OVERRIDE_PDF_SERVICE_URL",
    "OVERRIDE_DOCUMENT_STORAGE_SERVICE_URL",
    "OVERRIDE_WEBSOCKET_SERVICE_URL",
    "OVERRIDE_CONNECTION_GATEWAY_URL",
    "OVERRIDE_CONNECTION_GATEWAY_WEBSOCKET_URL",
    "OVERRIDE_AGENT_PROXY_WEBSOCKET_URL",
    "OVERRIDE_DOCUMENT_COGNITION_SERVICE_URL",
    "OVERRIDE_NOTIFICATION_SERVICE_URL",
    "OVERRIDE_STATIC_FILE_SERVICE_URL",
    "OVERRIDE_AGENT_HARNESS_SERVICE_URL",
    "OVERRIDE_UNFURL_SERVICE_URL",
    "OVERRIDE_CONTACTS_SERVICE_URL",
    "OVERRIDE_EMAIL_SERVICE_URL",
    "OVERRIDE_IMAGE_PROXY_SERVICE_URL",
    "OVERRIDE_LEXICAL_SERVICE_URL",
    "OVERRIDE_SYNC_SERVICE_URL",
    "OVERRIDE_AI_EDITING_WORKER_URL",
];

const STRICT_SELF_HOST_SERVICE_URL_VALUES: [&str; 19] = [
    "http://app:3000",
    "http://authentication-service:8080",
    "http://pdf-service:4567",
    "http://document-storage-service:8086",
    "ws://websocket-service:6969",
    "http://connection-gateway:8082",
    "ws://connection-gateway:8082",
    "ws://agent-proxy:8091",
    "http://document-cognition-service:8085",
    "http://notification-service:8089",
    "http://static-file-service:8100",
    "http://agent-harness-service:8101",
    "http://unfurl-service:8095",
    "http://contacts-service:8083",
    "http://email-service:8087",
    "http://image-proxy-service:8097",
    "http://lexical-service:8096",
    "http://sync-service:8787",
    "http://ai-editing-worker:8933",
];

fn strict_self_host_override(var_name: &'static str) -> Result<String, std::env::VarError> {
    EXPORTED_SERVICE_URL_OVERRIDE_ENV_VARS
        .iter()
        .position(|candidate| *candidate == var_name)
        .map(|index| STRICT_SELF_HOST_SERVICE_URL_VALUES[index].to_owned())
        .ok_or(std::env::VarError::NotPresent)
}

#[test]
fn strict_self_host_requires_every_exported_service_override() {
    for var_name in EXPORTED_SERVICE_URL_OVERRIDE_ENV_VARS {
        let result = with_mock_override_env(
            move |candidate| {
                if candidate == var_name {
                    Err(std::env::VarError::NotPresent)
                } else {
                    strict_self_host_override(candidate)
                }
            },
            || {
                ServiceUrls::new_for_environment_with_profile(
                    conation_env::Environment::Local,
                    ServiceUrlProfile::StrictSelfHost,
                )
            },
        );

        let error = match result {
            Ok(_) => panic!("strict profile unexpectedly accepted missing {var_name}"),
            Err(error) => error,
        };
        assert!(matches!(
            error,
            ServiceUrlResolutionError::MissingOverride { var_name: actual } if actual == var_name
        ));
    }
}

#[test]
fn strict_self_host_accepts_all_exported_service_overrides() {
    let service_urls = with_mock_override_env(strict_self_host_override, || {
        ServiceUrls::new_for_environment_with_profile(
            conation_env::Environment::Local,
            ServiceUrlProfile::StrictSelfHost,
        )
        .unwrap()
    });

    let actual = [
        service_urls.app_service_url.as_ref(),
        service_urls.auth_service_url.as_ref(),
        service_urls.pdf_service_url.as_ref(),
        service_urls.document_storage_service_url.as_ref(),
        service_urls.websocket_service_url.as_ref(),
        service_urls.connection_gateway_url.as_ref(),
        service_urls.connection_gateway_websocket_url.as_ref(),
        service_urls.agent_proxy_websocket_url.as_ref(),
        service_urls.document_cognition_service_url.as_ref(),
        service_urls.notification_service_url.as_ref(),
        service_urls.static_file_service_url.as_ref(),
        service_urls.agent_harness_service_url.as_ref(),
        service_urls.unfurl_service_url.as_ref(),
        service_urls.contacts_service_url.as_ref(),
        service_urls.email_service_url.as_ref(),
        service_urls.image_proxy_service_url.as_ref(),
        service_urls.lexical_service_url.as_ref(),
        service_urls.sync_service_url.as_ref(),
        service_urls.ai_editing_worker_url.as_ref(),
    ];

    assert_eq!(actual, STRICT_SELF_HOST_SERVICE_URL_VALUES);
}
