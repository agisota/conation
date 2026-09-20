//! Worker that ticks task due-date dispatch.
//!
//! There is no dedicated queue: unlike calendar reminders, task due dates are
//! a property scan, not a materialized firing schedule. A minutely loop in
//! `notification_service` calls [`TaskDueDispatch::dispatch`].

use std::time::Duration;

use crate::domain::ports::TaskDueDispatch;

/// How long to wait between ticks. Matches the calendar reminder EventBridge
/// cadence so due-soon / overdue alerts land within a minute of the window.
const TICK: Duration = Duration::from_secs(60);

/// Polls due tasks and notifies assignees.
pub struct TaskDueDispatchWorker<S> {
    service: S,
}

impl<S> TaskDueDispatchWorker<S>
where
    S: TaskDueDispatch,
{
    /// Build a worker over a dispatch service.
    pub fn new(service: S) -> Self {
        Self { service }
    }

    /// Run the dispatch loop continuously.
    pub async fn run(&self) -> ! {
        loop {
            match self.service.dispatch().await {
                Ok(summary) => {
                    if summary.notified > 0 || summary.failed > 0 {
                        tracing::info!(
                            notified = summary.notified,
                            skipped = summary.skipped,
                            failed = summary.failed,
                            "task due dispatch tick"
                        );
                    }
                }
                Err(error) => {
                    tracing::error!(
                        error = ?error.preformat(),
                        "task due dispatch tick failed"
                    );
                }
            }
            tokio::time::sleep(TICK).await;
        }
    }
}
