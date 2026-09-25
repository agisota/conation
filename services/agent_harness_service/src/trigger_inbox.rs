use std::{future::Future, time::Duration};
use agent_trigger::domain::broker_events::AgentTriggerTopicEvent;
use bot_id::BotId;
use macro_uuid::Uuid;
use sqlx::{PgPool, Row};

const CLAIM_LEASE: &str = "5 minutes";

#[derive(Clone)]
pub struct KafkaRecord {
    pub topic: String,
    pub partition: i32,
    pub offset: i64,
}

pub struct ClaimedTrigger {
    pub id: Uuid,
    pub claim_token: Uuid,
    pub target_bot: BotId,
    pub event: AgentTriggerTopicEvent,
    pub attempt: i32,
}

#[derive(Clone)]
pub struct PgTriggerInbox {
    pool: PgPool,
}

impl PgTriggerInbox {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Record a decodable trigger and its Kafka receipt atomically. Duplicate
    /// publications of one bot/message share one durable work item.
    pub async fn record_event(
        &self,
        source: KafkaRecord,
        event_id: Uuid,
        bot: BotId,
        message: Uuid,
        event: &AgentTriggerTopicEvent,
    ) -> anyhow::Result<Uuid> {
        let mut tx = self.pool.begin().await?;
        let payload = serde_json::to_value(event)?;
        sqlx::query(
            r#"
            INSERT INTO agent_harness_trigger_inbox
                (id, bot_id, message_id, event_id, payload)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (bot_id, message_id) DO NOTHING
            "#,
        )
        .bind(macro_uuid::generate_uuid_v7())
        .bind(bot.as_uuid())
        .bind(message)
        .bind(event_id)
        .bind(payload.clone())
        .execute(&mut *tx)
        .await?;
        let work_id: Uuid = sqlx::query_scalar(
            "SELECT id FROM agent_harness_trigger_inbox WHERE bot_id = $1 AND message_id = $2",
        )
        .bind(bot.as_uuid())
        .bind(message)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query(
            r#"
            INSERT INTO agent_harness_trigger_receipt
                (topic, partition, "offset", work_id, event_id, bot_id, message_id, payload)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (topic, partition, "offset") DO NOTHING
            "#,
        )
        .bind(source.topic)
        .bind(source.partition)
        .bind(source.offset)
        .bind(work_id)
        .bind(event_id)
        .bind(bot.as_uuid())
        .bind(message)
        .bind(payload)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(work_id)
    }

    /// Persist malformed, unrecognized, or unknown-bot records as terminal
    /// receipts. The caller may commit Kafka only after this succeeds.
    pub async fn record_terminal(
        &self,
        source: KafkaRecord,
        event_id: Option<Uuid>,
        bot: Option<BotId>,
        message: Option<Uuid>,
        event: Option<&AgentTriggerTopicEvent>,
        reason: &str,
    ) -> anyhow::Result<()> {
        let payload = event.map(serde_json::to_value).transpose()?;
        sqlx::query(
            r#"
            INSERT INTO agent_harness_trigger_receipt
                (topic, partition, "offset", event_id, bot_id, message_id, payload, terminal_reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (topic, partition, "offset") DO NOTHING
            "#,
        )
        .bind(source.topic)
        .bind(source.partition)
        .bind(source.offset)
        .bind(event_id)
        .bind(bot.map(|target| target.as_uuid()))
        .bind(message)
        .bind(payload)
        .bind(reason)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Claim one due item. The database transaction lock serializes selection;
    /// live claims and FIFO order are scoped to a bot so other bots can progress.
    pub async fn claim_next(&self) -> anyhow::Result<Option<ClaimedTrigger>> {
        let token = macro_uuid::generate_uuid_v7();
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(1936028237, 1)")
            .execute(&mut *tx)
            .await?;
        let row = sqlx::query(
            r#"
            WITH ready AS (
                SELECT candidate.id
                FROM agent_harness_trigger_inbox AS candidate
                WHERE candidate.next_attempt_at <= now()
                  AND (
                      candidate.status IN ('pending', 'retry')
                      OR (candidate.status = 'processing' AND candidate.claim_expires_at <= now())
                  )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM agent_harness_trigger_inbox AS active
                      WHERE active.bot_id = candidate.bot_id
                        AND active.status = 'processing'
                        AND active.claim_expires_at > now()
                  )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM agent_harness_trigger_inbox AS prior
                      WHERE prior.bot_id = candidate.bot_id
                        AND (prior.created_at, prior.id) < (candidate.created_at, candidate.id)
                        AND prior.status IN ('pending', 'retry', 'processing')
                  )
                ORDER BY CASE WHEN candidate.status = 'processing' THEN 0 ELSE 1 END,
                         candidate.next_attempt_at, candidate.created_at, candidate.id
                FOR UPDATE OF candidate SKIP LOCKED
                LIMIT 1
            )
            UPDATE agent_harness_trigger_inbox AS inbox
            SET status = 'processing',
                attempt_count = attempt_count + 1,
                claim_token = $1,
                claim_expires_at = now() + $2::interval
            FROM ready
            WHERE inbox.id = ready.id
            RETURNING inbox.id, inbox.bot_id, inbox.payload, inbox.attempt_count
            "#,
        )
        .bind(token)
        .bind(CLAIM_LEASE)
        .fetch_optional(&mut *tx)
        .await?;
        tx.commit().await?;
        let Some(row) = row else {
            return Ok(None);
        };
        let payload: serde_json::Value = row.try_get("payload")?;
        Ok(Some(ClaimedTrigger {
            id: row.try_get("id")?,
            claim_token: token,
            target_bot: BotId::new_from_uuid(row.try_get("bot_id")?),
            event: serde_json::from_value(payload)?,
            attempt: row.try_get("attempt_count")?,
        }))
    }

