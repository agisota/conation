use super::*;
use chrono::TimeZone;
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
    assert_eq!(
        messages[0].attachments[0].name.as_deref(),
        Some("brief.pdf")
    );
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
        Err(ProviderError::Configuration(_)
            | ProviderError::Transport(_)
            | ProviderError::Provider(_))
    ));
    assert!(server
        .received_requests()
        .await
        .expect("request log")
        .iter()
        .all(|request| request.url.path() != "/api/principal"));
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

#[test]
fn from_address_from_mime_reads_angle_addr_and_bare_addr() {
    assert_eq!(
        from_address_from_mime(b"From: Hi <hi@conation.dev>\r\n\r\nbody").unwrap(),
        "hi@conation.dev"
    );
    assert_eq!(
        from_address_from_mime(b"From: ib@conation.dev\r\nSubject: x\r\n\r\n").unwrap(),
        "ib@conation.dev"
    );
}

fn calendar_session(server: &MockServer) -> Value {
    json!({
        "apiUrl": format!("{}/jmap/", server.uri()),
        "uploadUrl": format!("{}/jmap/upload/{{accountId}}/", server.uri()),
        "downloadUrl": format!("{}/jmap/download/{{accountId}}/{{blobId}}/{{name}}", server.uri()),
        "capabilities": {
            JMAP_CORE: {},
            JMAP_MAIL: {},
            JMAP_CALENDARS: {},
            JMAP_MANAGEMENT: {}
        },
        "accounts": {
            "u1": {
                "accountCapabilities": {
                    JMAP_MAIL: {},
                    JMAP_CALENDARS: {},
                    JMAP_MANAGEMENT: {}
                }
            }
        },
        "primaryAccounts": {
            JMAP_MAIL: "u1",
            JMAP_CALENDARS: "u1",
            JMAP_MANAGEMENT: "u1"
        }
    })
}

async fn mount_calendar_admin(server: &MockServer) {
    std::env::set_var("STALWART_TOKEN", TOKEN);
    Mock::given(method("GET"))
        .and(path("/jmap/session"))
        .and(header("authorization", "Bearer per-user-test-token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(calendar_session(server)))
        .mount(server)
        .await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_MANAGEMENT],
            "methodCalls": [["x:Account/get", {
                "accountId": "u1",
                "ids": null,
                "properties": ["id", "emailAddress"]
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["x:Account/get", {
                "list": [{"id": "u1", "emailAddress": "self@example.com"}]
            }, "c1"]]
        })))
        .mount(server)
        .await;
}

#[test]
fn parses_iso8601_durations_used_by_jmap_calendar_events() {
    assert_eq!(parse_iso8601_duration_secs("PT3600S"), 3600);
    assert_eq!(parse_iso8601_duration_secs("PT1H30M"), 5400);
    assert_eq!(parse_iso8601_duration_secs("P1D"), 86_400);
    assert_eq!(parse_iso8601_duration_secs("bogus"), 60);
}

#[tokio::test]
async fn lists_calendar_events_via_jmap_query_then_get() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/query", {"accountId": "u1", "limit": 100}, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/query", {"ids": ["ev1"]}, "c1"]]
        })))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/get", {
                "accountId": "u1",
                "ids": ["ev1"],
                "properties": [
                    "id", "uid", "title", "description", "start", "duration",
                    "timeZone", "showWithoutTime", "recurrenceRules",
                    "participants", "locations", "virtualLocations",
                    "freeBusyStatus", "status", "alerts"
                ]
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/get", {"list": [{
                "id": "ev1",
                "uid": "uid-1@conation.dev",
                "title": "Standup",
                "description": "Daily",
                "start": "2026-09-13T14:00:00",
                "duration": "PT1800S",
                "timeZone": "UTC",
                "freeBusyStatus": "busy",
                "status": "confirmed",
                "locations": {"l1": {"name": "Room A"}},
                "participants": {
                    "p1": {
                        "name": "Ada",
                        "roles": {"attendee": true},
                        "participationStatus": "needs-action",
                        "sendTo": {"imip": "mailto:self@example.com"}
                    }
                }
            }]}, "c1"]]
        })))
        .mount(&server)
        .await;
    let events = provider(&server)
        .list_calendar_events("self@example.com")
        .await
        .expect("list");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].id, "ev1");
    assert_eq!(events[0].title, "Standup");
    assert_eq!(events[0].location.as_deref(), Some("Room A"));
    assert_eq!(events[0].duration_secs, 1800);
    assert!(!events[0].free);
    assert_eq!(events[0].participants.len(), 1);
    assert_eq!(events[0].participants[0].email, "self@example.com");
    assert_eq!(
        events[0].participants[0].participation_status,
        "needs-action"
    );
}

