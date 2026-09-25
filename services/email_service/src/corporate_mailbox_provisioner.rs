//! Durable, owner-bound provisioning for invited corporate mailboxes.
//!
//! The worker targets Stalwart's v0.16+ JMAP management API. It never marks a
//! mailbox READY: a successful account/JMAP identity check does not prove SMTP
//! routing or the user-facing inbox/send/sync path.
use std::{collections::HashMap, time::Duration};

use aws_sdk_kms::{Client as KmsClient, primitives::Blob};
use reqwest::{Client, StatusCode, Url};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use thiserror::Error;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::stalwart_jmap::{MailboxVerificationError, verify_existing_mailbox};

const JMAP_CORE: &str = "urn:ietf:params:jmap:core";
const STALWART_JMAP: &str = "urn:stalwart:jmap";
const OWNER_PREFIX: &str = "macro-fusionauth:";
const MAX_RESPONSE_BYTES: usize = 256 * 1024;
const MAX_ATTEMPTS: i32 = 12;
const CLAIM_LEASE_SECONDS: i64 = 180;

#[derive(Debug, Error)]
pub enum ProvisionerError {
    #[error("corporate mailbox provision database operation failed")]
    Database,
    #[error("corporate mailbox worker configuration is invalid")]
    Configuration,
    #[error("corporate mailbox credential protection failed")]
    CredentialProtection,
}

