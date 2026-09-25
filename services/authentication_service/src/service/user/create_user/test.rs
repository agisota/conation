use std::sync::Mutex;

use macro_env_var::optional_read_env_var;

use super::{LOCAL_STRIPE_SECRET_STUB, is_local_stripe_stub, local_stripe_customer_id};

/// Tests mutate the process env, which is process-global; serialize them so
/// they can't interleave.
static ENV_LOCK: Mutex<()> = Mutex::new(());

/// Restores the saved `STRIPE_SECRET_KEY` on drop, so a panicking test body
/// can't leak its value into later tests.
struct RestoreStripeKey(Option<String>);

impl Drop for RestoreStripeKey {
    fn drop(&mut self) {
        match self.0.take() {
            Some(saved) => unsafe { std::env::set_var("STRIPE_SECRET_KEY", saved) },
            None => unsafe { std::env::remove_var("STRIPE_SECRET_KEY") },
        }
    }
}

fn with_stripe_key(key: Option<&str>, f: impl FnOnce()) {
    let _guard = ENV_LOCK.lock().unwrap();
    let _restore = RestoreStripeKey(optional_read_env_var("STRIPE_SECRET_KEY").ok().flatten());
    match key {
        Some(key) => unsafe { std::env::set_var("STRIPE_SECRET_KEY", key) },
        None => unsafe { std::env::remove_var("STRIPE_SECRET_KEY") },
    };
    f();
}

#[test]
fn local_stub_key_is_detected() {
    with_stripe_key(Some(LOCAL_STRIPE_SECRET_STUB), || {
        assert!(is_local_stripe_stub());
    });
}

#[test]
fn real_key_is_not_detected_as_stub() {
    with_stripe_key(Some("sk_live_real_key"), || {
        assert!(!is_local_stripe_stub());
    });
}

#[test]
fn missing_key_is_not_detected_as_stub() {
    with_stripe_key(None, || {
        assert!(!is_local_stripe_stub());
    });
}

#[test]
fn local_stripe_customer_id_is_unique_per_email() {
    let alice = local_stripe_customer_id("alice@seed.macro.local");
    let bob = local_stripe_customer_id("bob@seed.macro.local");
    assert_ne!(alice, bob);
    assert!(alice.contains("alice@seed.macro.local"));
}

#[sqlx::test(migrator = "macro_db_migrator::MACRO_DB_MIGRATIONS")]
async fn legacy_email_matches_keep_existing_autojoin_without_explicit_activation(
    db: sqlx::PgPool,
) -> anyhow::Result<()> {
    let org: i32 = sqlx::query_scalar(
        "INSERT INTO \"Organization\" (name) VALUES ('Legacy membership') RETURNING id",
    )
    .fetch_one(&db)
    .await?;
    sqlx::query("INSERT INTO \"OrganizationEmailMatches\" (\"organizationId\", email) VALUES ($1, 'person@gmail.com'), ($1, 'company.test')")
        .bind(org).execute(&db).await?;
    sqlx::query(
        "INSERT INTO \"Role\" (id, description) VALUES ('legacy_invite_role', 'Legacy invitation')",
    )
    .execute(&db)
    .await?;
    sqlx::query("INSERT INTO \"RolesOnOrganizations\" (\"organizationId\", \"roleId\") VALUES ($1, 'legacy_invite_role')")
        .bind(org).execute(&db).await?;
    assert!(!super::requires_activation(&db, "person@company.test").await?);
    let personal = uuid::Uuid::new_v4();
    let corporate = uuid::Uuid::new_v4();
    for (id, email) in [
        (personal, "person@gmail.com"),
        (corporate, "person@company.test"),
    ] {
        sqlx::query("INSERT INTO macro_user (id, username, email, stripe_customer_id) VALUES ($1, $2, $2, $3)")
            .bind(id).bind(email).bind(format!("customer-{id}")).execute(&db).await?;
    }
    super::create_user_profile(&personal.to_string(), "person@gmail.com", &db).await?;
    super::create_user_profile(&corporate.to_string(), "person@company.test", &db).await?;
    let members: Vec<(String, Option<i32>)> =
        sqlx::query_as("SELECT email, \"organizationId\" FROM \"User\" ORDER BY email")
            .fetch_all(&db)
            .await?;
    assert_eq!(
        members,
        vec![
            ("person@company.test".into(), Some(org)),
            ("person@gmail.com".into(), Some(org))
        ]
    );
    let personal_roles: Vec<String> = sqlx::query_scalar(
        "SELECT \"roleId\" FROM \"RolesOnUsers\" WHERE \"userId\" = 'macro|person@gmail.com'",
    )
    .fetch_all(&db)
    .await?;
    assert!(personal_roles.contains(&"legacy_invite_role".into()));
    let corporate_roles: Vec<String> = sqlx::query_scalar(
        "SELECT \"roleId\" FROM \"RolesOnUsers\" WHERE \"userId\" = 'macro|person@company.test'",
    )
    .fetch_all(&db)
    .await?;
    assert!(corporate_roles.contains(&"legacy_invite_role".into()));
    Ok(())
}