#[tokio::test]
async fn rsvp_patches_the_matching_participant_status() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/get", {
                "accountId": "u1",
                "ids": ["ev1"],
                "properties": [
                    "id", "uid", "title", "description", "start", "duration",
                    "timeZone", "showWithoutTime", "recurrenceRules",
                    "participants", "locations", "virtualLocations",
                    "freeBusyStatus", "status", "alerts"
                ]
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/get", {"list": [{
                "id": "ev1",
                "title": "Standup",
                "start": "2026-09-13T14:00:00",
                "duration": "PT1H",
                "participants": {
                    "p1": {
                        "participationStatus": "needs-action",
                        "sendTo": {"imip": "mailto:self@example.com"}
                    },
                    "p2": {
                        "participationStatus": "accepted",
                        "sendTo": {"imip": "mailto:other@example.com"}
                    }
                }
            }]}, "c1"]]
        })))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/set", {
                "accountId": "u1",
                "update": {
                    "ev1": {
                        "participants/p1/participationStatus": "accepted"
                    }
                }
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/set", {"updated": {"ev1": {}}}, "c1"]]
        })))
        .mount(&server)
        .await;
    let event = provider(&server)
        .rsvp_calendar_event("self@example.com", "ev1", &["self@example.com"], "accepted")
        .await
        .expect("rsvp");
    assert_eq!(
        event
            .participants
            .iter()
            .find(|participant| participant.email == "self@example.com")
            .map(|participant| participant.participation_status.as_str()),
        Some("accepted")
    );
}

#[tokio::test]
async fn rsvp_without_a_matching_participant_is_not_found() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/get", {
                "accountId": "u1",
                "ids": ["ev1"],
                "properties": [
                    "id", "uid", "title", "description", "start", "duration",
                    "timeZone", "showWithoutTime", "recurrenceRules",
                    "participants", "locations", "virtualLocations",
                    "freeBusyStatus", "status", "alerts"
                ]
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/get", {"list": [{
                "id": "ev1",
                "title": "Standup",
                "start": "2026-09-13T14:00:00",
                "duration": "PT1H",
                "participants": {
                    "p2": {
                        "participationStatus": "accepted",
                        "sendTo": {"imip": "mailto:other@example.com"}
                    }
                }
            }]}, "c1"]]
        })))
        .mount(&server)
        .await;
    let error = provider(&server)
        .rsvp_calendar_event("self@example.com", "ev1", &["self@example.com"], "declined")
        .await
        .expect_err("missing attendee");
    assert!(matches!(error, ProviderError::NotFound(_)));
}

async fn mount_default_calendar(server: &MockServer) {
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["Calendar/get", {"accountId": "u1"}, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["Calendar/get", {
                "list": [{"id": "cal1", "isDefault": true}]
            }, "c1"]]
        })))
        .mount(server)
        .await;
}

#[test]
fn rrule_weekly_byday_becomes_jmap_recurrence_rules() {
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &["RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=8".to_string()],
    );
    assert_eq!(write.recurrence_rules[0]["frequency"], "weekly");
    assert_eq!(write.recurrence_rules[0]["count"], 8);
    assert_eq!(
        write.recurrence_rules[0]["byDay"],
        json!([{"day": "mo"}, {"day": "we"}])
    );
}