#[derive(Debug, Error)]
enum ProvisionFailure {
    #[error("provider is temporarily unavailable")]
    Retryable(&'static str),
    #[error("provider state requires operator repair")]
    Repair(&'static str),
}

#[derive(FromRow)]
struct ProvisionIntent {
    idempotency_key: Uuid,
    fusionauth_user_id: Uuid,
    corporate_email: String,
    attempt_count: i32,
    credential_ciphertext: Option<Vec<u8>>,
    credential_kms_key_id: Option<String>,
    credential_encryption_version: Option<i16>,
    stalwart_account_id: Option<String>,
    lease_token: Uuid,
}

#[derive(Deserialize)]
struct JmapResponse {
    #[serde(rename = "methodResponses")]
    method_responses: Vec<(String, Value, String)>,
}

pub struct StalwartMailboxProvisioner {
    db: PgPool,
    client: Client,
    management_api_url: Url,
    management_bearer_token: Zeroizing<String>,
    domain_ids: HashMap<String, String>,
    account_encryption_at_rest: Value,
    session_url: String,
    kms: KmsClient,
    kms_key_id: String,
}

impl StalwartMailboxProvisioner {
    pub fn new(
        db: PgPool,
        management_api_url: &str,
        management_bearer_token: String,
        domain_ids: HashMap<String, String>,
        account_encryption_at_rest: Value,
        session_url: &str,
        kms: KmsClient,
        kms_key_id: String,
    ) -> Result<Self, ProvisionerError> {
        let management_api_url = validate_management_api_url(management_api_url)?;
        let session_url = validate_session_url(session_url)?;
        if management_bearer_token.trim().is_empty()
            || kms_key_id.trim().is_empty()
            || domain_ids.is_empty()
            || !valid_encryption_policy(&account_encryption_at_rest)
        {
            return Err(ProvisionerError::Configuration);
        }
        let mut normalized_domain_ids = HashMap::with_capacity(domain_ids.len());
        for (domain, id) in domain_ids {
            let domain = domain.trim().to_ascii_lowercase();
            let id = id.trim().to_owned();
            if domain.is_empty()
                || id.is_empty()
                || domain.contains('@')
                || normalized_domain_ids.insert(domain, id).is_some()
            {
                return Err(ProvisionerError::Configuration);
            }
        }
        let domain_ids = normalized_domain_ids;
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|_| ProvisionerError::Configuration)?;
        Ok(Self {
            db,
            client,
            management_api_url,
            management_bearer_token: Zeroizing::new(management_bearer_token),
            domain_ids,
            account_encryption_at_rest,
            session_url,
            kms,
            kms_key_id,
        })
    }

    /// Runs the next due outbox item, if one exists. Provider requests are made
    /// only after the encrypted mailbox credential is durable in macrodb.
    pub async fn run_one(&self) -> Result<bool, ProvisionerError> {
        let Some(mut intent) = self.claim_next().await? else {
            return Ok(false);
        };
        let secret = match self.mailbox_secret(&intent).await {
            Ok(secret) => secret,
            Err(error) => {
                self.record_failure(&intent, "CREDENTIAL_ENCRYPTION", true)
                    .await?;
                tracing::error!(
                    idempotency_key = %intent.idempotency_key,
                    error = %error,
                    "corporate mailbox credential protection failed"
                );
                return Ok(true);
            }
        };
        // Drop the old ciphertext copy before making an external request. It is
        // ciphertext, but keeping only the minimum live secret is simpler.
        intent.credential_ciphertext = None;

        match self.provision_and_verify(&intent, &secret).await {
            Ok((stalwart_account_id, jmap_account_id)) => {
                self.record_provisioned(&intent, &stalwart_account_id, &jmap_account_id)
                    .await?;
            }
            Err(ProvisionFailure::Retryable(code)) => {
                self.record_failure(&intent, code, true).await?;
            }
            Err(ProvisionFailure::Repair(code)) => {
                self.record_failure(&intent, code, false).await?;
            }
        }
        Ok(true)
    }

    /// Polling is intentionally independent of Gmail queues and stays dormant
    /// when provider configuration is absent.
    pub async fn run(self) {
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;
            match self.run_one().await {
                Ok(true) => {}
                Ok(false) => {}
                Err(error) => {
                    tracing::error!(error = %error, "corporate mailbox provision worker step failed");
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        }
    }

    async fn claim_next(&self) -> Result<Option<ProvisionIntent>, ProvisionerError> {
        let mut tx = self
            .db
            .begin()
            .await
            .map_err(|_| ProvisionerError::Database)?;
        let intent = claim_next_in_transaction(&mut tx).await?;
        tx.commit().await.map_err(|_| ProvisionerError::Database)?;
        Ok(intent)
    }

    async fn mailbox_secret(
        &self,
        intent: &ProvisionIntent,
    ) -> Result<Zeroizing<String>, ProvisionerError> {
        match (
            intent.credential_ciphertext.as_deref(),
            intent.credential_kms_key_id.as_deref(),
            intent.credential_encryption_version,
        ) {
            (Some(ciphertext), Some(kms_key_id), Some(1)) => {
                self.decrypt_secret(intent, ciphertext, kms_key_id).await
            }
            (None, None, None) => {
                let secret = Zeroizing::new(format!(
                    "Z{}!x{}9",
                    Uuid::new_v4().simple(),
                    Uuid::new_v4().simple()
                ));
                let (ciphertext, kms_key_id) = self.encrypt_secret(intent, &secret).await?;
                let rows = sqlx::query(
                    r#"UPDATE corporate_mailbox_provision_intent
                       SET credential_ciphertext = $3,
                           credential_kms_key_id = $4,
                           credential_encryption_version = 1
                       WHERE idempotency_key = $1 AND lease_token = $2
                         AND credential_ciphertext IS NULL"#,
                )
                .bind(intent.idempotency_key)
                .bind(intent.lease_token)
                .bind(ciphertext)
                .bind(kms_key_id)
                .execute(&self.db)
                .await
                .map_err(|_| ProvisionerError::Database)?
                .rows_affected();
                if rows != 1 {
                    return Err(ProvisionerError::Database);
                }
                Ok(secret)
            }
            _ => Err(ProvisionerError::CredentialProtection),
        }
    }

    async fn encrypt_secret(
        &self,
        intent: &ProvisionIntent,
        secret: &str,
    ) -> Result<(Vec<u8>, String), ProvisionerError> {
        let response = self
            .kms
            .encrypt()
            .key_id(&self.kms_key_id)
            .plaintext(Blob::new(secret.as_bytes()))
            .set_encryption_context(Some(encryption_context(intent)))
            .send()
            .await
            .map_err(|_| ProvisionerError::CredentialProtection)?;
        let ciphertext = response
            .ciphertext_blob
            .ok_or(ProvisionerError::CredentialProtection)?;
        let kms_key_id = response.key_id.unwrap_or_else(|| self.kms_key_id.clone());
        Ok((ciphertext.into_inner(), kms_key_id))
    }

    async fn decrypt_secret(
        &self,
        intent: &ProvisionIntent,
        ciphertext: &[u8],
        kms_key_id: &str,
    ) -> Result<Zeroizing<String>, ProvisionerError> {
        let response = self
            .kms
            .decrypt()
            .key_id(kms_key_id)
            .ciphertext_blob(Blob::new(ciphertext))
            .set_encryption_context(Some(encryption_context(intent)))
            .send()
            .await
            .map_err(|_| ProvisionerError::CredentialProtection)?;
        let Some(plaintext) = response.plaintext else {
            return Err(ProvisionerError::CredentialProtection);
        };
        let mut plaintext = Zeroizing::new(plaintext.into_inner());
        let value = String::from_utf8(std::mem::take(&mut *plaintext))
            .map_err(|_| ProvisionerError::CredentialProtection)?;
        if value.is_empty() {
            return Err(ProvisionerError::CredentialProtection);
        }
        Ok(Zeroizing::new(value))
    }

    async fn provision_and_verify(
        &self,
        intent: &ProvisionIntent,
        password: &str,
    ) -> Result<(String, String), ProvisionFailure> {
        let (local_part, domain) = intent
            .corporate_email
            .split_once('@')
            .ok_or(ProvisionFailure::Repair("INVALID_RESERVED_EMAIL"))?;
        let domain_id = self
            .domain_ids
            .get(domain)
            .ok_or(ProvisionFailure::Repair("DOMAIN_NOT_CONFIGURED"))?;
        let owner = format!("{OWNER_PREFIX}{}", intent.fusionauth_user_id);
        let account_id = if let Some(saved_account_id) = &intent.stalwart_account_id {
            self.verify_account_by_id(saved_account_id, &intent.corporate_email, &owner)
                .await?;
            saved_account_id.clone()
        } else {
            let account_id = match self
                .find_account(local_part, domain_id, &intent.corporate_email, &owner)
                .await?
            {
                Some(account_id) => account_id,
                None => {
                    let created_id = self
                        .create_account(local_part, domain_id, &owner, password)
                        .await?;
                    self.record_stalwart_account_id(intent, &created_id).await?;
                    let verified_id = self
                        .verify_account_by_id(&created_id, &intent.corporate_email, &owner)
                        .await?;
                    if verified_id != created_id {
                        return Err(ProvisionFailure::Repair("PROVIDER_CREATED_ID_MISMATCH"));
                    }
                    verified_id
                }
            };
            self.record_stalwart_account_id(intent, &account_id).await?;
            account_id
        };
        let jmap_account_id =
            verify_existing_mailbox(Some(&self.session_url), password, &intent.corporate_email)
                .await
                .map_err(classify_session_failure)?;
        if jmap_account_id != account_id {
            return Err(ProvisionFailure::Repair("JMAP_ACCOUNT_ID_MISMATCH"));
        }
        Ok((account_id, jmap_account_id))
    }

    async fn record_stalwart_account_id(
        &self,
        intent: &ProvisionIntent,
        account_id: &str,
    ) -> Result<(), ProvisionFailure> {
        let result = sqlx::query(
            r#"UPDATE corporate_mailbox_provision_intent
               SET stalwart_account_id = $3
               WHERE idempotency_key = $1 AND lease_token = $2
                 AND (stalwart_account_id IS NULL OR stalwart_account_id = $3)"#,
        )
        .bind(intent.idempotency_key)
        .bind(intent.lease_token)
        .bind(account_id)
        .execute(&self.db)
        .await
        .map_err(|_| ProvisionFailure::Retryable("ACCOUNT_ID_PERSISTENCE"))?;
        if result.rows_affected() != 1 {
            return Err(ProvisionFailure::Repair("PROVIDER_ACCOUNT_ID_CONFLICT"));
        }
        Ok(())
    }

    async fn find_account(
        &self,
        local_part: &str,
        domain_id: &str,
        expected_email: &str,
        expected_owner: &str,
    ) -> Result<Option<String>, ProvisionFailure> {
        let query = self
            .call(
                "x:Account/query",
                json!({
                    "filter": {
                        "operator": "AND",
                        "conditions": [
                            { "name": local_part },
                            { "domainId": domain_id }
                        ]
                    },
                    "limit": 2
                }),
            )
            .await?;
        let ids = account_query_ids(&query)?;
        if ids.len() > 1 {
            return Err(ProvisionFailure::Repair("AMBIGUOUS_PROVIDER_OWNER"));
        }
        let Some(account_id) = ids.first().and_then(Value::as_str) else {
            return Ok(None);
        };
        self.verify_account_by_id(account_id, expected_email, expected_owner)
            .await
            .map(Some)
    }

    async fn verify_account_by_id(
        &self,
        account_id: &str,
        expected_email: &str,
        expected_owner: &str,
    ) -> Result<String, ProvisionFailure> {
        let account = self
            .call(
                "x:Account/get",
                json!({
                    "ids": [account_id],
                    "properties": ["id", "name", "domainId", "emailAddress", "externalId"]
                }),
            )
            .await?;
        let list = account
            .get("list")
            .and_then(Value::as_array)
            .ok_or(ProvisionFailure::Repair("INVALID_ACCOUNT_GET_RESPONSE"))?;
        let Some(record) = list.first() else {
            return Err(ProvisionFailure::Retryable("PROVIDER_ACCOUNT_NOT_VISIBLE"));
        };
        let actual_id = record
            .get("id")
            .and_then(Value::as_str)
            .ok_or(ProvisionFailure::Repair("INVALID_ACCOUNT_GET_RESPONSE"))?;
        if actual_id != account_id
            || !account_identity_matches(record, expected_email, expected_owner)
        {
            return Err(ProvisionFailure::Repair("PROVIDER_OWNER_MISMATCH"));
        }
        Ok(actual_id.to_owned())
    }

    async fn create_account(
        &self,
        local_part: &str,
        domain_id: &str,
        external_id: &str,
        password: &str,
    ) -> Result<String, ProvisionFailure> {
        let result = self
            .call(
                "x:Account/set",
                json!({
                    "create": {
                        "macro-corporate-mailbox": {
                            "@type": "User",
                            "name": local_part,
                            "domainId": domain_id,
                            "externalId": external_id,
                            "credentials": {
                                "0": { "@type": "Password", "secret": password }
                            },
                            "aliases": {},
                            "memberGroupIds": {},
                            "quotas": {},
                            "roles": { "@type": "User" },
                            "permissions": { "@type": "Inherit" },
                            "encryptionAtRest": self.account_encryption_at_rest
                        }
                    }
                }),
            )
            .await?;
        let created = result
            .get("created")
            .and_then(|created| created.get("macro-corporate-mailbox"))
            .and_then(|created| created.get("id"))
            .and_then(Value::as_str);
        match created {
            Some(id) if !id.is_empty() => Ok(id.to_owned()),
            _ => Err(ProvisionFailure::Retryable("PROVIDER_CREATE_UNCONFIRMED")),
        }
    }

    async fn call(&self, method: &str, arguments: Value) -> Result<Value, ProvisionFailure> {
        let body = json!({
            "using": [JMAP_CORE, STALWART_JMAP],
            "methodCalls": [[method, arguments, "c1"]]
        });
        let response = self
            .client
            .post(self.management_api_url.clone())
            .bearer_auth(self.management_bearer_token.as_str())
            .json(&body)
            .send()
            .await
            .map_err(|_| ProvisionFailure::Retryable("PROVIDER_TRANSPORT"))?;
        let status = response.status();
        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(ProvisionFailure::Repair("PROVIDER_ADMIN_AUTHORIZATION"));
        }
        if status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
            return Err(ProvisionFailure::Retryable("PROVIDER_HTTP_RETRYABLE"));
        }
        if !status.is_success() {
            return Err(ProvisionFailure::Repair("PROVIDER_HTTP_REJECTED"));
        }
        let bytes = read_bounded(response).await?;
        let parsed: JmapResponse = serde_json::from_slice(&bytes)
            .map_err(|_| ProvisionFailure::Repair("INVALID_PROVIDER_RESPONSE"))?;
        let method_response = parsed
            .method_responses
            .into_iter()
            .find(|(_, _, call_id)| call_id == "c1")
            .ok_or(ProvisionFailure::Repair("PROVIDER_METHOD_RESPONSE_MISSING"))?;
        if method_response.0 != method {
            return Err(ProvisionFailure::Repair("PROVIDER_METHOD_ERROR"));
        }
        Ok(method_response.1)
    }

