use super::*;
use wiremock::{
    matchers::{body_json, header, method, path},
    Mock, MockServer, ResponseTemplate,
};

const TOKEN: &str = "per-user-test-token";

fn provider(server: &MockServer) -> StalwartProvider {
    StalwartProvider::new(Url::parse(&format!("{}/", server.uri())).expect("valid JMAP URL"))
}

fn session(server: &MockServer) -> Value {
    json!({
        "apiUrl": format!("{}/jmap/", server.uri()),
        "uploadUrl": format!("{}/jmap/upload/{{accountId}}/", server.uri()),
        "downloadUrl": format!("{}/jmap/download/{{accountId}}/{{blobId}}/{{name}}", server.uri()),
        "capabilities": { JMAP_CORE: {}, JMAP_MAIL: {}, JMAP_SUBMISSION: {} },
        "accounts": { "u1": { "accountCapabilities": { JMAP_MAIL: {} } } },
        "primaryAccounts": { JMAP_MAIL: "u1" }
    })
}

async fn mount_session(server: &MockServer) {
    Mock::given(method("GET"))
        .and(path("/jmap/session"))
        .and(header("authorization", "Bearer per-user-test-token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(session(server)))
        .mount(server)
        .await;
}

#[test]
fn gmail_remains_the_safe_default() {
    assert_eq!(EmailProviderKind::default(), EmailProviderKind::Gmail);
}

#[test]
fn construction_requires_only_the_jmap_endpoint() {
    let provider =
        StalwartProvider::new(Url::parse("https://mail.example.test/").expect("valid JMAP URL"));
    let output = format!("{provider:?}");
    assert!(output.contains("mail.example.test"));
}

#[tokio::test]
async fn lists_recent_threads_via_standard_jmap_query_then_get() {
    let server = MockServer::start().await;
    mount_session(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_MAIL],
            "methodCalls": [["Email/query", {"accountId": "u1", "collapseThreads": true, "position": 5, "limit": 10, "sort": [{"property": "receivedAt", "isAscending": false}]}, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"methodResponses": [["Email/query", {"ids": ["m1"]}, "c1"]]})))
        .mount(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_MAIL],
            "methodCalls": [["Email/get", {"accountId": "u1", "ids": ["m1"], "fetchTextBodyValues": true, "fetchHTMLBodyValues": true, "properties": ["id", "threadId", "subject", "from", "to", "receivedAt", "hasAttachment", "keywords", "preview", "textBody", "htmlBody", "bodyValues", "attachments"]}, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["Email/get", {"list": [{"id": "m1", "threadId": "t1", "subject": "Здравствуйте", "from": [{"email": "pythia@conation.dev"}], "to": [{"email": "user@example.test"}], "receivedAt": "2026-09-02T12:00:00Z", "hasAttachment": true, "keywords": {"$seen": true, "$flagged": false}, "attachments": [{"blobId": "att-1", "name": "brief.pdf", "type": "application/pdf", "size": 1024}]}]}, "c1"]]
        })))
        .mount(&server).await;
    let messages = provider(&server)
        .list_threads(TOKEN, 10, Some("5"))
        .await
        .expect("list");
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].thread_id, "t1");
    assert_eq!(messages[0].from.as_deref(), Some("pythia@conation.dev"));
    assert_eq!(messages[0].labels, vec!["$seen"]);
    assert!(messages[0].has_attachments);
    assert_eq!(messages[0].attachments.len(), 1);
    assert_eq!(messages[0].attachments[0].blob_id, "att-1");
    assert_eq!(messages[0].attachments[0].name.as_deref(), Some("brief.pdf"));
    assert_eq!(messages[0].attachments[0].mime_type, "application/pdf");
    assert_eq!(messages[0].attachments[0].size, 1024);
}

#[tokio::test]
async fn gets_one_message_and_maps_an_empty_list_to_none() {
    let server = MockServer::start().await;
    mount_session(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"methodResponses": [["Email/get", {"list": []}, "c1"]]})),
        )
        .mount(&server)
        .await;
    assert!(provider(&server)
        .get_message(TOKEN, "missing")
        .await
        .expect("get")
        .is_none());
}