#[test]
fn rrule_round_trips_nth_weekday_and_until() {
    let write = StalwartCalendarEventWrite::all_day(
        "Offsite",
        chrono::NaiveDate::from_ymd_opt(2026, 9, 13).unwrap(),
        chrono::NaiveDate::from_ymd_opt(2026, 9, 14).unwrap(),
        &["RRULE:FREQ=MONTHLY;BYDAY=1MO;UNTIL=20261201".to_string()],
    );
    assert!(write.show_without_time);
    assert_eq!(write.start, "2026-09-13T00:00:00");
    assert_eq!(write.duration, "P1D");
    assert_eq!(write.recurrence_rules[0]["frequency"], "monthly");
    assert_eq!(
        write.recurrence_rules[0]["byDay"],
        json!([{"day": "mo", "nthOfPeriod": 1}])
    );
    let reconstructed = rfc5545_from_jmap_recurrence_rules(Some(&json!(write.recurrence_rules)));
    assert_eq!(
        reconstructed,
        vec!["RRULE:FREQ=MONTHLY;UNTIL=20261201T000000;BYDAY=1MO".to_string()]
    );
}

#[tokio::test]
async fn creates_all_day_event_with_show_without_time() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    mount_default_calendar(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/set", {
                "accountId": "u1",
                "create": {
                    "e1": {
                        "calendarIds": {"cal1": true},
                        "title": "Offsite",
                        "start": "2026-09-13T00:00:00",
                        "duration": "P1D",
                        "showWithoutTime": true,
                        "timeZone": null
                    }
                }
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/set", {
                "created": {"e1": {"id": "ev-all-day"}}
            }, "c1"]]
        })))
        .mount(&server)
        .await;
    let write = StalwartCalendarEventWrite::all_day(
        "Offsite",
        chrono::NaiveDate::from_ymd_opt(2026, 9, 13).unwrap(),
        chrono::NaiveDate::from_ymd_opt(2026, 9, 14).unwrap(),
        &[],
    );
    let id = provider(&server)
        .create_calendar_event("self@example.com", &write)
        .await
        .expect("create");
    assert_eq!(id, "ev-all-day");
}

#[tokio::test]
async fn creates_weekly_recurring_event_with_recurrence_rules() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    mount_default_calendar(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/set", {
                "accountId": "u1",
                "create": {
                    "e1": {
                        "calendarIds": {"cal1": true},
                        "title": "Standup",
                        "start": "2026-09-14T14:00:00",
                        "duration": "PT1800S",
                        "showWithoutTime": false,
                        "timeZone": "UTC",
                        "recurrenceRules": [{
                            "frequency": "weekly",
                            "byDay": [{"day": "mo"}]
                        }]
                    }
                }
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/set", {
                "created": {"e1": {"id": "ev-recur"}}
            }, "c1"]]
        })))
        .mount(&server)
        .await;
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &["RRULE:FREQ=WEEKLY;BYDAY=MO".to_string()],
    );
    let id = provider(&server)
        .create_calendar_event("self@example.com", &write)
        .await
        .expect("create");
    assert_eq!(id, "ev-recur");
}

#[tokio::test]
async fn updates_all_day_and_recurrence_via_jmap_set() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/set", {
                "accountId": "u1",
                "update": {
                    "ev1": {
                        "title": "Holiday",
                        "start": "2026-09-15T00:00:00",
                        "duration": "P2D",
                        "showWithoutTime": true,
                        "timeZone": null,
                        "recurrenceRules": [{
                            "frequency": "yearly"
                        }]
                    }
                }
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/set", {"updated": {"ev1": {}}}, "c1"]]
        })))
        .mount(&server)
        .await;
    let write = StalwartCalendarEventWrite::all_day(
        "Holiday",
        chrono::NaiveDate::from_ymd_opt(2026, 9, 15).unwrap(),
        chrono::NaiveDate::from_ymd_opt(2026, 9, 17).unwrap(),
        &["RRULE:FREQ=YEARLY".to_string()],
    );
    provider(&server)
        .update_calendar_event("self@example.com", "ev1", &write)
        .await
        .expect("update");
}

