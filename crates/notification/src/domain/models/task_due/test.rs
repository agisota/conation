use chrono::{Duration, TimeZone, Utc};
use conation_user_id::user_id::MacroUserIdStr;
use model_entity::EntityType;

use super::{TaskDueKind, TaskDueNotification};
use crate::domain::models::{Notification, NotificationExtIos, NotificationTitle};

fn instant() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 9, 20, 15, 0, 0).unwrap()
}

fn assignee() -> MacroUserIdStr<'static> {
    MacroUserIdStr::parse_from_str("macro|assignee@test.com").expect("valid user id")
}

fn overdue() -> TaskDueNotification {
    TaskDueNotification::new(
        "11111111-1111-1111-1111-111111111111",
        Some("Ship overdue mail".into()),
        instant() - Duration::hours(2),
        instant(),
    )
}

fn due_soon() -> TaskDueNotification {
    TaskDueNotification::new(
        "11111111-1111-1111-1111-111111111111",
        Some("Ship overdue mail".into()),
        instant() + Duration::hours(2),
        instant(),
    )
}

#[test]
fn type_name_is_task_due() {
    assert_eq!(TaskDueNotification::TYPE_NAME, "task_due");
}

#[test]
fn a_due_instant_in_the_past_is_overdue() {
    assert_eq!(
        TaskDueKind::classify(instant() - Duration::seconds(1), instant()),
        TaskDueKind::Overdue
    );
}

#[test]
fn a_due_instant_equal_to_now_is_overdue() {
    assert_eq!(
        TaskDueKind::classify(instant(), instant()),
        TaskDueKind::Overdue
    );
}

#[test]
fn a_future_due_instant_is_due_soon() {
    assert_eq!(
        TaskDueKind::classify(instant() + Duration::seconds(1), instant()),
        TaskDueKind::DueSoon
    );
}

#[test]
fn overdue_title_and_body() {
    let notification = overdue();
    assert_eq!(
        notification.format_title(None).expect("title"),
        "Task overdue"
    );
    assert_eq!(
        notification.format_body(None).expect("body"),
        "Ship overdue mail"
    );
}

#[test]
fn due_soon_title() {
    let notification = due_soon();
    assert_eq!(
        notification.format_title(None).expect("title"),
        "Task due soon"
    );
}

#[test]
fn missing_task_name_falls_back() {
    let notification = TaskDueNotification::new(
        "task-1",
        None,
        instant() - Duration::hours(1),
        instant(),
    );
    assert_eq!(
        notification.format_body(None).expect("body"),
        "Untitled task"
    );
}

#[test]
fn serde_roundtrip_uses_camel_case() {
    let json = serde_json::to_value(overdue()).expect("serialize");
    assert_eq!(json["taskId"], "11111111-1111-1111-1111-111111111111");
    assert_eq!(json["kind"], "overdue");
    let back: TaskDueNotification = serde_json::from_value(json).expect("deserialize");
    assert_eq!(back, overdue());
}

#[test]
fn overdue_and_due_soon_use_distinct_collapse_keys() {
    let entity = EntityType::Document.with_entity_string(overdue().task_id.clone());
    let overdue_key = overdue().collapse_key(&entity).into_hashed().into_inner();
    let due_soon_key = due_soon().collapse_key(&entity).into_hashed().into_inner();
    assert_ne!(overdue_key, due_soon_key);
}

#[test]
fn request_for_assignee_is_a_self_notification() {
    let request = overdue().request_for_assignee(assignee());
    assert!(request.req.sender_id.is_none());
    assert_eq!(request.req.recipient_ids.len(), 1);
    assert!(request.req.recipient_ids.contains(&assignee()));
    assert!(request.build_apns.is_some());
    assert!(request.send_conn_gateway);
    assert_eq!(
        request.req.notification_entity.entity_id.as_ref(),
        "11111111-1111-1111-1111-111111111111"
    );
}