    async fn record_provisioned(
        &self,
        intent: &ProvisionIntent,
        stalwart_account_id: &str,
        jmap_account_id: &str,
    ) -> Result<(), ProvisionerError> {
        let mut tx = self
            .db
            .begin()
            .await
            .map_err(|_| ProvisionerError::Database)?;
        let result = sqlx::query(
            r#"UPDATE corporate_mailbox_provision_intent
               SET state = 'PROVISIONED',
                   stalwart_account_id = $3,
                   jmap_account_id = $4,
                   lease_token = NULL,
                   lease_expires_at = NULL,
                   last_error_code = NULL,
                   next_attempt_at = now()
               WHERE idempotency_key = $1 AND lease_token = $2"#,
        )
        .bind(intent.idempotency_key)
        .bind(intent.lease_token)
        .bind(stalwart_account_id)
        .bind(jmap_account_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| ProvisionerError::Database)?;
        if result.rows_affected() == 1 {
            sqlx::query(
                "INSERT INTO corporate_mailbox_provision_audit (idempotency_key, action) VALUES ($1, 'jmap_verified')",
            )
            .bind(intent.idempotency_key)
            .execute(&mut *tx)
            .await
            .map_err(|_| ProvisionerError::Database)?;
        }
        tx.commit().await.map_err(|_| ProvisionerError::Database)
    }