#[tokio::test]
async fn lists_all_day_and_recurrence_from_jmap_get() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/query", {"accountId": "u1", "limit": 100}, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/query", {"ids": ["ev1"]}, "c1"]]
        })))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/get", {
                "accountId": "u1",
                "ids": ["ev1"],
                "properties": [
                    "id", "uid", "title", "description", "start", "duration",
                    "timeZone", "showWithoutTime", "recurrenceRules",
                    "participants", "locations", "virtualLocations",
                    "freeBusyStatus", "status", "alerts"
                ]
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/get", {"list": [{
                "id": "ev1",
                "title": "Holiday",
                "start": "2026-09-15T00:00:00",
                "duration": "P1D",
                "showWithoutTime": true,
                "recurrenceRules": [{"frequency": "yearly"}],
                "freeBusyStatus": "free"
            }]}, "c1"]]
        })))
        .mount(&server)
        .await;
    let events = provider(&server)
        .list_calendar_events("self@example.com")
        .await
        .expect("list");
    assert_eq!(events.len(), 1);
    assert!(events[0].show_without_time);
    assert_eq!(events[0].duration_secs, 86_400);
    assert_eq!(
        events[0].recurrence_lines,
        vec!["RRULE:FREQ=YEARLY".to_string()]
    );
    assert!(events[0].free);
}

#[test]
fn popup_reminder_becomes_jmap_alerts() {
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &[],
    )
    .with_alerts(Some(vec![StalwartCalendarAlert {
        method: "popup".to_string(),
        minutes: 15,
    }]));
    let object = calendar_event_set_object(&write, Some("cal1"));
    assert_eq!(object["alerts"]["a0"]["action"], "display");
    assert_eq!(object["alerts"]["a0"]["trigger"]["offset"], "-PT15M");
}

#[test]
fn omitted_alerts_stay_off_the_jmap_set() {
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &[],
    );
    let object = calendar_event_set_object(&write, Some("cal1"));
    assert!(object.get("alerts").is_none());
}

#[test]
fn empty_alerts_clear_the_jmap_field() {
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &[],
    )
    .with_alerts(Some(Vec::new()));
    let object = calendar_event_set_object(&write, Some("cal1"));
    assert_eq!(object["alerts"], json!({}));
}

#[test]
fn iso8601_alert_offsets_round_trip_minutes() {
    assert_eq!(iso8601_offset_minutes_before("-PT15M"), Some(15));
    assert_eq!(iso8601_offset_minutes_before("-PT1H"), Some(60));
    assert_eq!(iso8601_offset_minutes_before("-PT1H30M"), Some(90));
    assert_eq!(iso8601_offset_minutes_before("-P1D"), Some(1_440));
    assert_eq!(iso8601_offset_minutes_before("PT15M"), None);
}

#[tokio::test]
async fn creates_event_with_popup_alert() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    mount_default_calendar(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/set", {
                "accountId": "u1",
                "create": {
                    "e1": {
                        "calendarIds": {"cal1": true},
                        "title": "Standup",
                        "start": "2026-09-14T14:00:00",
                        "duration": "PT1800S",
                        "showWithoutTime": false,
                        "timeZone": "UTC",
                        "alerts": {
                            "a0": {
                                "action": "display",
                                "trigger": {
                                    "@type": "OffsetTrigger",
                                    "offset": "-PT15M",
                                    "relativeTo": "start"
                                }
                            }
                        }
                    }
                }
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/set", {
                "created": {"e1": {"id": "ev-alert"}}
            }, "c1"]]
        })))
        .mount(&server)
        .await;
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &[],
    )
    .with_alerts(Some(vec![StalwartCalendarAlert {
        method: "popup".to_string(),
        minutes: 15,
    }]));
    let id = provider(&server)
        .create_calendar_event("self@example.com", &write)
        .await
        .expect("create");
    assert_eq!(id, "ev-alert");
}

