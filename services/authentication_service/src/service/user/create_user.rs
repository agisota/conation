use std::collections::HashSet;

use macro_db_client::user::organization::{
    get_organization_roles_for_user, match_user_to_organization,
};
use macro_env_var::optional_read_env_var;

#[cfg(test)]
mod test;

/// The stub `STRIPE_SECRET_KEY` set by `run_local --no-doppler` (see
/// `tooling/xtask/crates/xtask_local/src/local/local_env.rs`). With this key a
/// real Stripe call would fail, so local signups skip it and store a
/// deterministic placeholder id instead.
const LOCAL_STRIPE_SECRET_STUB: &str = "local-stripe-secret";

fn is_local_stripe_stub() -> bool {
    optional_read_env_var("STRIPE_SECRET_KEY")
        .ok()
        .flatten()
        .is_some_and(|key| key == LOCAL_STRIPE_SECRET_STUB)
}

/// A unique placeholder Stripe customer id for local signups. `stripe_customer_id`
/// has a UNIQUE constraint, so it must be unique per user.
fn local_stripe_customer_id(email: &str) -> String {
    format!("local-stripe-customer-{email}")
}
/// A corporate identity without a READY mailbox cannot use the usual signup OTP.
/// An IT-issued reservation stays blocked after revocation while its legacy
/// organization invitation remains: otherwise the old auto-join path bypasses
/// the revoked corporate claim. Unreserved legacy invitations are unchanged.
pub async fn requires_activation(
    db: &sqlx::Pool<sqlx::Postgres>,
    email: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
            SELECT 1 FROM corporate_activation_invitation invitation
            WHERE invitation.corporate_email = $1
              AND NOT EXISTS (
                  SELECT 1 FROM corporate_mailbox_provision_intent ready_intent
                  WHERE ready_intent.idempotency_key = invitation.id
                    AND ready_intent.corporate_email = invitation.corporate_email
                    AND ready_intent.state = 'READY'
              )
              AND (
                  (invitation.revoked_at IS NULL AND invitation.consumed_at IS NULL)
                  OR EXISTS (
                      SELECT 1 FROM \"OrganizationInvitation\" legacy_invite
                      JOIN \"OrganizationEmailMatches\" domain
                        ON domain.\"organizationId\" = legacy_invite.organization_id
                       AND domain.email = split_part(invitation.corporate_email, '@', 2)
                      WHERE legacy_invite.organization_id = invitation.organization_id
                        AND legacy_invite.email = invitation.corporate_email
                  )
              )
        ) OR EXISTS (
            SELECT 1 FROM corporate_mailbox_provision_intent
            WHERE corporate_email = $1 AND state <> 'READY'
        )",
    )
    .bind(email)
    .fetch_one(db)
    .await
}

/// Ordinary passwordless login remains blocked for a reserved identity until
/// its owner-bound mailbox intent reaches READY. Revoking or reissuing an
/// invitation cannot release the gate; another identity with the same email
/// is unaffected.
pub async fn mailbox_login_pending(
    db: &sqlx::Pool<sqlx::Postgres>,
    email: &str,
    fusionauth_user_id: &str,
) -> Result<bool, sqlx::Error> {
    let Ok(fusionauth_user_id) = uuid::Uuid::parse_str(fusionauth_user_id) else {
        return Ok(false);
    };
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
            SELECT 1 FROM corporate_activation_invitation invitation
            WHERE invitation.id = $2 AND invitation.corporate_email = $1
              AND NOT EXISTS (
                SELECT 1 FROM corporate_mailbox_provision_intent ready_intent
                WHERE ready_intent.idempotency_key = invitation.id
                  AND ready_intent.fusionauth_user_id = $2
                  AND ready_intent.corporate_email = $1
                  AND ready_intent.state = 'READY'
              )
        ) OR EXISTS (
            SELECT 1 FROM corporate_mailbox_provision_intent
            WHERE fusionauth_user_id = $2 AND corporate_email = $1 AND state <> 'READY'
        )",
    )
    .bind(email)
    .bind(fusionauth_user_id)
    .fetch_one(db)
    .await
}

