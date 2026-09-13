use super::*;

#[test]
fn status_is_honest_unlinked_cef() {
    let host = StubHost::new();
    let status = host.status();
    assert_eq!(status.engine, "cef");
    assert!(!status.linked);
    assert!(status.detail.contains("not linked"));
}

#[test]
fn open_records_tab_and_history() {
    let host = StubHost::new();
    let url = Url::parse("https://example.com/login").unwrap();
    let tab = host.open(&url);
    assert_eq!(tab.id, 1);
    assert_eq!(tab.url, url);
    assert_eq!(tab.title, "example.com");
    assert_eq!(host.tabs().len(), 1);
    assert_eq!(host.history().len(), 1);
    assert_eq!(host.history()[0].tab_id, 1);
}

#[test]
fn close_removes_tab_keeps_history() {
    let host = StubHost::new();
    let a = host.open(&Url::parse("https://a.example/").unwrap());
    let b = host.open(&Url::parse("https://b.example/").unwrap());
    assert!(host.close(a.id));
    assert!(!host.close(a.id));
    let tabs = host.tabs();
    assert_eq!(tabs.len(), 1);
    assert_eq!(tabs[0].id, b.id);
    assert_eq!(host.history().len(), 2);
}

#[test]
fn capabilities_are_unsupported_until_cef_is_linked() {
    let host = StubHost::new();
    for cap in [
        AgentCapability::DomCapture,
        AgentCapability::Annotations,
        AgentCapability::Downloads,
        AgentCapability::AuthSessions,
    ] {
        let err = host.capability(cap).expect_err("stub must refuse");
        assert_eq!(err.capability, cap);
        assert!(!err.linked);
    }
}

#[test]
fn process_host_is_shared() {
    let url = Url::parse("https://shared.example/").unwrap();
    let tab = process_host().open(&url);
    assert!(process_host().tabs().iter().any(|t| t.id == tab.id));
}