#[tokio::test]
async fn lists_alerts_from_jmap_get() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/query", {"accountId": "u1", "limit": 100}, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/query", {"ids": ["ev1"]}, "c1"]]
        })))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/get", {
                "accountId": "u1",
                "ids": ["ev1"],
                "properties": [
                    "id", "uid", "title", "description", "start", "duration",
                    "timeZone", "showWithoutTime", "recurrenceRules",
                    "participants", "locations", "virtualLocations",
                    "freeBusyStatus", "status", "alerts"
                ]
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/get", {"list": [{
                "id": "ev1",
                "title": "Standup",
                "start": "2026-09-14T14:00:00",
                "duration": "PT1800S",
                "alerts": {
                    "a0": {
                        "action": "display",
                        "trigger": {"offset": "-PT15M"}
                    },
                    "a1": {
                        "action": "email",
                        "trigger": {"offset": "-PT1H"}
                    }
                }
            }]}, "c1"]]
        })))
        .mount(&server)
        .await;
    let events = provider(&server)
        .list_calendar_events("self@example.com")
        .await
        .expect("list");
    assert_eq!(
        events[0].alerts,
        Some(vec![
            StalwartCalendarAlert {
                method: "popup".to_string(),
                minutes: 15,
            },
            StalwartCalendarAlert {
                method: "email".to_string(),
                minutes: 60,
            },
        ])
    );
}

#[test]
fn conference_url_becomes_jmap_virtual_locations() {
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &[],
    )
    .with_conference_url(Some("https://meet.example.test/abc-defg-hij".to_string()));
    let object = calendar_event_set_object(&write, Some("cal1"));
    assert_eq!(
        object["virtualLocations"]["v1"]["uri"],
        "https://meet.example.test/abc-defg-hij"
    );
    assert_eq!(object["virtualLocations"]["v1"]["@type"], "VirtualLocation");
}

#[test]
fn omitted_conference_stays_off_the_jmap_set() {
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &[],
    );
    let object = calendar_event_set_object(&write, Some("cal1"));
    assert!(object.get("virtualLocations").is_none());
}

#[test]
fn empty_conference_clears_virtual_locations() {
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &[],
    )
    .with_conference_url(Some(String::new()));
    let object = calendar_event_set_object(&write, Some("cal1"));
    assert_eq!(object["virtualLocations"], json!({}));
}

#[tokio::test]
async fn creates_event_with_conference_url() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    mount_default_calendar(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/set", {
                "accountId": "u1",
                "create": {
                    "e1": {
                        "calendarIds": {"cal1": true},
                        "title": "Standup",
                        "start": "2026-09-14T14:00:00",
                        "duration": "PT1800S",
                        "showWithoutTime": false,
                        "timeZone": "UTC",
                        "virtualLocations": {
                            "v1": {
                                "@type": "VirtualLocation",
                                "name": "Call",
                                "uri": "https://meet.example.test/abc-defg-hij",
                                "features": { "audio": true, "video": true }
                            }
                        }
                    }
                }
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/set", {
                "created": {"e1": {"id": "ev-conf"}}
            }, "c1"]]
        })))
        .mount(&server)
        .await;
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &[],
    )
    .with_conference_url(Some("https://meet.example.test/abc-defg-hij".to_string()));
    let id = provider(&server)
        .create_calendar_event("self@example.com", &write)
        .await
        .expect("create");
    assert_eq!(id, "ev-conf");
}

#[tokio::test]
async fn lists_conference_url_from_virtual_locations() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/query", {"accountId": "u1", "limit": 100}, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/query", {"ids": ["ev1"]}, "c1"]]
        })))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/get", {
                "accountId": "u1",
                "ids": ["ev1"],
                "properties": [
                    "id", "uid", "title", "description", "start", "duration",
                    "timeZone", "showWithoutTime", "recurrenceRules",
                    "participants", "locations", "virtualLocations",
                    "freeBusyStatus", "status", "alerts"
                ]
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/get", {"list": [{
                "id": "ev1",
                "title": "Standup",
                "start": "2026-09-14T14:00:00",
                "duration": "PT1800S",
                "locations": {"l1": {"name": "Room A"}},
                "virtualLocations": {
                    "v1": {
                        "@type": "VirtualLocation",
                        "uri": "https://meet.example.test/abc-defg-hij"
                    }
                }
            }]}, "c1"]]
        })))
        .mount(&server)
        .await;
    let events = provider(&server)
        .list_calendar_events("self@example.com")
        .await
        .expect("list");
    assert_eq!(events[0].location.as_deref(), Some("Room A"));
    assert_eq!(
        events[0].conference_url.as_deref(),
        Some("https://meet.example.test/abc-defg-hij")
    );
}