#[sqlx::test(migrator = "macro_db_migrator::MACRO_DB_MIGRATIONS")]
async fn reserved_corporate_identity_stays_blocked_after_revoke_and_reissue(
    db: sqlx::PgPool,
) -> anyhow::Result<()> {
    let email = "worker@company.test";
    let org_id: i32 = sqlx::query_scalar(
        "INSERT INTO \"Organization\" (name) VALUES ('Activation safety') RETURNING id",
    )
    .fetch_one(&db)
    .await?;
    let reserved_id = uuid::Uuid::new_v4();
    let personal_id = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO corporate_activation_invitation (id, corporate_email, organization_id, code_hash, expires_at)
         VALUES ($1, $2, $3, $4, now() + interval '30 minutes')",
    )
    .bind(reserved_id)
    .bind(email)
    .bind(org_id)
    .bind(Vec::<u8>::new())
    .execute(&db)
    .await?;

    assert!(!super::mailbox_login_pending(&db, email, &personal_id.to_string()).await?);
    sqlx::query(
        "UPDATE corporate_activation_invitation
         SET claimed_at = now(), revoked_at = now(), session_hash = decode('01', 'hex'),
             session_expires_at = now() + interval '10 minutes'
         WHERE id = $1",
    )
    .bind(reserved_id)
    .execute(&db)
    .await?;
    assert!(super::mailbox_login_pending(&db, email, &reserved_id.to_string()).await?);
    assert!(!super::mailbox_login_pending(&db, email, &personal_id.to_string()).await?);

    sqlx::query(
        "UPDATE corporate_activation_invitation
         SET claimed_at = NULL, revoked_at = NULL, session_hash = NULL, session_expires_at = NULL
         WHERE id = $1",
    )
    .bind(reserved_id)
    .execute(&db)
    .await?;
    assert!(super::mailbox_login_pending(&db, email, &reserved_id.to_string()).await?);
    assert!(!super::mailbox_login_pending(&db, email, &personal_id.to_string()).await?);
    let pending_email = "pending@company.test";
    let pending_id = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO corporate_activation_invitation (id, corporate_email, organization_id, code_hash, expires_at)
         VALUES ($1, $2, $3, $4, now() + interval '30 minutes')",
    )
    .bind(pending_id)
    .bind(pending_email)
    .bind(org_id)
    .bind(Vec::<u8>::new())
    .execute(&db)
    .await?;
    sqlx::query(
        "INSERT INTO macro_user (id, username, email, stripe_customer_id)
         VALUES ($1, $2, $2, $3)",
    )
    .bind(pending_id)
    .bind(pending_email)
    .bind(format!("customer-{pending_id}"))
    .execute(&db)
    .await?;
    sqlx::query(
        "INSERT INTO corporate_mailbox_provision_intent (idempotency_key, fusionauth_user_id, corporate_email)
         VALUES ($1, $1, $2)",
    )
    .bind(pending_id)
    .bind(pending_email)
    .execute(&db)
    .await?;
    sqlx::query("UPDATE corporate_activation_invitation SET consumed_at = now() WHERE id = $1")
        .bind(pending_id)
        .execute(&db)
        .await?;
    sqlx::query("UPDATE corporate_mailbox_provision_intent SET state = 'PROVISIONED' WHERE idempotency_key = $1")
        .bind(pending_id)
        .execute(&db)
        .await?;
    assert!(super::requires_activation(&db, pending_email).await?);
    assert!(super::mailbox_login_pending(&db, pending_email, &pending_id.to_string()).await?);
    assert!(!super::mailbox_login_pending(&db, pending_email, &personal_id.to_string()).await?);
    sqlx::query(
        "UPDATE corporate_mailbox_provision_intent SET state = 'READY' WHERE idempotency_key = $1",
    )
    .bind(pending_id)
    .execute(&db)
    .await?;
    assert!(!super::requires_activation(&db, pending_email).await?);
    assert!(!super::mailbox_login_pending(&db, pending_email, &pending_id.to_string()).await?);
    let personal_email = "person@gmail.com";
    let stale_invite_id = uuid::Uuid::new_v4();
    sqlx::query(
        "INSERT INTO corporate_activation_invitation
         (id, corporate_email, organization_id, code_hash, expires_at, revoked_at)
         VALUES ($1, $2, $3, $4, now() + interval '30 minutes', now())",
    )
    .bind(stale_invite_id)
    .bind(personal_email)
    .bind(org_id)
    .bind(Vec::<u8>::new())
    .execute(&db)
    .await?;
    assert!(!super::mailbox_login_pending(&db, personal_email, &personal_id.to_string()).await?);
    assert!(!super::mailbox_login_pending(&db, personal_email, "caller-user-id").await?);
    Ok(())
}
