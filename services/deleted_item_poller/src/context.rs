use std::sync::Arc;

use conation_event_broker::{GlobalSpawner, KafkaEventPublisher, MacroEventBrokerService};

pub type PollerEventBroker = MacroEventBrokerService<KafkaEventPublisher, GlobalSpawner>;

#[derive(Clone)]
pub struct Context {
    pub db: sqlx::Pool<sqlx::Postgres>,
    pub conation_event_broker: PollerEventBroker,
    pub sqs_client: Arc<sqs_client::SQS>,
}
