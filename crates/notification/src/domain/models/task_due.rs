//! Overdue / due-soon notification for task assignees.
//!
//! These are self-notifications: [`TaskDueNotification::request_for_assignee`]
//! always sends with `sender_id: None`. A recipient who is also the sender is
//! filtered out of their own notification, and the only recipient is the
//! assignee.

use std::collections::HashSet;

use chrono::{DateTime, Utc};
use conation_user_id::user_id::MacroUserIdStr;
use model_entity::{Entity, EntityType};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::models::{
    Notification, NotificationExtIos, NotificationTitle, SendNotificationRequest,
    SendNotificationRequestBuilder,
    apple::{APNSPushNotification, Alert, AlertDictionary, Aps, PushNotificationData},
    mobile::NotifCollapseKey,
};

#[cfg(test)]
mod test;

/// Whether the task has already passed its due instant, or is coming due.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
pub enum TaskDueKind {
    /// Due instant is still in the future. The dispatcher chooses the
    /// due-soon window; this variant only labels that firing.
    DueSoon,
    /// Due instant is now or in the past.
    Overdue,
}

impl TaskDueKind {
    /// Wire / collapse-key form of this kind.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::DueSoon => "due_soon",
            Self::Overdue => "overdue",
        }
    }

    /// Classify a due instant against `now`. Equal to `now` is overdue: the
    /// assignee should already be acting.
    pub fn classify(due_at: DateTime<Utc>, now: DateTime<Utc>) -> Self {
        if due_at <= now {
            Self::Overdue
        } else {
            Self::DueSoon
        }
    }
}

/// A task assigned to the recipient is due soon or overdue.
///
/// Tasks are stored as documents, so the associated entity is
/// [`EntityType::Document`] with `task_id` as the entity id.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
pub struct TaskDueNotification {
    /// The task (document) the recipient is assigned to.
    pub task_id: String,
    /// Display name at dispatch time. Absent when the document has no title.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_name: Option<String>,
    /// Due instant used to classify [`Self::kind`] and to keep collapse keys
    /// stable across redeliveries of the same due date.
    pub due_at: DateTime<Utc>,
    /// Overdue vs due-soon. Distinct kinds stay distinct lock-screen alerts.
    pub kind: TaskDueKind,
}

impl TaskDueNotification {
    /// Build an event classified against `now`.
    pub fn new(
        task_id: impl Into<String>,
        task_name: Option<String>,
        due_at: DateTime<Utc>,
        now: DateTime<Utc>,
    ) -> Self {
        Self {
            task_id: task_id.into(),
            task_name,
            due_at,
            kind: TaskDueKind::classify(due_at, now),
        }
    }

    /// Send request for one assignee.
    ///
    /// `sender_id` stays `None`: a due notification is a self-alert, and a
    /// recipient who is also the sender is dropped.
    pub fn request_for_assignee<'a>(
        self,
        assignee_id: MacroUserIdStr<'a>,
    ) -> SendNotificationRequest<'a, Self, PushNotificationData> {
        let notification_entity =
            EntityType::Document.with_entity_string(self.task_id.clone());
        SendNotificationRequestBuilder {
            notification_entity,
            secondary_notification_entity: None,
            notification: self,
            sender_id: None,
            recipient_ids: HashSet::from([assignee_id]),
        }
        .into_request()
        .with_apns()
        .with_conn_gateway()
    }
}

impl Notification for TaskDueNotification {
    const TYPE_NAME: &'static str = "task_due";
}

impl NotificationTitle for TaskDueNotification {
    fn format_title(
        &self,
        _sender_id: Option<MacroUserIdStr<'_>>,
    ) -> Result<String, rootcause::Report> {
        Ok(match self.kind {
            TaskDueKind::Overdue => "Task overdue".to_string(),
            TaskDueKind::DueSoon => "Task due soon".to_string(),
        })
    }

    fn format_body(
        &self,
        _sender_id: Option<MacroUserIdStr<'_>>,
    ) -> Result<String, rootcause::Report> {
        Ok(self
            .task_name
            .as_deref()
            .filter(|name| !name.is_empty())
            .unwrap_or("Untitled task")
            .to_string())
    }
}

impl NotificationExtIos for TaskDueNotification {
    type NotifData = PushNotificationData;

    fn collapse_key(&self, _entity: &Entity<'_>) -> NotifCollapseKey {
        // Keyed on the event type, not the document entity: an assignment
        // alert on the same task must not replace a due alert, and overdue
        // must not replace due-soon.
        NotifCollapseKey::new(Self::TYPE_NAME)
            .append(&self.task_id)
            .append(&self.due_at.timestamp().to_string())
            .append(self.kind.as_str())
    }

    fn as_apns<'a>(
        &self,
        sender_id: Option<MacroUserIdStr<'a>>,
        _entity: &Entity<'_>,
        notification_id: Uuid,
    ) -> Option<APNSPushNotification<Self::NotifData>> {
        let title = self.format_title(sender_id.clone()).ok()?;
        let body = self.format_body(sender_id).ok()?;
        Some(APNSPushNotification {
            aps: Aps {
                alert: Some(Alert::Dictionary(AlertDictionary {
                    title: Some(title),
                    body: Some(body),
                    ..Default::default()
                })),
                ..Default::default()
            },
            push_notification_data: PushNotificationData {
                notification_id,
                sender_profile_picture_url: None,
            },
        })
    }
}