    async fn record_failure(
        &self,
        intent: &ProvisionIntent,
        code: &str,
        retryable: bool,
    ) -> Result<(), ProvisionerError> {
        let terminal = !retryable || intent.attempt_count >= MAX_ATTEMPTS;
        let state = if terminal {
            "NEEDS_REPAIR"
        } else {
            "RETRYABLE"
        };
        let delay_seconds =
            (30_i64 * 2_i64.pow((intent.attempt_count.saturating_sub(1) as u32).min(7))).min(3600);
        let mut tx = self
            .db
            .begin()
            .await
            .map_err(|_| ProvisionerError::Database)?;
        let updated = sqlx::query(
            r#"UPDATE corporate_mailbox_provision_intent
               SET state = $3,
                   next_attempt_at = now() + ($4 * interval '1 second'),
                   lease_token = NULL,
                   lease_expires_at = NULL,
                   last_error_code = $5
               WHERE idempotency_key = $1 AND lease_token = $2"#,
        )
        .bind(intent.idempotency_key)
        .bind(intent.lease_token)
        .bind(state)
        .bind(delay_seconds)
        .bind(code)
        .execute(&mut *tx)
        .await
        .map_err(|_| ProvisionerError::Database)?;
        if updated.rows_affected() == 1 {
            let action = if terminal {
                "needs_repair"
            } else {
                "retry_scheduled"
            };
            sqlx::query(
                "INSERT INTO corporate_mailbox_provision_audit (idempotency_key, action) VALUES ($1, $2)",
            )
            .bind(intent.idempotency_key)
            .bind(action)
            .execute(&mut *tx)
            .await
            .map_err(|_| ProvisionerError::Database)?;
        }
        tx.commit().await.map_err(|_| ProvisionerError::Database)
    }
}

