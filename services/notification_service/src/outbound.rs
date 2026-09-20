//! Outbound adapters owned by the notification service composition root.

mod task_due;

pub use task_due::PgTaskDueSource;