async fn signup_organization(
    db: &sqlx::Pool<sqlx::Postgres>,
    email: &str,
) -> anyhow::Result<(Option<i32>, HashSet<String>)> {
    // Only an explicit invite or pending mailbox intent opts into activation.
    // Legacy OrganizationEmailMatches entries retain their existing auto-join behavior.
    let organization_id = if requires_activation(db, email).await? {
        None
    } else {
        match_user_to_organization(db, email).await?
    };
    let roles = match organization_id {
        Some(id) => get_organization_roles_for_user(db, id, email).await?,
        None => ["self_serve".to_string()].into_iter().collect(),
    };
    Ok((organization_id, roles))
}

/// Creates a new user
/// This is a fairly involved process and as such will be well documented and broken up into
/// multiple easy-to-follow functions
///
/// Returns the (user_id, Option<organization_id>)
#[tracing::instrument(skip(db, stripe_client))]
pub async fn create_user(
    fusionauth_user_id: &str,
    username: &str,
    email: &str,
    is_verified: bool,
    db: &sqlx::Pool<sqlx::Postgres>,
    stripe_client: &stripe::Client,
) -> anyhow::Result<(String, Option<i32>)> {
    let stripe_customer_id = if is_local_stripe_stub() {
        // Local mode uses a stub key; don't call Stripe (it would 401 and
        // abort the transactional user.create webhook, blocking all signups).
        local_stripe_customer_id(email)
    } else {
        // NOTE: stripe adds in ~400ms of latency to this request. We may want to update our
        // requirement that each customer exists in stripe and create stripe customers as needed.
        let stripe_customer = create_stripe_user(email, fusionauth_user_id, stripe_client).await?;
        tracing::trace!(stripe_customer_id=?stripe_customer.id.to_string(), "created stripe customer");
        stripe_customer.id.to_string()
    };

    let (organization_id, roles) = signup_organization(db, email).await?;

    tracing::trace!(roles=?roles, "got roles for user");

    // Create user in macrodb
    let user_id = macro_db_client::user::create_user::create_user(
        db,
        fusionauth_user_id,
        username,
        email,
        is_verified,
        &stripe_customer_id,
        organization_id,
        roles,
    )
    .await?;
    if organization_id.is_some() {
        macro_db_client::organization::delete_organization_invitation(db.clone(), email).await?;
    }
    tracing::trace!("created user in macrodb");

    Ok((user_id, organization_id))
}

/// Stripe deduplicates webhook retries by the immutable FusionAuth identity.
/// This does not turn an unauthenticated domain match into a corporate grant.
#[tracing::instrument(skip(stripe_client))]
pub async fn create_stripe_user(
    email: &str,
    fusionauth_user_id: &str,
    stripe_client: &stripe::Client,
) -> anyhow::Result<stripe::Customer> {
    let idempotent_client =
        stripe_client
            .clone()
            .with_strategy(stripe::RequestStrategy::Idempotent(format!(
                "macro-user-create-{fusionauth_user_id}"
            )));
    Ok(stripe::Customer::create(
        &idempotent_client,
        stripe::CreateCustomer {
            email: Some(email),
            ..Default::default()
        },
    )
    .await?)
}

#[tracing::instrument(skip(db))]
pub async fn create_user_profile(
    fusionauth_user_id: &str,
    email: &str,
    db: &sqlx::Pool<sqlx::Postgres>,
) -> anyhow::Result<()> {
    let (organization_id, roles) = signup_organization(db, email).await?;

    tracing::trace!(roles=?roles, "got roles for user");

    // Create user in macrodb
    macro_db_client::user::create_user::create_user_profile(
        db,
        fusionauth_user_id,
        email,
        organization_id,
        roles,
    )
    .await?;
    if organization_id.is_some() {
        macro_db_client::organization::delete_organization_invitation(db.clone(), email).await?;
    }
    tracing::trace!("created user in macrodb");

    Ok(())
}