async fn terminalize_exhausted_leases(
    tx: &mut Transaction<'_, Postgres>,
) -> Result<(), ProvisionerError> {
    sqlx::query(
        r#"WITH exhausted AS (
            UPDATE corporate_mailbox_provision_intent
            SET state = 'NEEDS_REPAIR',
                lease_token = NULL,
                lease_expires_at = NULL,
                last_error_code = 'PROVISIONING_LEASE_EXHAUSTED',
                next_attempt_at = now()
            WHERE state = 'PROVISIONING'
              AND lease_expires_at < now()
              AND attempt_count >= $1
            RETURNING idempotency_key
        )
        INSERT INTO corporate_mailbox_provision_audit (idempotency_key, action)
        SELECT idempotency_key, 'needs_repair' FROM exhausted"#,
    )
    .bind(MAX_ATTEMPTS)
    .execute(&mut **tx)
    .await
    .map_err(|_| ProvisionerError::Database)?;
    Ok(())
}

async fn claim_next_in_transaction(
    tx: &mut Transaction<'_, Postgres>,
) -> Result<Option<ProvisionIntent>, ProvisionerError> {
    terminalize_exhausted_leases(tx).await?;
    let lease_token = Uuid::new_v4();
    let intent = sqlx::query_as::<_, ProvisionIntent>(
        r#"WITH candidate AS (
            SELECT idempotency_key
            FROM corporate_mailbox_provision_intent
            WHERE next_attempt_at <= now()
              AND (
                state IN ('PENDING_PROVIDER', 'RETRYABLE')
                OR (state = 'PROVISIONING' AND lease_expires_at < now()
                    AND attempt_count < $3)
              )
            ORDER BY next_attempt_at, created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        UPDATE corporate_mailbox_provision_intent AS intent
        SET state = 'PROVISIONING',
            attempt_count = intent.attempt_count + 1,
            lease_token = $1,
            lease_expires_at = now() + ($2 * interval '1 second'),
            last_error_code = NULL
        FROM candidate
        WHERE intent.idempotency_key = candidate.idempotency_key
        RETURNING intent.idempotency_key, intent.fusionauth_user_id,
            intent.corporate_email, intent.attempt_count,
            intent.credential_ciphertext, intent.credential_kms_key_id,
            intent.credential_encryption_version, intent.stalwart_account_id,
            intent.lease_token"#,
    )
    .bind(lease_token)
    .bind(CLAIM_LEASE_SECONDS)
    .bind(MAX_ATTEMPTS)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|_| ProvisionerError::Database)?;
    if let Some(intent) = &intent {
        sqlx::query(
            "INSERT INTO corporate_mailbox_provision_audit (idempotency_key, action) VALUES ($1, 'claimed')",
        )
        .bind(intent.idempotency_key)
        .execute(&mut **tx)
        .await
        .map_err(|_| ProvisionerError::Database)?;
    }
    Ok(intent)
}

