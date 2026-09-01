use super::*;

fn provider() -> StalwartProvider {
    StalwartProvider::new(
        Url::parse("http://stalwart:8080/").expect("valid JMAP URL"),
        Url::parse("http://stalwart:8080/api/").expect("valid admin URL"),
        "credential-user-42",
        "not-logged",
    )
}

#[test]
fn gmail_remains_the_safe_default() {
    assert_eq!(EmailProviderKind::default(), EmailProviderKind::Gmail);
}

#[test]
fn debug_output_redacts_admin_credentials() {
    let output = format!("{:?}", provider());
    assert!(!output.contains("credential-user-42"));
    assert!(!output.contains("not-logged"));
    assert!(output.contains("[redacted]"));
}

#[tokio::test]
async fn unwired_jmap_operations_fail_closed() {
    let provider = provider();

    assert!(matches!(
        provider.list_threads("token", 10, None).await,
        Err(ProviderError::Unsupported(_))
    ));
    assert!(matches!(
        provider.get_message("token", "message").await,
        Err(ProviderError::Unsupported(_))
    ));
    assert!(matches!(
        provider.send_message("token", b"mime", None).await,
        Err(ProviderError::Unsupported(_))
    ));
    assert!(matches!(
        provider.register_watch("token").await,
        Err(ProviderError::Unsupported(_))
    ));
    assert!(matches!(
        provider.stop_watch("token").await,
        Err(ProviderError::Unsupported(_))
    ));
}
