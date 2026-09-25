use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use cookie::{Cookie, SameSite};
use fusionauth::error::FusionAuthClientError;
use macro_authorization::{MacroAuthorizationExtractor, UserOnly};
use macro_user_id::email::EmailStr;
use rand::random;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, Postgres, Transaction};
use tower_cookies::Cookies;
use uuid::Uuid;

use crate::{
    api::context::{ApiContext, AuthorizationService},
    generate_password::generate_random_password,
};

const SESSION_COOKIE: &str = "corporate-activation-session";

#[derive(Deserialize)]
pub struct IssueRequest {
    corporate_email: String,
    organization_id: i32,
}

#[derive(Serialize)]
pub struct IssueResponse {
    invite_id: Uuid,
    code_once: String,
    expires_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct RevokeRequest {
    invite_id: Uuid,
}

#[derive(Deserialize)]
pub struct VerifyRequest {
    invite_id: Uuid,
    corporate_email: String,
    code: String,
}

#[derive(Deserialize)]
pub struct CompleteRequest {
    invite_id: Uuid,
}

#[derive(Serialize)]
struct CompleteResponse {
    identity_state: &'static str,
    mailbox_state: &'static str,
}

#[derive(FromRow)]
struct Invitation {
    corporate_email: String,
    organization_id: i32,
    code_hash: Vec<u8>,
    expires_at: DateTime<Utc>,
    attempts: i32,
    session_hash: Option<Vec<u8>>,
    session_expires_at: Option<DateTime<Utc>>,
    claimed_at: Option<DateTime<Utc>>,
    consumed_at: Option<DateTime<Utc>>,
    revoked_at: Option<DateTime<Utc>>,
}

fn hash(value: &str) -> Vec<u8> {
    Sha256::digest(value.as_bytes()).to_vec()
}

fn secret() -> String {
    URL_SAFE_NO_PAD.encode(random::<[u8; 32]>())
}

fn canonical_email(email: &str) -> bool {
    email == email.to_lowercase() && EmailStr::parse_from_str(email).is_ok()
}

fn failure(status: StatusCode) -> Response {
    status.into_response()
}

fn session_hash(cookies: &Cookies) -> Result<Vec<u8>, Response> {
    let value = cookies
        .get(SESSION_COOKIE)
        .ok_or_else(|| failure(StatusCode::UNAUTHORIZED))?;
    if value.value().len() != 43
        || URL_SAFE_NO_PAD
            .decode(value.value())
            .map_or(true, |bytes| bytes.len() != 32)
    {
        return Err(failure(StatusCode::UNAUTHORIZED));
    }
    Ok(hash(value.value()))
}

async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    action: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO corporate_activation_audit (invitation_id, action) VALUES ($1, $2)")
        .bind(id)
        .bind(action)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

/// Only an authenticated IT administrator of the owning organization can issue
/// an existing, exact corporate invitation for out-of-band delivery. No SMTP.
#[tracing::instrument(skip(ctx, authorization, request))]
pub async fn issue(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOnly>,
    Json(request): Json<IssueRequest>,
) -> Response {
    if !canonical_email(&request.corporate_email) || request.organization_id <= 0 {
        return failure(StatusCode::BAD_REQUEST);
    }
    let invite_id = Uuid::new_v4();
    let code_once = secret();
    let expires_at = Utc::now() + chrono::Duration::minutes(30);
    match insert_invitation(
        &ctx.db,
        authorization.authorization.macro_user_id.as_ref(),
        &request,
        invite_id,
        &code_once,
        expires_at,
    )
    .await
    {
        Ok(true) => (
            StatusCode::CREATED,
            Json(IssueResponse {
                invite_id,
                code_once,
                expires_at,
            }),
        )
            .into_response(),
        Ok(false) => failure(StatusCode::FORBIDDEN),
        Err(error)
            if error
                .as_database_error()
                .is_some_and(|db| db.is_unique_violation()) =>
        {
            failure(StatusCode::CONFLICT)
        }
        Err(error) => {
            tracing::error!(?error, "activation issue failed");
            failure(StatusCode::SERVICE_UNAVAILABLE)
        }
    }
}

async fn insert_invitation(
    db: &sqlx::PgPool,
    issuer: &str,
    request: &IssueRequest,
    invite_id: Uuid,
    code: &str,
    expires_at: DateTime<Utc>,
) -> Result<bool, sqlx::Error> {
    let mut tx = db.begin().await?;
    let inserted = sqlx::query(
        "INSERT INTO corporate_activation_invitation (id, corporate_email, organization_id, code_hash, expires_at)
         SELECT $1, $2, oi.organization_id, $4, $5
         FROM \"OrganizationInvitation\" oi
         JOIN \"OrganizationEmailMatches\" domain ON domain.\"organizationId\" = oi.organization_id AND domain.email = split_part($2, '@', 2)
         JOIN \"OrganizationIT\" administrator ON administrator.\"organizationId\" = oi.organization_id
         JOIN \"User\" issuer ON issuer.email = administrator.email AND issuer.\"organizationId\" = oi.organization_id
         WHERE oi.organization_id = $3 AND oi.email = $2 AND issuer.id = $6
           AND NOT EXISTS (SELECT 1 FROM \"User\" WHERE email = $2)
           AND NOT EXISTS (SELECT 1 FROM corporate_activation_invitation WHERE corporate_email = $2)
         ON CONFLICT DO NOTHING"
    ).bind(invite_id).bind(&request.corporate_email).bind(request.organization_id)
        .bind(hash(code)).bind(expires_at).bind(issuer).execute(&mut *tx).await?;
    if inserted.rows_affected() != 1 {
        return Ok(false);
    }
    audit(&mut tx, invite_id, "issued").await?;
    tx.commit().await?;
    Ok(true)
}

/// An organization IT administrator can cancel an unconsumed invitation even
/// after a browser claimed its code. A competing completion sees revocation.
#[tracing::instrument(skip(ctx, authorization, request))]
pub async fn revoke(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOnly>,
    Json(request): Json<RevokeRequest>,
) -> Response {
    match revoke_invitation(
        &ctx.db,
        authorization.authorization.macro_user_id.as_ref(),
        request.invite_id,
    )
    .await
    {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => failure(StatusCode::CONFLICT),
        Err(error) => {
            tracing::error!(?error, "activation revoke failed");
            failure(StatusCode::SERVICE_UNAVAILABLE)
        }
    }
}

async fn revoke_invitation(
    db: &sqlx::PgPool,
    issuer: &str,
    invite_id: Uuid,
) -> Result<bool, sqlx::Error> {
    let mut tx = db.begin().await?;
    let updated = sqlx::query(
        "UPDATE corporate_activation_invitation invitation SET revoked_at = now()
         WHERE invitation.id = $1 AND invitation.revoked_at IS NULL AND invitation.consumed_at IS NULL
           AND EXISTS (SELECT 1 FROM \"OrganizationIT\" administrator
             JOIN \"User\" issuer ON issuer.email = administrator.email AND issuer.\"organizationId\" = administrator.\"organizationId\"
             WHERE administrator.\"organizationId\" = invitation.organization_id AND issuer.id = $2)"
    ).bind(invite_id).bind(issuer).execute(&mut *tx).await?;
    if updated.rows_affected() != 1 {
        return Ok(false);
    }
    audit(&mut tx, invite_id, "revoked").await?;
    tx.commit().await?;
    Ok(true)
}

/// A lost final response or provider outage does not strand the reserved
/// identity. Reissue rotates the proof for the same invitation/user ID only.
#[tracing::instrument(skip(ctx, authorization, request))]
pub async fn reissue(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOnly>,
    Json(request): Json<RevokeRequest>,
) -> Response {
    let code_once = secret();
    let expires_at = Utc::now() + chrono::Duration::minutes(30);
    match reissue_invitation(
        &ctx.db,
        authorization.authorization.macro_user_id.as_ref(),
        request.invite_id,
        &code_once,
        expires_at,
    )
    .await
    {
        Ok(true) => (
            StatusCode::OK,
            Json(IssueResponse {
                invite_id: request.invite_id,
                code_once,
                expires_at,
            }),
        )
            .into_response(),
        Ok(false) => failure(StatusCode::CONFLICT),
        Err(error) => {
            tracing::error!(?error, "activation reissue failed");
            failure(StatusCode::SERVICE_UNAVAILABLE)
        }
    }
}

async fn reissue_invitation(
    db: &sqlx::PgPool,
    issuer: &str,
    invite_id: Uuid,
    code: &str,
    expires_at: DateTime<Utc>,
) -> Result<bool, sqlx::Error> {
    let mut tx = db.begin().await?;
    let updated = sqlx::query(
        "UPDATE corporate_activation_invitation invitation
         SET code_hash = $3, expires_at = $4, attempts = 0,
             session_hash = NULL, session_expires_at = NULL, claimed_at = NULL, revoked_at = NULL
         WHERE invitation.id = $1
           AND (invitation.revoked_at IS NOT NULL OR invitation.expires_at <= now()
             OR invitation.session_expires_at <= now() OR invitation.attempts >= 5)
           AND (invitation.consumed_at IS NULL OR EXISTS (
             SELECT 1 FROM \"User\" owner WHERE owner.id = ('macro|' || invitation.corporate_email)
               AND owner.email = invitation.corporate_email AND owner.macro_user_id = invitation.id
               AND owner.\"organizationId\" = invitation.organization_id))
           AND EXISTS (SELECT 1 FROM \"OrganizationIT\" administrator
             JOIN \"User\" issuer ON issuer.email = administrator.email AND issuer.\"organizationId\" = administrator.\"organizationId\"
             WHERE administrator.\"organizationId\" = invitation.organization_id AND issuer.id = $2)"
    ).bind(invite_id).bind(issuer).bind(hash(code)).bind(expires_at).execute(&mut *tx).await?;
    if updated.rows_affected() != 1 {
        return Ok(false);
    }
    audit(&mut tx, invite_id, "reissued").await?;
    tx.commit().await?;
    Ok(true)
}

/// Allocate a browser-bound activation session, not a FusionAuth session.
/// Possession of this cookie alone does not grant any identity or entitlement.
#[tracing::instrument(skip(cookies))]
pub async fn start(cookies: Cookies) -> Response {
    let mut cookie = Cookie::new(SESSION_COOKIE, secret());
    cookie.set_http_only(true);
    cookie.set_secure(true);
    cookie.set_same_site(SameSite::Strict);
    cookie.set_path("/");
    cookie.set_max_age(time::Duration::minutes(10));
    cookies.add(cookie);
    StatusCode::NO_CONTENT.into_response()
}

/// Code possession authenticates this activation session, with a row lock for
/// attempts, revocation, expiration and one-session ownership. No user is made.
#[tracing::instrument(skip(ctx, cookies, request))]
pub async fn verify(
    State(ctx): State<ApiContext>,
    cookies: Cookies,
    Json(request): Json<VerifyRequest>,
) -> Response {
    let Ok(session) = session_hash(&cookies) else {
        return failure(StatusCode::UNAUTHORIZED);
    };
    match verify_invitation(&ctx.db, &request, &session).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => failure(StatusCode::UNAUTHORIZED),
        Err(error) => {
            tracing::error!(?error, "activation verification failed");
            failure(StatusCode::SERVICE_UNAVAILABLE)
        }
    }
}

async fn verify_invitation(
    db: &sqlx::PgPool,
    request: &VerifyRequest,
    session: &[u8],
) -> Result<bool, sqlx::Error> {
    let mut tx = db.begin().await?;
    let invitation = sqlx::query_as::<_, Invitation>("SELECT corporate_email, organization_id, code_hash, expires_at, attempts, session_hash, session_expires_at, claimed_at, consumed_at, revoked_at FROM corporate_activation_invitation WHERE id = $1 FOR UPDATE")
        .bind(request.invite_id).fetch_optional(&mut *tx).await?;
    let Some(invitation) = invitation else {
        return Ok(false);
    };
    if invitation.revoked_at.is_some()
        || invitation.expires_at <= Utc::now()
        || invitation.attempts >= 5
        || invitation.session_hash.is_some()
    {
        return Ok(false);
    }
    if !canonical_email(&request.corporate_email)
        || invitation.corporate_email != request.corporate_email
        || invitation.code_hash != hash(&request.code)
    {
        sqlx::query(
            "UPDATE corporate_activation_invitation SET attempts = attempts + 1 WHERE id = $1",
        )
        .bind(request.invite_id)
        .execute(&mut *tx)
        .await?;
        audit(&mut tx, request.invite_id, "failed_attempt").await?;
        tx.commit().await?;
        return Ok(false);
    }
    sqlx::query("UPDATE corporate_activation_invitation SET session_hash = $2, session_expires_at = now() + interval '10 minutes', claimed_at = now() WHERE id = $1")
        .bind(request.invite_id).bind(session).execute(&mut *tx).await?;
    audit(&mut tx, request.invite_id, "verified").await?;
    tx.commit().await?;
    Ok(true)
}

/// Corporate webhooks are accepted only for the exact identity reserved by
/// a previously code-authenticated activation session. Domain alone is never proof.
pub async fn webhook_may_create(db: &sqlx::PgPool, id: &str, email: &str) -> anyhow::Result<bool> {
    let corporate =
        authentication_service::service::user::create_user::requires_activation(db, email).await?;
    if !corporate {
        return Ok(true);
    }
    let Ok(id) = Uuid::parse_str(id) else {
        return Ok(false);
    };
    Ok(sqlx::query_scalar::<_, bool>("SELECT EXISTS (SELECT 1 FROM corporate_activation_invitation WHERE id = $1 AND corporate_email = $2 AND claimed_at IS NOT NULL AND revoked_at IS NULL AND consumed_at IS NULL AND session_expires_at > now())")
        .bind(id).bind(email).fetch_one(db).await?)
}

/// The row lock serializes parallel completes; all entitlement and mailbox
/// intent writes commit together, never after an external provider call.
async fn consume_invitation(
    db: &sqlx::PgPool,
    invite_id: Uuid,
    session: &[u8],
) -> Result<bool, sqlx::Error> {
    let mut tx = db.begin().await?;
    let locked = sqlx::query_as::<_, Invitation>("SELECT corporate_email, organization_id, code_hash, expires_at, attempts, session_hash, session_expires_at, claimed_at, consumed_at, revoked_at FROM corporate_activation_invitation WHERE id = $1 FOR UPDATE")
        .bind(invite_id).fetch_optional(&mut *tx).await?;
    let Some(locked) = locked else {
        return Ok(false);
    };
    if locked.session_hash.as_deref() != Some(session)
        || locked.revoked_at.is_some()
        || locked
            .session_expires_at
            .is_none_or(|expiry| expiry <= Utc::now())
    {
        return Ok(false);
    }
    if locked.consumed_at.is_some() {
        return sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (SELECT 1 FROM \"User\" WHERE id = ('macro|' || $1) AND email = $1 AND macro_user_id = $2 AND \"organizationId\" = $3)"
        ).bind(&locked.corporate_email).bind(invite_id).bind(locked.organization_id)
            .fetch_one(&mut *tx).await;
    }
    let owner = sqlx::query_scalar::<_, bool>("SELECT EXISTS (SELECT 1 FROM \"User\" WHERE id = ('macro|' || $1) AND email = $1 AND macro_user_id = $2)")
        .bind(&locked.corporate_email).bind(invite_id).fetch_one(&mut *tx).await?;
    if !owner {
        return Ok(false);
    }
    let updated = sqlx::query("UPDATE \"User\" SET \"organizationId\" = $2 WHERE id = ('macro|' || $1) AND macro_user_id = $3 AND \"organizationId\" IS NULL")
        .bind(&locked.corporate_email).bind(locked.organization_id).bind(invite_id)
        .execute(&mut *tx).await?;
    if updated.rows_affected() != 1 {
        return Ok(false);
    }
    sqlx::query("DELETE FROM \"RolesOnUsers\" WHERE \"userId\" = ('macro|' || $1) AND \"roleId\" = 'self_serve'")
        .bind(&locked.corporate_email).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO \"RolesOnUsers\" (\"userId\", \"roleId\") SELECT 'macro|' || $1, \"roleId\" FROM \"RolesOnOrganizations\" WHERE \"organizationId\" = $2 ON CONFLICT DO NOTHING")
        .bind(&locked.corporate_email).bind(locked.organization_id).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO \"RolesOnUsers\" (\"userId\", \"roleId\") SELECT 'macro|' || $1, 'organization_it' FROM \"OrganizationIT\" WHERE email = $1 AND \"organizationId\" = $2 ON CONFLICT DO NOTHING")
        .bind(&locked.corporate_email).bind(locked.organization_id).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO \"RolesOnUsers\" (\"userId\", \"roleId\") SELECT 'macro|' || $1, 'manage_organization_subscription' FROM \"OrganizationBilling\" WHERE email = $1 AND \"organizationId\" = $2 ON CONFLICT DO NOTHING")
        .bind(&locked.corporate_email).bind(locked.organization_id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM \"OrganizationInvitation\" WHERE email = $1 AND organization_id = $2")
        .bind(&locked.corporate_email)
        .bind(locked.organization_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO corporate_mailbox_provision_intent (idempotency_key, fusionauth_user_id, corporate_email) VALUES ($1, $1, $2)")
        .bind(invite_id).bind(&locked.corporate_email).execute(&mut *tx).await?;
    sqlx::query("UPDATE corporate_activation_invitation SET consumed_at = now() WHERE id = $1")
        .bind(invite_id)
        .execute(&mut *tx)
        .await?;
    audit(&mut tx, invite_id, "activated").await?;
    tx.commit().await?;
    Ok(true)
}

/// Complete the authenticated ceremony without SMTP. The provider cannot be
/// called yet: the single pending intent is committed with the entitlement.
#[tracing::instrument(skip(ctx, cookies, request, ip_context))]
pub async fn complete(
    State(ctx): State<ApiContext>,
    cookies: Cookies,
    ip_context: macro_middleware::tracking::ClientIp,
    Json(request): Json<CompleteRequest>,
) -> Response {
    let Ok(session) = session_hash(&cookies) else {
        return failure(StatusCode::UNAUTHORIZED);
    };
    let invitation = sqlx::query_as::<_, Invitation>("SELECT corporate_email, organization_id, code_hash, expires_at, attempts, session_hash, session_expires_at, claimed_at, consumed_at, revoked_at FROM corporate_activation_invitation WHERE id = $1")
        .bind(request.invite_id).fetch_optional(&ctx.db).await;
    let invitation = match invitation {
        Ok(Some(value))
            if value.session_hash.as_deref() == Some(session.as_slice())
                && value.claimed_at.is_some()
                && value.revoked_at.is_none()
                && value
                    .session_expires_at
                    .is_some_and(|expiry| expiry > Utc::now()) =>
        {
            value
        }
        Ok(_) => return failure(StatusCode::UNAUTHORIZED),
        Err(error) => {
            tracing::error!(?error, "activation lookup failed");
            return failure(StatusCode::SERVICE_UNAVAILABLE);
        }
    };
    let auth_id = request.invite_id.to_string();
    if invitation.consumed_at.is_none() {
        match ctx
            .auth_client
            .create_user_with_id(
                &auth_id,
                fusionauth::user::create::User {
                    email: invitation.corporate_email.as_str().into(),
                    password: generate_random_password().into(),
                    username: None,
                },
                true,
                ip_context.origin_ip(),
            )
            .await
        {
            Ok(created) if created == auth_id => {}
            Err(FusionAuthClientError::UserAlreadyExists) => {
                match ctx
                    .auth_client
                    .get_user_id_by_email(&invitation.corporate_email)
                    .await
                {
                    Ok(existing) if existing == auth_id => {}
                    _ => return failure(StatusCode::CONFLICT),
                }
            }
            Ok(_) => return failure(StatusCode::CONFLICT),
            Err(error) => {
                tracing::error!(?error, "corporate identity creation failed");
                return failure(StatusCode::SERVICE_UNAVAILABLE);
            }
        }
    }
    match consume_invitation(&ctx.db, request.invite_id, &session).await {
        Ok(true) => {}
        Ok(false) => return failure(StatusCode::CONFLICT),
        Err(error) => {
            tracing::error!(?error, "activation transaction failed");
            return failure(StatusCode::SERVICE_UNAVAILABLE);
        }
    }
    (
        StatusCode::ACCEPTED,
        Json(CompleteResponse {
            identity_state: "ACTIVE",
            mailbox_state: "PENDING_PROVIDER",
        }),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use macro_db_migrator::MACRO_DB_MIGRATIONS;

    async fn invitation(db: &sqlx::PgPool, email: &str, code: &str) -> anyhow::Result<Uuid> {
        let org_id: i32 = sqlx::query_scalar(
            "INSERT INTO \"Organization\" (name) VALUES ('Activation test') RETURNING id",
        )
        .fetch_one(db)
        .await?;
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO corporate_activation_invitation (id, corporate_email, organization_id, code_hash, expires_at) VALUES ($1, $2, $3, $4, now() + interval '30 minutes')")
            .bind(id).bind(email).bind(org_id).bind(hash(code)).execute(db).await?;
        Ok(id)
    }

    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn parallel_proof_only_binds_one_session_and_replay_is_denied(
        db: sqlx::PgPool,
    ) -> anyhow::Result<()> {
        let id = invitation(&db, "worker@company.test", "secret").await?;
        let request = VerifyRequest {
            invite_id: id,
            corporate_email: "worker@company.test".into(),
            code: "secret".into(),
        };
        let (a, b) = tokio::join!(
            verify_invitation(&db, &request, b"session-a"),
            verify_invitation(&db, &request, b"session-b")
        );
        assert_ne!(a?, b?);
        assert!(!verify_invitation(&db, &request, b"session-a").await?);
        let row: (i64, i64) = sqlx::query_as(
            "SELECT (SELECT count(*) FROM corporate_activation_audit WHERE invitation_id = $1 AND action = 'verified'), (SELECT count(*) FROM corporate_mailbox_provision_intent WHERE idempotency_key = $1)"
        ).bind(id).fetch_one(&db).await?;
        assert_eq!(row, (1, 0));
        Ok(())
    }

    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn wrong_recipient_expired_and_revoked_cannot_bind_or_create_mailbox(
        db: sqlx::PgPool,
    ) -> anyhow::Result<()> {
        let id = invitation(&db, "worker@company.test", "secret").await?;
        let wrong = VerifyRequest {
            invite_id: id,
            corporate_email: "other@company.test".into(),
            code: "secret".into(),
        };
        assert!(!verify_invitation(&db, &wrong, b"session").await?);
        let attempts: i32 = sqlx::query_scalar(
            "SELECT attempts FROM corporate_activation_invitation WHERE id = $1",
        )
        .bind(id)
        .fetch_one(&db)
        .await?;
        assert_eq!(attempts, 1);
        let correct = VerifyRequest {
            invite_id: id,
            corporate_email: "worker@company.test".into(),
            code: "secret".into(),
        };
        sqlx::query("UPDATE corporate_activation_invitation SET expires_at = now() - interval '1 minute' WHERE id = $1")
            .bind(id).execute(&db).await?;
        assert!(!verify_invitation(&db, &correct, b"session").await?);
        sqlx::query("UPDATE corporate_activation_invitation SET expires_at = now() + interval '1 minute', revoked_at = now() WHERE id = $1")
            .bind(id).execute(&db).await?;
        assert!(!verify_invitation(&db, &correct, b"session").await?);
        let rows: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM corporate_mailbox_provision_intent WHERE idempotency_key = $1",
        )
        .bind(id)
        .fetch_one(&db)
        .await?;
        assert_eq!(rows, 0);
        Ok(())
    }

    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn parallel_completion_grants_one_owner_and_one_pending_intent(
        db: sqlx::PgPool,
    ) -> anyhow::Result<()> {
        let email = "worker@company.test";
        let id = invitation(&db, email, "secret").await?;
        let request = VerifyRequest {
            invite_id: id,
            corporate_email: email.into(),
            code: "secret".into(),
        };
        let session = b"bound-session";
        assert!(verify_invitation(&db, &request, session).await?);
        assert!(!consume_invitation(&db, id, b"other-session").await?);
        sqlx::query("INSERT INTO macro_user (id, username, email, stripe_customer_id) VALUES ($1, $2, $2, $3)")
            .bind(id).bind(email).bind(format!("local-stripe-customer-{email}")).execute(&db).await?;
        sqlx::query("INSERT INTO \"User\" (id, email, macro_user_id) VALUES ($1, $2, $3)")
            .bind(format!("macro|{email}"))
            .bind(email)
            .bind(id)
            .execute(&db)
            .await?;
        sqlx::query(
            "INSERT INTO \"RolesOnUsers\" (\"userId\", \"roleId\") VALUES ($1, 'self_serve')",
        )
        .bind(format!("macro|{email}"))
        .execute(&db)
        .await?;
        sqlx::query("INSERT INTO \"Role\" (id, description) VALUES ('activation_test_role', 'Activation test')")
            .execute(&db).await?;
        sqlx::query("INSERT INTO \"RolesOnOrganizations\" (\"organizationId\", \"roleId\") SELECT organization_id, 'activation_test_role' FROM corporate_activation_invitation WHERE id = $1")
            .bind(id).execute(&db).await?;
        let (a, b) = tokio::join!(
            consume_invitation(&db, id, session),
            consume_invitation(&db, id, session)
        );
        assert!(a? && b?);
        let state: (i64, i64, i64, i64, i64) = sqlx::query_as(
            "SELECT (SELECT count(*) FROM corporate_mailbox_provision_intent WHERE idempotency_key = $1 AND state = 'PENDING_PROVIDER'), (SELECT count(*) FROM \"User\" WHERE email = $2 AND \"organizationId\" IS NOT NULL), (SELECT count(*) FROM \"RolesOnUsers\" WHERE \"userId\" = ('macro|' || $2) AND \"roleId\" = 'activation_test_role'), (SELECT count(*) FROM corporate_activation_audit WHERE invitation_id = $1 AND action = 'activated'), (SELECT count(*) FROM \"RolesOnUsers\" WHERE \"userId\" = ('macro|' || $2) AND \"roleId\" = 'self_serve')"
        ).bind(id).bind(email).fetch_one(&db).await?;
        assert_eq!(state, (1, 1, 1, 1, 0));
        Ok(())
    }

    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn fifth_invalid_code_exhausts_invitation_without_identity(
        db: sqlx::PgPool,
    ) -> anyhow::Result<()> {
        let id = invitation(&db, "worker@company.test", "correct-code").await?;
        let mut request = VerifyRequest {
            invite_id: id,
            corporate_email: "worker@company.test".into(),
            code: "wrong-code".into(),
        };
        for _ in 0..5 {
            assert!(!verify_invitation(&db, &request, b"session").await?);
        }
        request.code = "correct-code".into();
        assert!(!verify_invitation(&db, &request, b"session").await?);
        let state: (i32, bool, i64) = sqlx::query_as(
            "SELECT attempts, session_hash IS NULL, (SELECT count(*) FROM corporate_mailbox_provision_intent WHERE idempotency_key = $1) FROM corporate_activation_invitation WHERE id = $1"
        ).bind(id).fetch_one(&db).await?;
        assert_eq!(state, (5, true, 0));
        Ok(())
    }
    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn personal_mail_invite_and_legacy_org_domain_keep_legacy_login(
        db: sqlx::PgPool,
    ) -> anyhow::Result<()> {
        let org_id: i32 = sqlx::query_scalar(
            "INSERT INTO \"Organization\" (name) VALUES ('Legacy invitation test') RETURNING id",
        )
        .fetch_one(&db)
        .await?;
        sqlx::query("INSERT INTO \"OrganizationEmailMatches\" (\"organizationId\", email) VALUES ($1, 'person@gmail.com'), ($1, 'company.test')")
            .bind(org_id).execute(&db).await?;
        assert!(
            !authentication_service::service::user::create_user::requires_activation(
                &db,
                "person@gmail.com"
            )
            .await?
        );
        assert!(webhook_may_create(&db, "ordinary-id", "person@gmail.com").await?);
        assert!(
            !authentication_service::service::user::create_user::requires_activation(
                &db,
                "employee@company.test"
            )
            .await?
        );
        assert!(webhook_may_create(&db, "ordinary-id", "employee@company.test").await?);
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO corporate_activation_invitation (id, corporate_email, organization_id, code_hash, expires_at) VALUES ($1, 'person@gmail.com', $2, $3, now() + interval '30 minutes')")
            .bind(id).bind(org_id).bind(hash("proof")).execute(&db).await?;
        assert!(
            authentication_service::service::user::create_user::requires_activation(
                &db,
                "person@gmail.com"
            )
            .await?
        );
        sqlx::query("UPDATE corporate_activation_invitation SET revoked_at = now() WHERE id = $1")
            .bind(id)
            .execute(&db)
            .await?;
        assert!(
            !authentication_service::service::user::create_user::requires_activation(
                &db,
                "person@gmail.com"
            )
            .await?
        );
        assert!(webhook_may_create(&db, "ordinary-id", "person@gmail.com").await?);
        Ok(())
    }
    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn only_inviting_org_it_can_issue_or_cancel_a_claim(
        db: sqlx::PgPool,
    ) -> anyhow::Result<()> {
        let org: i32 = sqlx::query_scalar(
            "INSERT INTO \"Organization\" (name) VALUES ('Protected org') RETURNING id",
        )
        .fetch_one(&db)
        .await?;
        let foreign_org: i32 = sqlx::query_scalar(
            "INSERT INTO \"Organization\" (name) VALUES ('Other org') RETURNING id",
        )
        .fetch_one(&db)
        .await?;
        sqlx::query("INSERT INTO \"OrganizationEmailMatches\" (\"organizationId\", email) VALUES ($1, 'company.test')")
            .bind(org).execute(&db).await?;
        sqlx::query("INSERT INTO \"OrganizationInvitation\" (organization_id, email) VALUES ($1, 'worker@company.test')")
            .bind(org).execute(&db).await?;
        sqlx::query("INSERT INTO \"OrganizationIT\" (\"organizationId\", email) VALUES ($1, 'admin@company.test')")
            .bind(org).execute(&db).await?;
        for email in ["admin@company.test", "outsider@company.test"] {
            let id = Uuid::new_v4();
            sqlx::query("INSERT INTO macro_user (id, username, email, stripe_customer_id) VALUES ($1, $2, $2, $3)")
                .bind(id).bind(email).bind(format!("customer-{id}")).execute(&db).await?;
            sqlx::query("INSERT INTO \"User\" (id, email, \"organizationId\", macro_user_id) VALUES ($1, $2, $3, $4)")
                .bind(format!("macro|{email}")).bind(email).bind(org).bind(id).execute(&db).await?;
        }
        let request = IssueRequest {
            corporate_email: "worker@company.test".into(),
            organization_id: org,
        };
        let expiration = Utc::now() + chrono::Duration::minutes(30);
        assert!(
            !insert_invitation(
                &db,
                "macro|outsider@company.test",
                &request,
                Uuid::new_v4(),
                "proof",
                expiration
            )
            .await?
        );
        let wrong_org = IssueRequest {
            corporate_email: request.corporate_email.clone(),
            organization_id: foreign_org,
        };
        assert!(
            !insert_invitation(
                &db,
                "macro|admin@company.test",
                &wrong_org,
                Uuid::new_v4(),
                "proof",
                expiration
            )
            .await?
        );
        let not_invited = IssueRequest {
            corporate_email: "other@company.test".into(),
            organization_id: org,
        };
        assert!(
            !insert_invitation(
                &db,
                "macro|admin@company.test",
                &not_invited,
                Uuid::new_v4(),
                "proof",
                expiration
            )
            .await?
        );
        let id = Uuid::new_v4();
        assert!(
            insert_invitation(
                &db,
                "macro|admin@company.test",
                &request,
                id,
                "private-proof",
                expiration
            )
            .await?
        );
        assert!(
            !insert_invitation(
                &db,
                "macro|admin@company.test",
                &request,
                Uuid::new_v4(),
                "proof",
                expiration
            )
            .await?
        );
        let proof = VerifyRequest {
            invite_id: id,
            corporate_email: request.corporate_email.clone(),
            code: "private-proof".into(),
        };
        assert!(verify_invitation(&db, &proof, b"claimed-browser").await?);
        assert!(!revoke_invitation(&db, "macro|outsider@company.test", id).await?);
        assert!(revoke_invitation(&db, "macro|admin@company.test", id).await?);
        assert!(!consume_invitation(&db, id, b"claimed-browser").await?);
        assert!(!webhook_may_create(&db, &id.to_string(), &request.corporate_email).await?);
        let grants: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM corporate_mailbox_provision_intent WHERE idempotency_key = $1",
        )
        .bind(id)
        .fetch_one(&db)
        .await?;
        assert_eq!(grants, 0);
        Ok(())
    }
    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn expired_session_recovers_the_same_owner_without_second_grant(
        db: sqlx::PgPool,
    ) -> anyhow::Result<()> {
        let email = "worker@company.test";
        let id = invitation(&db, email, "initial-proof").await?;
        let org: i32 = sqlx::query_scalar(
            "SELECT organization_id FROM corporate_activation_invitation WHERE id = $1",
        )
        .bind(id)
        .fetch_one(&db)
        .await?;
        let administrator_id = Uuid::new_v4();
        sqlx::query("INSERT INTO macro_user (id, username, email, stripe_customer_id) VALUES ($1, 'admin@company.test', 'admin@company.test', $2), ($3, $4, $4, $5)")
            .bind(administrator_id).bind(format!("customer-{administrator_id}"))
            .bind(id).bind(email).bind(format!("customer-{id}")).execute(&db).await?;
        sqlx::query("INSERT INTO \"User\" (id, email, \"organizationId\", macro_user_id) VALUES ('macro|admin@company.test', 'admin@company.test', $1, $2), ($3, $4, NULL, $5)")
            .bind(org).bind(administrator_id).bind(format!("macro|{email}")).bind(email).bind(id).execute(&db).await?;
        sqlx::query("INSERT INTO \"OrganizationIT\" (\"organizationId\", email) VALUES ($1, 'admin@company.test')")
            .bind(org).execute(&db).await?;
        let proof = VerifyRequest {
            invite_id: id,
            corporate_email: email.into(),
            code: "initial-proof".into(),
        };
        assert!(verify_invitation(&db, &proof, b"original-browser").await?);
        assert!(consume_invitation(&db, id, b"original-browser").await?);
        sqlx::query("UPDATE corporate_activation_invitation SET session_expires_at = now() - interval '1 minute' WHERE id = $1")
            .bind(id).execute(&db).await?;
        assert!(!consume_invitation(&db, id, b"original-browser").await?);
        let new_expiry = Utc::now() + chrono::Duration::minutes(30);
        assert!(
            !reissue_invitation(
                &db,
                "macro|stranger@company.test",
                id,
                "recovery-proof",
                new_expiry
            )
            .await?
        );
        assert!(
            reissue_invitation(
                &db,
                "macro|admin@company.test",
                id,
                "recovery-proof",
                new_expiry
            )
            .await?
        );
        assert!(!verify_invitation(&db, &proof, b"second-browser").await?);
        let recovery = VerifyRequest {
            code: "recovery-proof".into(),
            ..proof
        };
        assert!(verify_invitation(&db, &recovery, b"second-browser").await?);
        assert!(consume_invitation(&db, id, b"second-browser").await?);
        let counts: (i64, i64, i64) = sqlx::query_as(
            "SELECT (SELECT count(*) FROM corporate_mailbox_provision_intent WHERE idempotency_key = $1),
                    (SELECT count(*) FROM corporate_activation_audit WHERE invitation_id = $1 AND action = 'activated'),
                    (SELECT count(*) FROM corporate_activation_audit WHERE invitation_id = $1 AND action = 'reissued')"
        ).bind(id).fetch_one(&db).await?;
        assert_eq!(counts, (1, 1, 1));
        Ok(())
    }
}