    pub async fn renew(&self, work: &ClaimedTrigger) -> anyhow::Result<()> {
        let result = sqlx::query(
            r#"
            UPDATE agent_harness_trigger_inbox
            SET claim_expires_at = now() + $3::interval
            WHERE id = $1 AND claim_token = $2 AND status = 'processing'
            "#,
        )
        .bind(work.id)
        .bind(work.claim_token)
        .bind(CLAIM_LEASE)
        .execute(&self.pool)
        .await?;
        anyhow::ensure!(result.rows_affected() == 1, "trigger inbox claim was lost");
        Ok(())
    }

    pub async fn complete(&self, work: &ClaimedTrigger) -> anyhow::Result<()> {
        let result = sqlx::query(
            r#"
            UPDATE agent_harness_trigger_inbox
            SET status = 'completed', completed_at = now(), last_error = NULL,
                claim_token = NULL, claim_expires_at = NULL
            WHERE id = $1 AND claim_token = $2 AND status = 'processing'
            "#,
        )
        .bind(work.id)
        .bind(work.claim_token)
        .execute(&self.pool)
        .await?;
        anyhow::ensure!(result.rows_affected() == 1, "trigger inbox claim was lost before completion");
        Ok(())
    }

    pub async fn retry(&self, work: &ClaimedTrigger, error: &str) -> anyhow::Result<()> {
        let result = sqlx::query(
            r#"
            UPDATE agent_harness_trigger_inbox
            SET status = 'retry',
                next_attempt_at = now() + LEAST(300, attempt_count * 5) * INTERVAL '1 second',
                last_error = $3,
                claim_token = NULL, claim_expires_at = NULL
            WHERE id = $1 AND claim_token = $2 AND status = 'processing'
            "#,
        )
        .bind(work.id)
        .bind(work.claim_token)
        .bind(error)
        .execute(&self.pool)
        .await?;
        anyhow::ensure!(result.rows_affected() == 1, "trigger inbox claim was lost while recording retry");
        Ok(())
    }

    pub async fn terminal(&self, work: &ClaimedTrigger, reason: &str) -> anyhow::Result<()> {
        let result = sqlx::query(
            r#"
            UPDATE agent_harness_trigger_inbox
            SET status = 'terminal', last_error = $3,
                claim_token = NULL, claim_expires_at = NULL
            WHERE id = $1 AND claim_token = $2 AND status = 'processing'
            "#,
        )
        .bind(work.id)
        .bind(work.claim_token)
        .bind(reason)
        .execute(&self.pool)
        .await?;
        anyhow::ensure!(result.rows_affected() == 1, "trigger inbox claim was lost while terminalizing");
        Ok(())
    }

}

