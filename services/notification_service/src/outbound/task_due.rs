//! Postgres scan of open tasks that are due soon or overdue.
//!
//! Tasks are documents with a due-date property. Assignees live on the
//! assignees property. Already-delivered firings are the existing
//! `task_due` notification rows (stable id + this query's `NOT EXISTS`).

use chrono::{DateTime, Utc};
use notification::domain::models::DueTaskAssignment;
use notification::domain::ports::TaskDueSource;
use rootcause::Report;
use sqlx::PgPool;
use uuid::Uuid;

/// System due-date property (`SystemPropertyKey::DUE_DATE_UUID`).
const DUE_DATE_PROPERTY_ID: Uuid = Uuid::from_u128(0x00000001_0000_0000_0000_000000000004);
/// System assignees property (`SystemPropertyKey::ASSIGNEES_UUID`).
const ASSIGNEES_PROPERTY_ID: Uuid = Uuid::from_u128(0x00000001_0000_0000_0000_000000000001);
/// System status property (`SystemPropertyKey::STATUS_UUID`).
const STATUS_PROPERTY_ID: Uuid = Uuid::from_u128(0x00000001_0000_0000_0000_000000000002);
/// Completed status option. Closed tasks are not notified.
const COMPLETED_STATUS_OPTION_ID: &str = "00000001-0000-0000-0002-000000000004";
/// Canceled status option. Canceled tasks are not notified.
const CANCELED_STATUS_OPTION_ID: &str = "00000001-0000-0000-0002-000000000005";

#[derive(Debug, sqlx::FromRow)]
struct DueTaskAssignmentRow {
    task_id: String,
    task_name: Option<String>,
    due_at: DateTime<Utc>,
    assignee_id: String,
}

/// Loads due task assignments from entity properties.
#[derive(Debug, Clone)]
pub struct PgTaskDueSource {
    pool: PgPool,
}

impl PgTaskDueSource {
    /// Scan due tasks on this pool.
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl TaskDueSource for PgTaskDueSource {
    #[tracing::instrument(err, skip(self))]
    async fn due_assignments(
        &self,
        now: DateTime<Utc>,
        due_soon_until: DateTime<Utc>,
        overdue_after: DateTime<Utc>,
        limit: i64,
    ) -> Result<Vec<DueTaskAssignment>, Report> {
        let rows = sqlx::query_as::<_, DueTaskAssignmentRow>(
            r#"
            SELECT
                d.id AS task_id,
                NULLIF(d.name, '') AS task_name,
                (ep_due.values->>'value')::timestamptz AS due_at,
                assignee.val->>'entity_id' AS assignee_id
            FROM "Document" d
            JOIN document_sub_type dt
                ON dt.document_id = d.id AND dt.sub_type = 'task'
            JOIN entity_properties ep_due
                ON ep_due.entity_id = d.id
                AND ep_due.entity_type = 'TASK'
                AND ep_due.property_definition_id = $5
                AND ep_due.values->>'type' = 'Date'
                AND ep_due.values->>'value' IS NOT NULL
            JOIN entity_properties ep_assignees
                ON ep_assignees.entity_id = d.id
                AND ep_assignees.entity_type = 'TASK'
                AND ep_assignees.property_definition_id = $6
            JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(ep_assignees.values->'value') = 'array'
                     THEN ep_assignees.values->'value'
                     ELSE '[]'::jsonb
                END
            ) assignee(val) ON TRUE
            LEFT JOIN entity_properties ep_status
                ON ep_status.entity_id = d.id
                AND ep_status.entity_type = 'TASK'
                AND ep_status.property_definition_id = $7
            WHERE d."deletedAt" IS NULL
              AND (ep_due.values->>'value')::timestamptz > $1
              AND (ep_due.values->>'value')::timestamptz <= $2
              AND COALESCE(assignee.val->>'entity_id', '') <> ''
              AND NOT COALESCE(jsonb_exists(ep_status.values->'value', $8), false)
              AND NOT COALESCE(jsonb_exists(ep_status.values->'value', $9), false)
              AND NOT EXISTS (
                  SELECT 1
                  FROM user_notification_type_preference pref
                  WHERE pref.user_id = assignee.val->>'entity_id'
                    AND pref.notification_event_type = 'task_due'
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM notification n
                  JOIN user_notification un ON un.notification_id = n.id
                  WHERE n.notification_event_type = 'task_due'
                    AND n.event_item_id = d.id
                    AND un.user_id = assignee.val->>'entity_id'
                    AND un.deleted_at IS NULL
                    AND (n.metadata->>'dueAt')::timestamptz
                        = (ep_due.values->>'value')::timestamptz
                    AND n.metadata->>'kind' = CASE
                        WHEN (ep_due.values->>'value')::timestamptz <= $3
                            THEN 'overdue'
                        ELSE 'dueSoon'
                    END
              )
            ORDER BY (ep_due.values->>'value')::timestamptz ASC,
                     d.id ASC,
                     assignee.val->>'entity_id' ASC
            LIMIT $4
            "#,
        )
        .bind(overdue_after)
        .bind(due_soon_until)
        .bind(now)
        .bind(limit)
        .bind(DUE_DATE_PROPERTY_ID)
        .bind(ASSIGNEES_PROPERTY_ID)
        .bind(STATUS_PROPERTY_ID)
        .bind(COMPLETED_STATUS_OPTION_ID)
        .bind(CANCELED_STATUS_OPTION_ID)
        .fetch_all(&self.pool)
        .await
        .map_err(|error| {
            tracing::error!(error = ?error, "failed to load due task assignments");
            rootcause::report!("failed to load due task assignments").into_dynamic()
        })?;

        Ok(rows
            .into_iter()
            .map(|row| DueTaskAssignment {
                task_id: row.task_id,
                task_name: row.task_name,
                due_at: row.due_at,
                assignee_id: row.assignee_id,
            })
            .collect())
    }
}
