use super::{
    extract_backfill_message, extract_legacy_calendar_delivery, reset_legacy_calendar_delivery,
};
use aws_sdk_sqs::types::Message;
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use sqlx::PgPool;
use std::sync::atomic::{AtomicBool, Ordering};
use uuid::Uuid;

fn legacy_message(link_id: Uuid, calendar_job_id: Uuid) -> Message {
    Message::builder()
        .body(
            serde_json::json!({
                "backfillOperation": {
                    "calendar_google_backfill": {
                        "link_id": link_id,
                        "calendar_job_id": calendar_job_id
                    }
                }
            })
            .to_string(),
        )
        .build()
}

async fn published_calendar_job(pool: &PgPool) -> (Uuid, Uuid, Uuid) {
    let link_id = Uuid::new_v4();
    let job_id = Uuid::new_v4();
    let outbox_id = Uuid::new_v4();
    let owner = format!("macro|calendar-{link_id}@example.com");
    let address = format!("calendar-{link_id}@example.com");
    sqlx::query(
        "INSERT INTO email_links (id, macro_id, fusionauth_user_id, email_address, provider) \
         VALUES ($1, $2, $2, $3, 'GMAIL')",
    )
    .bind(link_id)
    .bind(owner)
    .bind(address)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO calendar_backfill_jobs (id, email_link_id, kind, grant_version) \
         VALUES ($1, $2, 'google_calendar', 1)",
    )
    .bind(job_id)
    .bind(link_id)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO calendar_sync_outbox (id, backfill_job_id, published_at) \
         VALUES ($1, $2, now())",
    )
    .bind(outbox_id)
    .bind(job_id)
    .execute(pool)
    .await
    .unwrap();
    (link_id, job_id, outbox_id)
}

async fn unpublished(pool: &PgPool, outbox_id: Uuid) -> bool {
    sqlx::query_scalar::<_, bool>(
        "SELECT published_at IS NULL FROM calendar_sync_outbox WHERE id = $1",
    )
    .bind(outbox_id)
    .fetch_one(pool)
    .await
    .unwrap()
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn legacy_delivery_rearms_the_real_outbox_before_ack_and_on_duplicate(pool: PgPool) {
    let (link_id, job_id, outbox_id) = published_calendar_job(&pool).await;
    let message = legacy_message(link_id, job_id);
    assert!(extract_backfill_message(&message).is_err());
    assert_eq!(
        extract_legacy_calendar_delivery(&message),
        Some((link_id, job_id))
    );

    for delivery in 0..2 {
        if delivery == 1 {
            sqlx::query("UPDATE calendar_sync_outbox SET published_at = now() WHERE id = $1")
                .bind(outbox_id)
                .execute(&pool)
                .await
                .unwrap();
        }
        assert!(!unpublished(&pool, outbox_id).await);
        reset_legacy_calendar_delivery(&pool, link_id, job_id, async {
            assert!(
                unpublished(&pool, outbox_id).await,
                "ack must follow durable reset"
            );
            Ok(())
        })
        .await
        .unwrap();
        assert!(unpublished(&pool, outbox_id).await);
    }
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn mismatched_link_does_not_ack_or_rearm_another_links_calendar_job(pool: PgPool) {
    let (_link_id, job_id, outbox_id) = published_calendar_job(&pool).await;
    let acked = AtomicBool::new(false);
    let result = reset_legacy_calendar_delivery(&pool, Uuid::new_v4(), job_id, async {
        acked.store(true, Ordering::SeqCst);
        Ok(())
    })
    .await;
    assert!(result.is_err());
    assert!(!acked.load(Ordering::SeqCst));
    assert!(!unpublished(&pool, outbox_id).await);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn missing_outbox_row_does_not_ack_legacy_delivery(pool: PgPool) {
    let (link_id, job_id, outbox_id) = published_calendar_job(&pool).await;
    sqlx::query("DELETE FROM calendar_sync_outbox WHERE id = $1")
        .bind(outbox_id)
        .execute(&pool)
        .await
        .unwrap();
    let acked = AtomicBool::new(false);
    let result = reset_legacy_calendar_delivery(&pool, link_id, job_id, async {
        acked.store(true, Ordering::SeqCst);
        Ok(())
    })
    .await;
    assert!(result.is_err());
    assert!(!acked.load(Ordering::SeqCst));
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn database_reset_failure_leaves_delivery_retryable(pool: PgPool) {
    let (link_id, job_id, _outbox_id) = published_calendar_job(&pool).await;
    pool.close().await;
    let acked = AtomicBool::new(false);
    let result = reset_legacy_calendar_delivery(&pool, link_id, job_id, async {
        acked.store(true, Ordering::SeqCst);
        Ok(())
    })
    .await;
    assert!(result.is_err());
    assert!(!acked.load(Ordering::SeqCst));
}

#[test]
fn malformed_or_non_calendar_messages_do_not_claim_a_legacy_delivery() {
    let id = Uuid::new_v4();
    for body in [
        "{".to_string(),
        serde_json::json!({
            "backfillOperation": {"calendar_google_backfill": {"calendar_job_id": id}}
        }).to_string(),
        serde_json::json!({
            "backfillOperation": {"calendar_google_backfill": {"link_id": id, "calendar_job_id": "bad"}}
        }).to_string(),
        serde_json::json!({
            "backfillOperation": {"init": {"link_id": id, "job_id": id}}
        }).to_string(),
    ] {
        let message = Message::builder().body(body).build();
        assert!(extract_legacy_calendar_delivery(&message).is_none());
    }
}