/// Keep a claimed row fenced while its provider work is in flight. If the
/// process dies, the lease expires and another replica reconciles the row.
pub async fn under_lease<T, F>(
    inbox: &PgTriggerInbox,
    claim: &ClaimedTrigger,
    future: F,
) -> anyhow::Result<T>
where
    F: Future<Output = anyhow::Result<T>>,
{
    tokio::pin!(future);
    let mut renew = tokio::time::interval_at(
        tokio::time::Instant::now() + Duration::from_secs(30),
        Duration::from_secs(30),
    );
    loop {
        tokio::select! {
            result = &mut future => return result,
            _ = renew.tick() => inbox.renew(claim).await?,
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use macro_db_migrator::MACRO_DB_MIGRATIONS;

    fn event(bot: BotId, message: Uuid) -> AgentTriggerTopicEvent {
        serde_json::from_value(serde_json::json!({
            "event_type": "agent_trigger.new",
            "metadata": {
                "source": "top_level_mentioned",
                "bot_id": bot,
                "message": {
                    "channel_id": Uuid::from_u128(1),
                    "message_id": message,
                    "thread_id": null,
                    "sender": "macro|trigger-inbox-test@example.com",
                    "triggered_by": null,
                    "channel_type": "private",
                    "content": "@macro-new work",
                    "mentions": [],
                    "attachments": [],
                    "created_at": "2026-09-25T00:00:00Z"
                }
            }
        }))
        .expect("valid trigger event")
    }

    fn source(offset: i64) -> KafkaRecord {
        KafkaRecord {
            topic: "macro.agent_sessions".to_owned(),
            partition: 0,
            offset,
        }
    }

    async fn order_work(pool: &PgPool, id: Uuid, rank: i32) {
        sqlx::query(
            "UPDATE agent_harness_trigger_inbox \
             SET created_at = now() - INTERVAL '10 seconds' + $2 * INTERVAL '1 second', \
                 next_attempt_at = now() - INTERVAL '1 hour' \
             WHERE id = $1",
        )
        .bind(id)
        .bind(rank)
        .execute(pool)
        .await
        .expect("set deterministic inbox order");
    }

    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn another_bot_can_progress_while_same_bot_work_remains_ordered(pool: PgPool) {
        let inbox = PgTriggerInbox::new(pool.clone());
        let bot_a = bot_id::MACRO_NEW_BOT_ID;
        let bot_b = bot_id::MACRO_CODER_BOT_ID;
        let a_first_id = inbox
            .record_event(
                source(11),
                Uuid::from_u128(211),
                bot_a,
                Uuid::from_u128(111),
                &event(bot_a, Uuid::from_u128(111)),
            )
            .await
            .unwrap();
        let b_first_id = inbox
            .record_event(
                source(12),
                Uuid::from_u128(212),
                bot_b,
                Uuid::from_u128(112),
                &event(bot_b, Uuid::from_u128(112)),
            )
            .await
            .unwrap();
        let a_second_id = inbox
            .record_event(
                source(13),
                Uuid::from_u128(213),
                bot_a,
                Uuid::from_u128(113),
                &event(bot_a, Uuid::from_u128(113)),
            )
            .await
            .unwrap();
        order_work(&pool, a_first_id, 1).await;
        order_work(&pool, b_first_id, 2).await;
        order_work(&pool, a_second_id, 3).await;

        let a_first = inbox
            .claim_next()
            .await
            .unwrap()
            .expect("first bot A work is ready");
        assert_eq!(a_first.id, a_first_id);
        let b_first = inbox
            .claim_next()
            .await
            .unwrap()
            .expect("bot B work proceeds while bot A is active");
        assert_eq!(b_first.id, b_first_id);
        assert!(
            inbox.claim_next().await.unwrap().is_none(),
            "later bot A work must wait behind its earlier active item"
        );

        inbox.complete(&a_first).await.unwrap();
        let a_second = inbox
            .claim_next()
            .await
            .unwrap()
            .expect("bot A's next item becomes claimable after its predecessor completes");
        assert_eq!(a_second.id, a_second_id);
        assert_eq!(a_second.target_bot, bot_a);
    }

    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn terminal_invalid_origin_unblocks_the_next_same_bot_trigger(pool: PgPool) {
        let inbox = PgTriggerInbox::new(pool.clone());
        let bot = bot_id::MACRO_NEW_BOT_ID;
        let invalid_id = inbox
            .record_event(
                source(21),
                Uuid::from_u128(221),
                bot,
                Uuid::from_u128(121),
                &event(bot, Uuid::from_u128(121)),
            )
            .await
            .unwrap();
        let valid_id = inbox
            .record_event(
                source(22),
                Uuid::from_u128(222),
                bot,
                Uuid::from_u128(122),
                &event(bot, Uuid::from_u128(122)),
            )
            .await
            .unwrap();
        order_work(&pool, invalid_id, 1).await;
        order_work(&pool, valid_id, 2).await;

        let invalid = inbox
            .claim_next()
            .await
            .unwrap()
            .expect("invalid-origin trigger is first");
        assert_eq!(invalid.id, invalid_id);
        let error = agent_harness::domain::error::HarnessError::PromptOriginRejected(
            rootcause::report!("source message was deleted").into(),
        );
        let crate::TriggerWorkDisposition::Terminal(reason) =
            crate::classify_trigger_failure(error).expect("origin failures are terminal")
        else {
            panic!("permanent origin error should produce a terminal disposition");
        };
        assert!(
            crate::classify_trigger_failure(
                agent_harness::domain::error::HarnessError::PromptContext(
                    rootcause::report!("access service temporarily unavailable").into(),
                )
            )
            .is_err(),
            "transient dependency failures remain retryable"
        );
        let disposition = crate::TriggerWorkDisposition::Terminal(reason);
        crate::persist_trigger_disposition(&inbox, &invalid, &disposition)
            .await
            .unwrap();

        let valid = inbox
            .claim_next()
            .await
            .unwrap()
            .expect("terminal origin failure does not block the bot's next trigger");
        assert_eq!(valid.id, valid_id);
    }

    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn managed_work_is_claimable_even_when_target_differs_from_harness_bot(
        pool: PgPool,
    ) {
        let inbox = PgTriggerInbox::new(pool);
        let bot = bot_id::MACRO_NEW_BOT_ID;
        let message = Uuid::from_u128(101);
        let event = event(bot, message);
        inbox
            .record_event(source(1), Uuid::from_u128(201), bot, message, &event)
            .await
            .expect("durably record trigger");

        let claim = inbox
            .claim_next()
            .await
            .expect("claim work")
            .expect("work is available");

        assert_eq!(claim.target_bot, bot);
    }

    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn trigger_work_remains_retryable_after_the_twelfth_attempt(pool: PgPool) {
        let inbox = PgTriggerInbox::new(pool.clone());
        let bot = bot_id::MACRO_NEW_BOT_ID;
        let message = Uuid::from_u128(102);
        let event = event(bot, message);
        let work_id = inbox
            .record_event(source(2), Uuid::from_u128(202), bot, message, &event)
            .await
            .expect("durably record trigger");
        let mut claim = inbox
            .claim_next()
            .await
            .expect("claim first attempt")
            .expect("work is available");
        sqlx::query(
            "UPDATE agent_harness_trigger_inbox SET attempt_count = 12 WHERE id = $1",
        )
        .bind(work_id)
        .execute(&pool)
        .await
        .expect("arrange a failure after twelve attempts");
        claim.attempt = 12;

        inbox
            .retry(&claim, "temporary dependency outage")
            .await
            .expect("persist retry");
        sqlx::query("UPDATE agent_harness_trigger_inbox SET next_attempt_at = now() WHERE id = $1")
            .bind(work_id)
            .execute(&pool)
            .await
            .expect("make the retry due for the assertion");

        let next = inbox
            .claim_next()
            .await
            .expect("claim retry")
            .expect("work remains retryable");
        assert_eq!(next.id, work_id);
        assert_eq!(next.attempt, 13);
    }

    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn queued_session_action_keeps_its_trigger_retryable_and_blocks_later_bot_work(
        pool: PgPool,
    ) {
        let inbox = PgTriggerInbox::new(pool.clone());
        let bot = bot_id::MACRO_NEW_BOT_ID;
        let first_id = inbox
            .record_event(
                source(31),
                Uuid::from_u128(231),
                bot,
                Uuid::from_u128(131),
                &event(bot, Uuid::from_u128(131)),
            )
            .await
            .unwrap();
        let later_id = inbox
            .record_event(
                source(32),
                Uuid::from_u128(232),
                bot,
                Uuid::from_u128(132),
                &event(bot, Uuid::from_u128(132)),
            )
            .await
            .unwrap();
        order_work(&pool, first_id, 1).await;
        order_work(&pool, later_id, 2).await;

        let first = inbox
            .claim_next()
            .await
            .unwrap()
            .expect("first trigger is ready");
        assert_eq!(first.id, first_id);
        let disposition = crate::TriggerWorkDisposition::Queued;
        crate::persist_trigger_disposition(&inbox, &first, &disposition)
            .await
            .expect("queued session actions are retried, not completed");

        assert!(
            inbox.claim_next().await.unwrap().is_none(),
            "later same-bot work waits behind the queued trigger's retry"
        );
        sqlx::query(
            "UPDATE agent_harness_trigger_inbox SET next_attempt_at = now() WHERE id = $1",
        )
        .bind(first_id)
        .execute(&pool)
        .await
        .expect("make queued trigger due for retry");
        let retry = inbox
            .claim_next()
            .await
            .unwrap()
            .expect("queued trigger remains durable and retryable");
        assert_eq!(retry.id, first_id);
    }
}