fn encryption_context(intent: &ProvisionIntent) -> HashMap<String, String> {
    HashMap::from([
        (
            "macro:purpose".to_owned(),
            "stalwart-mailbox-password".to_owned(),
        ),
        (
            "macro:fusionauth-user-id".to_owned(),
            intent.fusionauth_user_id.to_string(),
        ),
        (
            "macro:corporate-email".to_owned(),
            intent.corporate_email.clone(),
        ),
    ])
}

fn valid_encryption_policy(policy: &Value) -> bool {
    match policy.get("@type").and_then(Value::as_str) {
        Some("Disabled") => true,
        Some("Aes128" | "Aes256") => policy
            .get("publicKey")
            .and_then(Value::as_str)
            .is_some_and(|key| !key.trim().is_empty()),
        _ => false,
    }
}

fn validate_management_api_url(raw: &str) -> Result<Url, ProvisionerError> {
    let url = Url::parse(raw).map_err(|_| ProvisionerError::Configuration)?;
    let path = url.path().trim_end_matches('/');
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !path.ends_with("/api")
    {
        return Err(ProvisionerError::Configuration);
    }
    Ok(url)
}

fn validate_session_url(raw: &str) -> Result<String, ProvisionerError> {
    let url = Url::parse(raw).map_err(|_| ProvisionerError::Configuration)?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(ProvisionerError::Configuration);
    }
    Ok(url.to_string())
}

fn account_identity_matches(record: &Value, expected_email: &str, expected_owner: &str) -> bool {
    record
        .get("emailAddress")
        .and_then(Value::as_str)
        .is_some_and(|email| email.eq_ignore_ascii_case(expected_email))
        && record.get("externalId").and_then(Value::as_str) == Some(expected_owner)
}

fn account_query_ids(query: &Value) -> Result<&[Value], ProvisionFailure> {
    query
        .get("ids")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or(ProvisionFailure::Repair("INVALID_ACCOUNT_QUERY_RESPONSE"))
}