#[tokio::test]
async fn sends_mime_by_uploading_importing_then_submitting() {
    let server = MockServer::start().await;
    mount_session(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({"using": [JMAP_CORE, JMAP_MAIL], "methodCalls": [["Mailbox/get", {"accountId": "u1", "properties": ["id", "role"]}, "c1"]]})))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"methodResponses": [["Mailbox/get", {"list": [{"id": "mb-drafts", "role": "drafts"}]}, "c1"]]})))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/jmap/upload/u1/"))
        .and(header("authorization", "Bearer per-user-test-token"))
        .and(header("content-type", "message/rfc822"))
        .respond_with(ResponseTemplate::new(200).set_body_json(
            json!({"accountId": "u1", "blobId": "b1", "type": "message/rfc822", "size": 20}),
        ))
        .mount(&server)
        .await;
    Mock::given(method("POST")).and(path("/jmap/"))
        .and(body_json(json!({"using": [JMAP_CORE, JMAP_MAIL], "methodCalls": [["Email/import", {"accountId": "u1", "emails": {"draft": {"blobId": "b1", "mailboxIds": {"mb-drafts": true}, "keywords": {"$draft": true}}}}, "c1"]]})))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"methodResponses": [["Email/import", {"created": {"draft": {"id": "m2"}}}, "c1"]]})))
        .mount(&server).await;
    Mock::given(method("POST")).and(path("/jmap/"))
        .and(body_json(json!({"using": [JMAP_CORE, JMAP_MAIL, JMAP_SUBMISSION], "methodCalls": [["Identity/get", {"accountId": "u1", "properties": ["id"]}, "c1"]]})))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"methodResponses": [["Identity/get", {"list": [{"id": "i1"}]}, "c1"]]})))
        .mount(&server).await;
    Mock::given(method("POST")).and(path("/jmap/"))
        .and(body_json(json!({"using": [JMAP_CORE, JMAP_MAIL, JMAP_SUBMISSION], "methodCalls": [["EmailSubmission/set", {"accountId": "u1", "create": {"submission": {"emailId": "m2", "identityId": "i1"}}, "onSuccessUpdateEmail": {"#submission": {"keywords/$draft": null}}}, "c1"]]})))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"methodResponses": [["EmailSubmission/set", {"created": {"submission": {"id": "s1", "threadId": "t2"}}}, "c1"]]})))
        .mount(&server).await;
    let sent = provider(&server)
        .send_message(TOKEN, b"From: a@example.test\r\n\r\nhello", None)
        .await
        .expect("send");
    assert_eq!(sent.message_id, "m2");
    assert_eq!(sent.thread_id, "t2");
}

#[tokio::test]
async fn rejects_cross_origin_session_endpoint_without_forwarding_bearer_token() {
    let session_server = MockServer::start().await;
    let attacker_server = MockServer::start().await;
    let mut body = session(&session_server);
    body["apiUrl"] = json!(format!("{}/jmap/", attacker_server.uri()));
    Mock::given(method("GET"))
        .and(path("/jmap/session"))
        .respond_with(ResponseTemplate::new(200).set_body_json(body))
        .mount(&session_server)
        .await;

    let error = provider(&session_server)
        .get_message(TOKEN, "m1")
        .await
        .expect_err("cross-origin apiUrl must fail closed");
    assert!(matches!(error, ProviderError::Configuration(_)));
    assert!(attacker_server
        .received_requests()
        .await
        .expect("request log")
        .is_empty());
}

#[tokio::test]
async fn maps_http_auth_errors_without_echoing_credentials_or_body() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/jmap/session"))
        .respond_with(ResponseTemplate::new(401).set_body_string("token=per-user-test-token"))
        .mount(&server)
        .await;
    let error = provider(&server)
        .get_message(TOKEN, "m1")
        .await
        .expect_err("auth failure");
    assert!(matches!(error, ProviderError::Auth(_)));
    assert!(!error.to_string().contains(TOKEN));
}

#[tokio::test]
async fn rejects_malformed_jmap_response_and_keeps_watch_unimplemented() {
    let server = MockServer::start().await;
    mount_session(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"notMethodResponses": []})))
        .mount(&server)
        .await;
    assert!(matches!(
        provider(&server).get_message(TOKEN, "m1").await,
        Err(ProviderError::Provider(_))
    ));
    assert!(matches!(
        provider(&server).register_watch(TOKEN).await,
        Err(ProviderError::Unsupported(_))
    ));
}

#[tokio::test]
async fn removed_principal_api_provisioning_fails_closed() {
    let server = MockServer::start().await;
    assert!(matches!(
        provider(&server)
            .provision_account("pythia@conation.dev", "not-sent")
            .await,
        Err(ProviderError::Unsupported(_))
    ));
}

#[tokio::test]
async fn downloads_small_jmap_blob() {
    let server = MockServer::start().await;
    mount_session(&server).await;
    Mock::given(method("GET"))
        .and(path("/jmap/download/u1/b1/note.txt"))
        .and(header("authorization", "Bearer per-user-test-token"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(b"hello-blob".as_slice()))
        .mount(&server)
        .await;
    let bytes = provider(&server)
        .download_blob(TOKEN, "b1", Some("note.txt"))
        .await
        .expect("download");
    assert_eq!(bytes, b"hello-blob");
}
