use std::sync::{Arc, Mutex};

use chrono::{DateTime, Duration, TimeZone, Utc};
use conation_user_id::user_id::MacroUserIdStr;
use rootcause::Report;
use serde::Serialize;
use uuid::Uuid;

use super::*;
use crate::domain::models::{
    DueTaskAssignment, NotificationResult, SendNotificationRequest, TaskDueKind,
    TaskDueNotification,
};
use crate::domain::ports::{TaskDueNotifier, TaskDueSource};
use crate::domain::service::{NotificationIngress, SendNotificationError};

fn instant() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 9, 20, 15, 0, 0).unwrap()
}

fn assignee() -> String {
    "macro|assignee@test.com".to_string()
}

fn assignment(due_at: DateTime<Utc>) -> DueTaskAssignment {
    DueTaskAssignment {
        task_id: "11111111-1111-1111-1111-111111111111".into(),
        task_name: Some("Ship overdue mail".into()),
        due_at,
        assignee_id: assignee(),
    }
}

#[derive(Clone, Default)]
struct FakeSource {
    assignments: Arc<Mutex<Vec<DueTaskAssignment>>>,
}

impl TaskDueSource for FakeSource {
    async fn due_assignments(
        &self,
        _now: DateTime<Utc>,
        _due_soon_until: DateTime<Utc>,
        _overdue_after: DateTime<Utc>,
        _limit: i64,
    ) -> Result<Vec<DueTaskAssignment>, Report> {
        Ok(self.assignments.lock().unwrap().clone())
    }
}

#[derive(Clone, Default)]
struct FakeNotifier {
    sent: Arc<Mutex<Vec<(TaskDueNotification, String)>>>,
    fail: bool,
}

impl TaskDueNotifier for FakeNotifier {
    async fn notify(
        &self,
        notification: TaskDueNotification,
        assignee_id: MacroUserIdStr<'_>,
    ) -> Result<(), Report> {
        if self.fail {
            return Err(rootcause::report!("notification rejected").into_dynamic());
        }
        self.sent
            .lock()
            .unwrap()
            .push((notification, assignee_id.to_string()));
        Ok(())
    }
}

fn service(
    source: FakeSource,
    notifier: FakeNotifier,
) -> TaskDueDispatchService<FakeSource, FakeNotifier> {
    TaskDueDispatchService::new(source, notifier)
}

#[tokio::test]
async fn dispatch_notifies_due_soon_and_overdue_assignees() {
    let source = FakeSource {
        assignments: Arc::new(Mutex::new(vec![
            assignment(instant() + Duration::hours(2)),
            assignment(instant() - Duration::hours(2)),
        ])),
    };
    let notifier = FakeNotifier::default();
    let sent = notifier.sent.clone();
    let dispatcher = service(source, notifier);

    let summary = dispatcher.dispatch_at(instant()).await.expect("dispatch");

    assert_eq!(summary.notified, 2);
    assert_eq!(summary.skipped, 0);
    assert_eq!(summary.failed, 0);
    let sent = sent.lock().unwrap();
    assert_eq!(sent[0].0.kind, TaskDueKind::DueSoon);
    assert_eq!(sent[1].0.kind, TaskDueKind::Overdue);
    assert_eq!(sent[0].1, assignee());
    assert_eq!(sent[1].1, assignee());
}

#[tokio::test]
async fn dispatch_skips_assignments_outside_the_window() {
    let source = FakeSource {
        assignments: Arc::new(Mutex::new(vec![
            assignment(instant() + Duration::hours(48)),
            assignment(instant() - Duration::hours(48)),
        ])),
    };
    let notifier = FakeNotifier::default();
    let sent = notifier.sent.clone();
    let dispatcher = service(source, notifier);

    let summary = dispatcher.dispatch_at(instant()).await.expect("dispatch");

    assert_eq!(summary.notified, 0);
    assert_eq!(summary.skipped, 2);
    assert!(sent.lock().unwrap().is_empty());
}

#[tokio::test]
async fn dispatch_skips_unparseable_assignee_ids() {
    let mut bad = assignment(instant() - Duration::hours(1));
    bad.assignee_id = "not-a-user-id".into();
    let source = FakeSource {
        assignments: Arc::new(Mutex::new(vec![bad])),
    };
    let notifier = FakeNotifier::default();
    let sent = notifier.sent.clone();
    let dispatcher = service(source, notifier);

    let summary = dispatcher.dispatch_at(instant()).await.expect("dispatch");

    assert_eq!(summary.skipped, 1);
    assert_eq!(summary.notified, 0);
    assert!(sent.lock().unwrap().is_empty());
}

#[tokio::test]
async fn dispatch_continues_after_a_failed_notify() {
    let source = FakeSource {
        assignments: Arc::new(Mutex::new(vec![assignment(instant())])),
    };
    let notifier = FakeNotifier {
        fail: true,
        ..FakeNotifier::default()
    };
    let dispatcher = service(source, notifier);

    let summary = dispatcher.dispatch_at(instant()).await.expect("dispatch");

    assert_eq!(summary.failed, 1);
    assert_eq!(summary.notified, 0);
}

#[tokio::test]
async fn quiet_tick_notifies_nothing() {
    let dispatcher = service(FakeSource::default(), FakeNotifier::default());
    let summary = dispatcher.dispatch_at(instant()).await.expect("dispatch");
    assert_eq!(summary, TaskDueDispatchSummary::default());
}

#[derive(Clone, Default)]
struct RecordingIngress {
    ids: Arc<Mutex<Vec<Uuid>>>,
}

impl NotificationIngress for RecordingIngress {
    fn send_notification<
        'a,
        T: crate::domain::models::Notification + Clone + 'static,
        U: Serialize + Send + Sync + 'static,
    >(
        &'a self,
        req: SendNotificationRequest<'a, T, U>,
    ) -> impl Future<
        Output = Result<Option<NotificationResult<'a>>, Report<SendNotificationError>>,
    > + Send {
        let id = req.uuid_to_write;
        async move {
            self.ids.lock().unwrap().push(id);
            Ok(None)
        }
    }
}

#[tokio::test]
async fn ingress_notifier_calls_request_for_assignee() {
    let ingress = RecordingIngress::default();
    let ids = ingress.ids.clone();
    let notifier = IngressTaskDueNotifier::new(ingress);
    let assignee = MacroUserIdStr::parse_from_str("macro|assignee@test.com").expect("user id");
    let notification = TaskDueNotification::new(
        "11111111-1111-1111-1111-111111111111",
        Some("Ship overdue mail".into()),
        instant() - Duration::hours(2),
        instant(),
    );
    let expected_id = notification
        .clone()
        .request_for_assignee(assignee.clone())
        .uuid_to_write;

    notifier
        .notify(notification, assignee)
        .await
        .expect("notify");

    assert_eq!(*ids.lock().unwrap(), vec![expected_id]);
}
