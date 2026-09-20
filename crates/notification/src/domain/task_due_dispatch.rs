//! Due-date dispatch: notifies task assignees when a task is due soon or overdue.
//!
//! Modeled on the calendar reminder dispatcher: a minutely tick sweeps open
//! tasks whose due instant is inside the window and fans one notification out
//! per assignee. Idempotency is the notification row: [`TaskDueNotification::request_for_assignee`]
//! derives a stable id from `(task, assignee, due_at, kind)`, so a repeat tick
//! or a raced worker cannot insert a second alert.
//!
//! No authorization: a firing only ever notifies an assignee already stored on
//! the task.

#[cfg(test)]
mod test;

use chrono::{DateTime, Utc};
use macro_user_id::user_id::MacroUserIdStr;
use rootcause::Report;

use crate::domain::models::{
    DUE_SOON_WINDOW, DueTaskAssignment, OVERDUE_LOOKBACK, TASK_DUE_SWEEP_PAGE,
    TaskDueDispatchSummary, TaskDueNotification,
};
use crate::domain::ports::{TaskDueDispatch, TaskDueNotifier, TaskDueSource};
use crate::domain::service::NotificationIngress;

/// Delivers due-soon / overdue notifications to task assignees.
#[derive(Debug, Clone)]
pub struct TaskDueDispatchService<S, N> {
    source: S,
    notifier: N,
}

impl<S, N> TaskDueDispatchService<S, N>
where
    S: TaskDueSource,
    N: TaskDueNotifier,
{
    /// Construct the dispatcher from its ports.
    pub fn new(source: S, notifier: N) -> Self {
        Self { source, notifier }
    }

    /// Sweep and notify against an explicit clock. Production calls
    /// [`TaskDueDispatch::dispatch`], which uses wall time.
    async fn dispatch_at(&self, now: DateTime<Utc>) -> Result<TaskDueDispatchSummary, Report> {
        let due_soon_until = now + DUE_SOON_WINDOW;
        let overdue_after = now - OVERDUE_LOOKBACK;
        let assignments = self
            .source
            .due_assignments(now, due_soon_until, overdue_after, TASK_DUE_SWEEP_PAGE)
            .await?;

        let mut summary = TaskDueDispatchSummary::default();
        for assignment in assignments {
            if !in_window(assignment.due_at, now) {
                summary.skipped += 1;
                continue;
            }
            let DueTaskAssignment {
                task_id,
                task_name,
                due_at,
                assignee_id: assignee_raw,
            } = assignment;
            let assignee_id = match MacroUserIdStr::parse_from_str(&assignee_raw) {
                Ok(id) => id,
                Err(error) => {
                    tracing::warn!(
                        error = %error,
                        task_id = %task_id,
                        assignee_id = %assignee_raw,
                        "skipping task due assignment with an unparseable assignee id"
                    );
                    summary.skipped += 1;
                    continue;
                }
            };
            let notification = TaskDueNotification::new(task_id, task_name, due_at, now);
            match self.notifier.notify(notification, assignee_id).await {
                Ok(()) => summary.notified += 1,
                Err(error) => {
                    tracing::error!(
                        error = ?error.preformat(),
                        "failed to send task due notification; will retry on the next tick"
                    );
                    summary.failed += 1;
                }
            }
        }
        Ok(summary)
    }
}

impl<S, N> TaskDueDispatch for TaskDueDispatchService<S, N>
where
    S: TaskDueSource,
    N: TaskDueNotifier,
{
    #[tracing::instrument(err, skip(self))]
    async fn dispatch(&self) -> Result<TaskDueDispatchSummary, Report> {
        self.dispatch_at(Utc::now()).await
    }
}

fn in_window(due_at: DateTime<Utc>, now: DateTime<Utc>) -> bool {
    due_at > now - OVERDUE_LOOKBACK && due_at <= now + DUE_SOON_WINDOW
}

/// Turns a [`NotificationIngress`] into a [`TaskDueNotifier`] by building
/// [`TaskDueNotification::request_for_assignee`].
#[derive(Debug, Clone)]
pub struct IngressTaskDueNotifier<I> {
    ingress: I,
}

impl<I> IngressTaskDueNotifier<I> {
    /// Wrap a notification ingress.
    pub fn new(ingress: I) -> Self {
        Self { ingress }
    }
}

impl<I: NotificationIngress> TaskDueNotifier for IngressTaskDueNotifier<I> {
    #[tracing::instrument(err, skip_all, fields(task_id = %notification.task_id, kind = notification.kind.as_str()))]
    async fn notify(
        &self,
        notification: TaskDueNotification,
        assignee_id: MacroUserIdStr<'_>,
    ) -> Result<(), Report> {
        let request = notification.request_for_assignee(assignee_id);
        self.ingress.send_notification(request).await.map_err(|error| {
            tracing::error!(
                error = ?error,
                "task due notification rejected by ingress"
            );
            rootcause::report!("failed to send task due notification").into_dynamic()
        })?;
        Ok(())
    }
}