async fn read_bounded(response: reqwest::Response) -> Result<Vec<u8>, ProvisionFailure> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(ProvisionFailure::Repair("PROVIDER_RESPONSE_TOO_LARGE"));
    }
    let mut response = response;
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| ProvisionFailure::Retryable("PROVIDER_TRANSPORT"))?
    {
        if chunk.len() > MAX_RESPONSE_BYTES - bytes.len() {
            return Err(ProvisionFailure::Repair("PROVIDER_RESPONSE_TOO_LARGE"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn classify_session_failure(error: MailboxVerificationError) -> ProvisionFailure {
    match error {
        MailboxVerificationError::ProviderUnavailable => {
            ProvisionFailure::Retryable("JMAP_SESSION_UNAVAILABLE")
        }
        MailboxVerificationError::Unauthorized => {
            ProvisionFailure::Retryable("JMAP_CREDENTIAL_NOT_YET_PROPAGATED")
        }
        MailboxVerificationError::IdentityMismatch => {
            ProvisionFailure::Repair("JMAP_IDENTITY_MISMATCH")
        }
        MailboxVerificationError::Unconfigured | MailboxVerificationError::InvalidEndpoint => {
            ProvisionFailure::Repair("JMAP_CONFIGURATION_INVALID")
        }
    }
}

/// Re-queues an exact owner-bound intent after an operator has corrected the
/// provider-side cause. Credentials are retained; the provider is reconciled
/// by its externalId before another account creation is attempted.
pub async fn retry_repaired_intent(
    db: &PgPool,
    idempotency_key: Uuid,
    fusionauth_user_id: Uuid,
    corporate_email: &str,
) -> Result<bool, ProvisionerError> {
    if idempotency_key != fusionauth_user_id {
        return Ok(false);
    }
    let mut tx = db.begin().await.map_err(|_| ProvisionerError::Database)?;
    let updated = sqlx::query(
        r#"UPDATE corporate_mailbox_provision_intent
           SET state = 'RETRYABLE', next_attempt_at = now(),
               attempt_count = 0,
               lease_token = NULL, lease_expires_at = NULL,
               last_error_code = NULL
           WHERE idempotency_key = $1 AND fusionauth_user_id = $2
             AND corporate_email = $3 AND state = 'NEEDS_REPAIR'"#,
    )
    .bind(idempotency_key)
    .bind(fusionauth_user_id)
    .bind(corporate_email)
    .execute(&mut *tx)
    .await
    .map_err(|_| ProvisionerError::Database)?;
    if updated.rows_affected() == 1 {
        sqlx::query(
            "INSERT INTO corporate_mailbox_provision_audit (idempotency_key, action) VALUES ($1, 'operator_retried')",
        )
        .bind(idempotency_key)
        .execute(&mut *tx)
        .await
        .map_err(|_| ProvisionerError::Database)?;
    }
    tx.commit().await.map_err(|_| ProvisionerError::Database)?;
    Ok(updated.rows_affected() == 1)
}

/// Maps an internal HTTP status to a stable provider-independent result. The
/// response body is intentionally omitted because providers may echo inputs.
pub fn internal_error_response(error: &ProvisionerError) -> StatusCode {
    match error {
        ProvisionerError::Database | ProvisionerError::CredentialProtection => {
            StatusCode::SERVICE_UNAVAILABLE
        }
        ProvisionerError::Configuration => StatusCode::BAD_GATEWAY,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use macro_db_migrator::MACRO_DB_MIGRATIONS;

    #[test]
    fn jmap_unauthorized_during_propagation_is_bounded_retryable() {
        assert!(matches!(
            classify_session_failure(MailboxVerificationError::Unauthorized),
            ProvisionFailure::Retryable("JMAP_CREDENTIAL_NOT_YET_PROPAGATED")
        ));
        assert!(MAX_ATTEMPTS > 0);
    }
    #[test]
    fn management_endpoint_must_be_https_and_api_path_without_credentials() {
        assert!(validate_management_api_url("https://mail.example.com/api").is_ok());
        assert!(validate_management_api_url("http://mail.example.com/api").is_err());
        assert!(validate_management_api_url("https://u:p@mail.example.com/api").is_err());
        assert!(validate_management_api_url("https://mail.example.com/api?token=x").is_err());
        assert!(validate_management_api_url("https://mail.example.com/jmap").is_err());
    }

    #[test]
    fn account_encryption_policy_must_be_explicit_and_supported() {
        assert!(valid_encryption_policy(&json!({"@type":"Disabled"})));
        assert!(valid_encryption_policy(
            &json!({"@type":"Aes256","publicKey":"key-id"})
        ));
        assert!(!valid_encryption_policy(&json!({"@type":"Aes256"})));
        assert!(!valid_encryption_policy(&json!({})));
        assert!(!valid_encryption_policy(&json!({"@type":"Aes256Gcm"})));
    }
    #[test]
    fn existing_account_is_reused_only_for_the_exact_reserved_owner_and_email() {
        let record = json!({
            "emailAddress": "alice@example.com",
            "externalId": "macro-fusionauth:48d20c0b-3fbe-4c8a-8a52-a2b037b3e5a4"
        });
        assert!(account_identity_matches(
            &record,
            "alice@example.com",
            "macro-fusionauth:48d20c0b-3fbe-4c8a-8a52-a2b037b3e5a4"
        ));
        assert!(!account_identity_matches(
            &record,
            "alice@example.com",
            "macro-fusionauth:another-user"
        ));
        assert!(!account_identity_matches(
            &record,
            "alice+alias@example.com",
            "macro-fusionauth:48d20c0b-3fbe-4c8a-8a52-a2b037b3e5a4"
        ));
    }

    #[test]
    fn account_query_uses_standard_jmap_ids_and_rejects_account_ids() {
        let query = json!({"ids": ["account-1"]});
        assert_eq!(
            account_query_ids(&query).unwrap(),
            &[Value::String("account-1".to_owned())]
        );
        let provider_specific_old_shape = json!({"accountIds": ["account-1"]});
        assert!(matches!(
            account_query_ids(&provider_specific_old_shape),
            Err(ProvisionFailure::Repair("INVALID_ACCOUNT_QUERY_RESPONSE"))
        ));
    }
    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn expired_provisioning_lease_at_attempt_limit_moves_to_needs_repair(pool: PgPool) {
        let mut tx = pool.begin().await.expect("begin isolated test transaction");
        let organization_id: i32 = sqlx::query_scalar(
            "INSERT INTO \"Organization\" (name) VALUES ('Mailbox lease test') RETURNING id",
        )
        .fetch_one(&mut *tx)
        .await
        .expect("create invitation organization");
        let exhausted_id = Uuid::new_v4();
        let retryable_id = Uuid::new_v4();
        for (id, email, attempts) in [
            (exhausted_id, "exhausted@example.com", MAX_ATTEMPTS),
            (retryable_id, "retryable@example.com", MAX_ATTEMPTS - 1),
        ] {
            sqlx::query(
                "INSERT INTO macro_user (id, username, email, stripe_customer_id)
                 VALUES ($1, $2, $2, $3)",
            )
            .bind(id)
            .bind(email)
            .bind(format!("mailbox-lease-{id}"))
            .execute(&mut *tx)
            .await
            .expect("create reserved owner");
            sqlx::query(
                "INSERT INTO corporate_activation_invitation
                 (id, corporate_email, organization_id, code_hash, expires_at)
                 VALUES ($1, $2, $3, decode('01', 'hex'), now() + interval '1 hour')",
            )
            .bind(id)
            .bind(email)
            .bind(organization_id)
            .execute(&mut *tx)
            .await
            .expect("create activation invitation");
            sqlx::query(
                "INSERT INTO corporate_mailbox_provision_intent
                 (idempotency_key, fusionauth_user_id, corporate_email, state,
                  lease_token, lease_expires_at, attempt_count)
                 VALUES ($1, $1, $2, 'PROVISIONING', $3,
                         now() - interval '1 second', $4)",
            )
            .bind(id)
            .bind(email)
            .bind(Uuid::new_v4())
            .bind(attempts)
            .execute(&mut *tx)
            .await
            .expect("create expired lease on the migrated schema");
        }

        let claimed = claim_next_in_transaction(&mut tx)
            .await
            .expect("claim one eligible worker lease")
            .expect("reclaim the below-limit worker lease");
        assert_eq!(claimed.idempotency_key, retryable_id);
        assert_eq!(claimed.attempt_count, MAX_ATTEMPTS);
        assert!(
            claim_next_in_transaction(&mut tx)
                .await
                .expect("check for additional eligible work")
                .is_none()
        );

        let exhausted_state: (String, Option<Uuid>, Option<String>) = sqlx::query_as(
            "SELECT state, lease_token, last_error_code FROM corporate_mailbox_provision_intent WHERE idempotency_key = $1",
        )
        .bind(exhausted_id)
        .fetch_one(&mut *tx)
        .await
        .expect("load exhausted worker lease");
        assert_eq!(exhausted_state.0, "NEEDS_REPAIR");
        assert_eq!(exhausted_state.1, None);
        assert_eq!(
            exhausted_state.2.as_deref(),
            Some("PROVISIONING_LEASE_EXHAUSTED")
        );
        let repair_audits: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM corporate_mailbox_provision_audit WHERE idempotency_key = $1 AND action = 'needs_repair'",
        )
        .bind(exhausted_id)
        .fetch_one(&mut *tx)
        .await
        .expect("load exhausted lease audit");
        assert_eq!(repair_audits, 1);
        let retryable_state: String = sqlx::query_scalar(
            "SELECT state FROM corporate_mailbox_provision_intent WHERE idempotency_key = $1",
        )
        .bind(retryable_id)
        .fetch_one(&mut *tx)
        .await
        .expect("load retryable worker lease");
        assert_eq!(retryable_state, "PROVISIONING");
        tx.rollback().await.expect("roll back isolated test data");
    }
}
