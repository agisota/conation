use crate::MacroCache;

pub static MACRO_MOBILE_LOGIN_SESSION_PREFIX: &str = "mbl_login:";
pub static MACRO_MOBILE_LOGIN_SESSION_EXPIRY_SECONDS: u64 = 5 * 60;

/// This is the length of time a passwordless login code is valid for within FusionAuth
/// This matches the time configured in the fusionauth tenant with some buffer time (30s)
pub static MACRO_PASSWORDLESS_LOGIN_CODE_EXPIRY_SECONDS: u64 = 630;

/// How long after account creation the first completed login is still
/// attributed as a signup (the create-user webhook and the auth callback run
/// within the same auth flow, so this only needs to cover slow IdP round trips).
pub static MACRO_JUST_SIGNED_UP_EXPIRY_SECONDS: u64 = 30 * 60;

pub static MACRO_OAUTH_STATE_NONCE_PREFIX: &str = "oauth_state_nonce:";
pub static MACRO_OAUTH_STATE_NONCE_EXPIRY_SECONDS: u64 = 10 * 60;

/// Generates the rate limit key for channel invites for a given ip
macro_rules! macro_passwordless_login_code {
    ($email:expr) => {
        format!("pw_login_code:{}", $email)
    };
}

/// Generates the "account was just created" marker key for a given email
macro_rules! macro_just_signed_up {
    ($email:expr) => {
        format!("just_signed_up:{}", $email)
    };
}

impl MacroCache {
    /// Registers a browser-bound OAuth state nonce once, with a short expiry.
    /// SET NX EX is one Redis operation and is shared by every auth replica.
    pub async fn issue_oauth_state_nonce(
        &self,
        nonce: &str,
        flow_context: &str,
    ) -> anyhow::Result<bool> {
        let key = format!("{MACRO_OAUTH_STATE_NONCE_PREFIX}{nonce}");
        let mut connection = self.inner.get_multiplexed_async_connection().await?;
        let result: Option<String> = redis::cmd("SET")
            .arg(&key)
            .arg(flow_context)
            .arg("EX")
            .arg(MACRO_OAUTH_STATE_NONCE_EXPIRY_SECONDS)
            .arg("NX")
            .query_async(&mut connection)
            .await?;
        Ok(result.is_some())
    }

    /// Atomically consumes the registered immutable flow context.
    pub async fn consume_oauth_state_nonce(&self, nonce: &str) -> anyhow::Result<Option<String>> {
        let key = format!("{MACRO_OAUTH_STATE_NONCE_PREFIX}{nonce}");
        macro_redis::get::get_del_optional::<String>(&self.inner, &key).await
    }

    /// **LEGACY** removes a user's session from redis
    /// This is used for legacy auth only
    pub async fn delete_user(&self, user_id: &str) -> anyhow::Result<()> {
        let mut keys: Vec<String> = vec![user_id.to_string()];

        let session_id = macro_redis::get::get_optional::<String>(&self.inner, user_id).await?;

        if let Some(session_id) = session_id {
            keys.push(session_id.clone());
            keys.push(format!("{session_id}-id"));
        }

        let keys = keys.iter().map(|k| k.as_str()).collect::<Vec<&str>>();
        macro_redis::delete::delete_multiple(&self.inner, &keys).await
    }

    /// Sets the mobile login session
    pub async fn set_mobile_login_session(
        &self,
        session_code: &str,
        refresh_token: &str,
    ) -> anyhow::Result<()> {
        let key = format!("{}{}", MACRO_MOBILE_LOGIN_SESSION_PREFIX, session_code);
        macro_redis::set::set_with_expiry(
            &self.inner,
            &key,
            refresh_token,
            MACRO_MOBILE_LOGIN_SESSION_EXPIRY_SECONDS,
        )
        .await
    }

    /// Atomically consumes a mobile login session. A session code can only be
    /// redeemed once, including when concurrent requests hit different replicas.
    pub async fn take_mobile_login_session(
        &self,
        session_code: &str,
    ) -> anyhow::Result<Option<String>> {
        let key = format!("{}{}", MACRO_MOBILE_LOGIN_SESSION_PREFIX, session_code);
        macro_redis::get::get_del_optional::<String>(&self.inner, &key).await
    }

    /// Sets the passwordless login code for a given email
    pub async fn set_passwordless_login_code(&self, email: &str, code: &str) -> anyhow::Result<()> {
        let key = macro_passwordless_login_code!(email.to_lowercase());

        macro_redis::set::set_with_expiry(
            &self.inner,
            &key,
            code,
            MACRO_PASSWORDLESS_LOGIN_CODE_EXPIRY_SECONDS,
        )
        .await
    }

    /// Gets the passwordless login code for a given email
    pub async fn get_passwordless_login_code(&self, email: &str) -> anyhow::Result<String> {
        let key = macro_passwordless_login_code!(email.to_lowercase());
        macro_redis::get::get::<String>(&self.inner, &key).await
    }

    /// Marks an account as just created so the auth callback that completes the
    /// same flow can attribute the login as a signup.
    pub async fn mark_user_just_signed_up(&self, email: &str) -> anyhow::Result<()> {
        let key = macro_just_signed_up!(email.to_lowercase());
        macro_redis::set::set_with_expiry(&self.inner, &key, 1, MACRO_JUST_SIGNED_UP_EXPIRY_SECONDS)
            .await
    }

    /// Consumes the just-signed-up marker for an email. Returns true exactly
    /// once per marker: GETDEL is atomic, so the first caller wins.
    pub async fn take_user_just_signed_up(&self, email: &str) -> anyhow::Result<bool> {
        let key = macro_just_signed_up!(email.to_lowercase());
        let value = macro_redis::get::get_del_optional::<u8>(&self.inner, &key).await?;
        Ok(value.is_some())
    }
}