#[tokio::test]
async fn lists_conference_url_from_locations_uri() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/query", {"accountId": "u1", "limit": 100}, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/query", {"ids": ["ev1"]}, "c1"]]
        })))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/get", {
                "accountId": "u1",
                "ids": ["ev1"],
                "properties": [
                    "id", "uid", "title", "description", "start", "duration",
                    "timeZone", "showWithoutTime", "recurrenceRules",
                    "participants", "locations", "virtualLocations",
                    "freeBusyStatus", "status", "alerts"
                ]
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/get", {"list": [{
                "id": "ev1",
                "title": "Standup",
                "start": "2026-09-14T14:00:00",
                "duration": "PT1800S",
                "locations": {
                    "v1": {
                        "@type": "Location",
                        "name": "Call",
                        "uri": "https://meet.example.test/from-location",
                        "locationTypes": {"virtual": true}
                    }
                }
            }]}, "c1"]]
        })))
        .mount(&server)
        .await;
    let events = provider(&server)
        .list_calendar_events("self@example.com")
        .await
        .expect("list");
    assert_eq!(events[0].location, None);
    assert_eq!(
        events[0].conference_url.as_deref(),
        Some("https://meet.example.test/from-location")
    );
}

#[test]
fn location_name_becomes_jmap_locations() {
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &[],
    )
    .with_location(Some("Room A".to_string()));
    let object = calendar_event_set_object(&write, Some("cal1"));
    assert_eq!(object["locations"]["l1"]["name"], "Room A");
    assert_eq!(object["locations"]["l1"]["@type"], "Location");
    assert!(object.get("virtualLocations").is_none());
}

#[test]
fn omitted_location_stays_off_the_jmap_set() {
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &[],
    );
    let object = calendar_event_set_object(&write, Some("cal1"));
    assert!(object.get("locations").is_none());
}

#[test]
fn empty_location_clears_locations() {
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &[],
    )
    .with_location(Some(String::new()));
    let object = calendar_event_set_object(&write, Some("cal1"));
    assert_eq!(object["locations"], json!({}));
}

#[tokio::test]
async fn creates_event_with_location_name() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    mount_default_calendar(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/set", {
                "accountId": "u1",
                "create": {
                    "e1": {
                        "calendarIds": {"cal1": true},
                        "title": "Standup",
                        "start": "2026-09-14T14:00:00",
                        "duration": "PT1800S",
                        "showWithoutTime": false,
                        "timeZone": "UTC",
                        "locations": {
                            "l1": {
                                "@type": "Location",
                                "name": "Room A"
                            }
                        }
                    }
                }
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/set", {
                "created": {"e1": {"id": "ev-loc"}}
            }, "c1"]]
        })))
        .mount(&server)
        .await;
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &[],
    )
    .with_location(Some("Room A".to_string()));
    let id = provider(&server)
        .create_calendar_event("self@example.com", &write)
        .await
        .expect("create");
    assert_eq!(id, "ev-loc");
}

#[tokio::test]
async fn updates_event_location_name() {
    let server = MockServer::start().await;
    mount_calendar_admin(&server).await;
    Mock::given(method("POST"))
        .and(path("/jmap/"))
        .and(body_json(json!({
            "using": [JMAP_CORE, JMAP_CALENDARS],
            "methodCalls": [["CalendarEvent/set", {
                "accountId": "u1",
                "update": {
                    "ev1": {
                        "title": "Standup",
                        "start": "2026-09-14T14:00:00",
                        "duration": "PT1800S",
                        "showWithoutTime": false,
                        "timeZone": "UTC",
                        "locations": {
                            "l1": {
                                "@type": "Location",
                                "name": "Room B"
                            }
                        }
                    }
                }
            }, "c1"]]
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "methodResponses": [["CalendarEvent/set", {"updated": {"ev1": {}}}, "c1"]]
        })))
        .mount(&server)
        .await;
    let write = StalwartCalendarEventWrite::timed(
        "Standup",
        chrono::Utc.with_ymd_and_hms(2026, 9, 14, 14, 0, 0).unwrap(),
        1800,
        &[],
    )
    .with_location(Some("Room B".to_string()));
    provider(&server)
        .update_calendar_event("self@example.com", "ev1", &write)
        .await
        .expect("update");
}
