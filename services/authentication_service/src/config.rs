use std::sync::LazyLock;

use anyhow::Context;
use authentication_service::service::signup_policy::SignupPolicy;
use conation_auth::InternalApiKey;
pub use conation_env::Environment;
use conation_env_var::{env_vars, maybe_env_vars};
use database_env_vars::{DatabaseUrl, RedisUri};
use roles_and_permissions::domain::access_policy::CONATION_ACCESS_POLICY;
use url::Url;

// BASE_URL config value. This is validated when creating the config in main.rs
pub static BASE_URL: LazyLock<String> = LazyLock::new(|| {
    BaseUrl::new()
        .expect("BASE_URL must be provided via APP_SECRETS_JSON or env")
        .as_ref()
        .to_string()
});

env_vars! {
    pub struct BaseUrl;
    pub struct FusionAuthApiSecretKey;
    pub struct FusionAuthClientId;
    pub struct FusionAuthClientSecretKey;
    pub struct FusionAuthBaseUrl;
    pub struct FusionAuthOauthRedirectUri;
    pub struct ServiceInternalAuthKey;
    pub struct GithubClientId;
    pub struct GithubClientSecret;
    pub struct GithubIdpId;
    /// Comma-separated Kafka bootstrap servers for the macro event broker.
    pub struct KafkaBrokers;
}

maybe_env_vars! {
    /// Browser-reachable FusionAuth origin used for OAuth authorization redirects.
    pub struct FusionAuthPublicUrl;
    /// Transactional sender used for authentication and account-merge mail.
    pub struct AuthSenderEmail;
    /// Operator-owned support mailbox rendered into transactional mail.
    pub struct SupportEmail;
    /// Google OAuth is enabled only when both credentials are configured.
    pub struct GoogleClientId;
    pub struct GoogleClientSecretKey;
    /// Legacy Stripe credential retained for configuration compatibility.
    ///
    /// Conation's free-access policy keeps hosted billing disabled even when
    /// this value is present.
    pub struct StripeSecretKey;
    /// Legacy Stripe price retained for configuration compatibility.
    ///
    /// Conation's free-access policy keeps hosted billing disabled even when
    /// this value is present.
    pub struct StripePriceId;
    pub struct MicrosoftClientId;
    pub struct MicrosoftClientSecret;
    pub struct MicrosoftTenantId;
    pub struct MicrosoftTokenKmsKeyId;
    /// KMS key that encrypts users' Cursor API keys. Deliberately not the
    /// Microsoft one: sharing it would grant whatever decrypts Cursor keys
    /// access to the key protecting everyone's mailbox credentials.
    ///
    /// Optional *here* only because Pulumi injects it into the task
    /// definition rather than Doppler, and the Doppler config validator
    /// deserializes this struct from Doppler alone — a required field it
    /// cannot see fails CI. The service still refuses to start without it;
    /// see [`Config::cursor_api_key_kms_key_id`], which also reads the
    /// process environment because `MacroConfig` does not fall back to it
    /// when `APP_SECRETS_JSON` is present.
    pub struct CursorApiKeyKmsKeyId;
    pub struct GaMeasurementId;
    pub struct GaApiSecret;
    pub struct MetaPixelId;
    pub struct MetaAccessToken;
    pub struct MetaTestEventCode;
    pub struct PosthogApiKey;
    pub struct PosthogHost;
    pub struct LoopsApiKey;
    /// JSON array of exact email addresses allowed to sign up in Develop.
    pub struct DevelopmentSignupAllowlistJson;
}

/// The configuration parameters for the application.
///
/// These can either be passed on the command line, or pulled from environment variables.
/// The latter is preferred as environment variables are one of the recommended ways to
/// populate the Docker container
///
/// See `.env.sample` in document-storage-service root for details.
#[derive(conation_config::MacroConfig)]
// #[conation_config::from_ref_all]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub struct Config {
    #[allow(dead_code)]
    pub base_url: BaseUrl,
    /// The connection URL for the Postgres database this application should use.
    pub database_url: DatabaseUrl,
    /// The Redis URI for the Redis this application should use.
    pub redis_uri: RedisUri,
    /// FusionAuth API key secret name
    pub fusionauth_api_key_secret_key: FusionAuthApiSecretKey,
    /// FusionAuth client id
    pub fusionauth_client_id: FusionAuthClientId,
    /// FusionAuth client secret key
    pub fusionauth_client_secret_key: FusionAuthClientSecretKey,
    /// FusionAuth base url
    pub fusionauth_base_url: FusionAuthBaseUrl,
    /// Browser-reachable FusionAuth URL. Falls back to the API base URL when unset.
    pub fusionauth_public_url: FusionAuthPublicUrl,
    /// FusionAuth oauth redirect uri
    pub fusionauth_oauth_redirect_uri: FusionAuthOauthRedirectUri,
    /// Optional override for the authentication mail sender.
    pub auth_sender_email: AuthSenderEmail,
    /// Optional override for the support mailbox shown in mail content.
    pub support_email: SupportEmail,
    /// Google client id
    pub google_client_id: GoogleClientId,
    /// Google client secret key
    pub google_client_secret_key: GoogleClientSecretKey,
    /// Microsoft OAuth client ID.
    pub microsoft_client_id: MicrosoftClientId,
    /// Microsoft OAuth client secret.
    pub microsoft_client_secret: MicrosoftClientSecret,
    /// Microsoft Entra tenant ID.
    pub microsoft_tenant_id: MicrosoftTenantId,
    /// KMS key used to encrypt Microsoft refresh-token data keys.
    pub microsoft_token_kms_key_id: MicrosoftTokenKmsKeyId,
    /// KMS key used to encrypt users' Cursor API keys. Required in practice —
    /// read through [`Config::cursor_api_key_kms_key_id`], which refuses an
    /// absent or blank value at startup.
    pub cursor_api_key_kms_key_id: CursorApiKeyKmsKeyId,
    /// Stripe secret key
    pub stripe_secret_key: StripeSecretKey,
    /// The port to listen for HTTP requests on.
    #[conation_config_default(8080)]
    pub port: usize,
    /// The environment we are in
    #[conation_config_default(Environment::new_or_prod())]
    pub environment: Environment,
    /// The internal auth key used by other services
    pub service_internal_auth_key: ServiceInternalAuthKey,
    /// The github client id
    pub github_client_id: GithubClientId,
    /// The github client secret
    pub github_client_secret: GithubClientSecret,
    /// The github idp id
    pub github_idp_id: GithubIdpId,
    /// GA4 Measurement ID (optional, e.g., "G-XXXXXXXXXX")
    pub ga_measurement_id: GaMeasurementId,
    /// GA4 Measurement Protocol API secret (optional)
    pub ga_api_secret: GaApiSecret,
    /// Meta Pixel ID (optional)
    pub meta_pixel_id: MetaPixelId,
    /// Meta Conversions API access token (optional)
    pub meta_access_token: MetaAccessToken,
    /// Meta test event code for testing (optional)
    pub meta_test_event_code: MetaTestEventCode,
    /// PostHog API key (optional)
    pub posthog_api_key: PosthogApiKey,
    /// PostHog host (optional)
    pub posthog_host: PosthogHost,
    /// Loops API key (optional). When set, Macro sign-ups are added to our
    /// Loops audience.
    pub loops_api_key: LoopsApiKey,
    /// JSON array of exact email addresses allowed to sign up in Develop.
    pub development_signup_allowlist_json: DevelopmentSignupAllowlistJson,
    /// The stripe price id
    pub stripe_price_id: StripePriceId,
    /// The internal api key
    pub internal_api_key: InternalApiKey,
    /// Comma-separated Kafka bootstrap servers for the macro event broker.
    pub kafka_brokers: KafkaBrokers,
    /// Whether Gmail link consent requests the Google Calendar scope. Off by
    /// default so deployed environments don't ask users for a scope the
    /// calendar feature isn't using yet.
    #[conation_config_default(false)]
    pub calendar_scope_enabled: bool,
}

/// Complete Microsoft OAuth credentials used to enable Outlook account linking.
pub(crate) struct MicrosoftCredentials {
    pub(crate) client_id: String,
    pub(crate) client_secret: String,
    pub(crate) tenant_id: String,
    pub(crate) token_kms_key_id: String,
}

/// Complete Google OAuth credentials used to enable Gmail account linking.
pub(crate) struct GoogleCredentials {
    pub(crate) client_id: String,
    pub(crate) client_secret: String,
}

/// Complete legacy Stripe credentials.
///
/// They remain parseable for a future payment-required policy, but free
/// Conation deployments deliberately do not read or validate them.
pub(crate) struct StripeCredentials {
    pub(crate) secret_key: String,
    pub(crate) price_id: String,
}

const DEFAULT_AUTH_SENDER_EMAIL: &str = "auth@conation.dev";
const DEFAULT_SUPPORT_EMAIL: &str = "pythia@conation.dev";
// Keep this in parity with local FusionAuth kickstart: a no-Doppler value can
// name a secret but is not itself a Google OAuth client secret.
const GOOGLE_WEB_CLIENT_SECRET_PREFIX: &str = "GOCSPX-";

/// Validated operator-owned identities used by outbound authentication mail.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct MailIdentity {
    pub(crate) auth_sender_email: String,
    pub(crate) support_email: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let config = conation_config::ConfigLoader::load::<Config>()
            .context("failed to load authentication service config")?;
        validate_public_url_config(
            config.base_url.as_ref(),
            config.fusionauth_oauth_redirect_uri.as_ref(),
            config.fusionauth_public_url.value(),
        )?;
        Ok(config)
    }

    /// The KMS key that encrypts Cursor API keys.
    ///
    /// # Errors
    /// If it is unset or blank. There is no "this deployment does not accept
    /// Cursor keys" mode to fall back to: registering a key is a plain
    /// feature of the settings surface, and a service that cannot encrypt one
    /// should fail at startup rather than at the first user who tries.
    pub(crate) fn cursor_api_key_kms_key_id(&self) -> anyhow::Result<String> {
        // `MacroConfig` will not see a Pulumi-injected process env var once
        // Doppler's `APP_SECRETS_JSON` is present. Re-read through the env-var
        // type, which does fall back to process env.
        let from_process_env = CursorApiKeyKmsKeyId::new();
        resolve_cursor_api_key_kms_key_id(
            &self.cursor_api_key_kms_key_id,
            from_process_env
                .as_ref()
                .and_then(CursorApiKeyKmsKeyId::value),
        )
    }

    /// Resolves Microsoft credentials, enforcing that all values are configured together.
    pub(crate) fn microsoft_credentials(&self) -> anyhow::Result<Option<MicrosoftCredentials>> {
        resolve_microsoft_credentials(
            &self.microsoft_client_id,
            &self.microsoft_client_secret,
            &self.microsoft_tenant_id,
            &self.microsoft_token_kms_key_id,
        )
    }

    /// Resolves Google OAuth credentials, enforcing that both values are configured together.
    pub(crate) fn google_credentials(&self) -> anyhow::Result<Option<GoogleCredentials>> {
        resolve_google_credentials(
            self.google_client_id.value(),
            self.google_client_secret_key.value(),
        )
    }

    /// Resolves legacy Stripe credentials when hosted billing is permitted by policy.
    ///
    /// Free Conation deployments ignore the values entirely, including an
    /// incomplete legacy pair. A future payment-required policy retains the
    /// pair validation before it can enable a checkout surface.
    pub(crate) fn stripe_credentials(&self) -> anyhow::Result<Option<StripeCredentials>> {
        resolve_stripe_billing_credentials(
            self.environment,
            self.stripe_secret_key.value(),
            self.stripe_price_id.value(),
        )
    }

    /// Resolves and validates the sender and support mailboxes.
    pub(crate) fn mail_identity(&self) -> anyhow::Result<MailIdentity> {
        resolve_mail_identity(self.auth_sender_email.value(), self.support_email.value())
    }

    /// Resolves the signup policy for the configured environment.
    pub(crate) fn signup_policy(&self) -> anyhow::Result<SignupPolicy> {
        self.signup_policy_for_environment(self.environment)
    }

    /// Resolves the signup policy for an explicit environment.
    pub(crate) fn signup_policy_for_environment(
        &self,
        environment: Environment,
    ) -> anyhow::Result<SignupPolicy> {
        resolve_signup_policy(environment, &self.development_signup_allowlist_json)
    }
}

fn resolve_signup_policy(
    environment: Environment,
    development_signup_allowlist_json: &DevelopmentSignupAllowlistJson,
) -> anyhow::Result<SignupPolicy> {
    match environment {
        Environment::Production | Environment::Local => Ok(SignupPolicy::allow_all()),
        Environment::Develop => {
            let raw_allowlist = nonblank_value(development_signup_allowlist_json.value())
                .context("DEVELOPMENT_SIGNUP_ALLOWLIST_JSON is required in Develop")?;
            SignupPolicy::from_allowlist_json(raw_allowlist)
                .context("DEVELOPMENT_SIGNUP_ALLOWLIST_JSON is invalid")
        }
    }
}

fn resolve_mail_identity(

    auth_sender_email: Option<&str>,
    support_email: Option<&str>,
) -> anyhow::Result<MailIdentity> {
    Ok(MailIdentity {
        auth_sender_email: resolve_mailbox(
            "AUTH_SENDER_EMAIL",
            auth_sender_email,
            DEFAULT_AUTH_SENDER_EMAIL,
        )?,
        support_email: resolve_mailbox("SUPPORT_EMAIL", support_email, DEFAULT_SUPPORT_EMAIL)?,
    })
}

fn resolve_mailbox(name: &str, configured: Option<&str>, default: &str) -> anyhow::Result<String> {
    let value = match configured {
        Some(value) if !value.trim().is_empty() => value.trim(),
        Some(_) => anyhow::bail!("{name} must not be blank"),
        None => default,
    };

    if !email_validator::is_valid_email(value) {
        anyhow::bail!("{name} must be a valid email address");
    }

    Ok(value.to_ascii_lowercase())
}

fn parse_public_http_url(name: &str, value: &str) -> anyhow::Result<Url> {
    let url = Url::parse(value).with_context(|| format!("{name} must be an absolute URL"))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        anyhow::bail!(
            "{name} must contain an http(s) scheme, host, optional port, and optional path only"
        );
    }
    Ok(url)
}

fn validate_public_url_config(
    base_url: &str,
    fusionauth_oauth_redirect_uri: &str,
    fusionauth_public_url: Option<&str>,
) -> anyhow::Result<()> {
    let base_url = parse_public_http_url("BASE_URL", base_url)?;
    let redirect_url = parse_public_http_url(
        "FUSIONAUTH_OAUTH_REDIRECT_URI",
        fusionauth_oauth_redirect_uri,
    )?;
    let expected_redirect = format!("{}/oauth/redirect", base_url.as_str().trim_end_matches('/'));
    if redirect_url.as_str() != expected_redirect {
        anyhow::bail!(
            "FUSIONAUTH_OAUTH_REDIRECT_URI must equal BASE_URL + /oauth/redirect (expected {expected_redirect})"
        );
    }

    if let Some(public_url) = nonblank_value(fusionauth_public_url) {
        parse_public_http_url("FUSIONAUTH_PUBLIC_URL", public_url)?;
    }

    Ok(())
}

fn resolve_microsoft_credentials(
    client_id: &MicrosoftClientId,
    client_secret: &MicrosoftClientSecret,
    tenant_id: &MicrosoftTenantId,
    token_kms_key_id: &MicrosoftTokenKmsKeyId,
) -> anyhow::Result<Option<MicrosoftCredentials>> {
    let client_id = nonblank_value(client_id.value());
    let client_secret = nonblank_value(client_secret.value());
    let tenant_id = nonblank_value(tenant_id.value());
    let token_kms_key_id = nonblank_value(token_kms_key_id.value());

    match (client_id, client_secret, tenant_id) {
        (None, None, None) => Ok(None),
        (Some(client_id), Some(client_secret), Some(tenant_id)) => {
            let token_kms_key_id = token_kms_key_id.context(
                "MICROSOFT_TOKEN_KMS_KEY_ID must be set to a nonblank value when Microsoft OAuth is enabled",
            )?;
            Ok(Some(MicrosoftCredentials {
                client_id: client_id.to_owned(),
                client_secret: client_secret.to_owned(),
                tenant_id: tenant_id.to_owned(),
                token_kms_key_id: token_kms_key_id.to_owned(),
            }))
        }
        _ => anyhow::bail!(
            "MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_TENANT_ID must all be set to nonblank values or all be unset"
        ),
    }
}

fn resolve_google_credentials(
    client_id: Option<&str>,
    client_secret: Option<&str>,
) -> anyhow::Result<Option<GoogleCredentials>> {
    resolve_credentials_pair(
        "GOOGLE_CLIENT_ID",
        client_id,
        "GOOGLE_CLIENT_SECRET_KEY",
        client_secret,
    )
    .map(|credentials| {
        credentials.and_then(|(client_id, client_secret)| {
            client_secret
                .starts_with(GOOGLE_WEB_CLIENT_SECRET_PREFIX)
                .then(|| GoogleCredentials {
                    client_id: client_id.to_owned(),
                    client_secret: client_secret.to_owned(),
                })
        })
    })
}

fn resolve_stripe_credentials(
    secret_key: Option<&str>,
    price_id: Option<&str>,
) -> anyhow::Result<Option<StripeCredentials>> {
    resolve_credentials_pair("STRIPE_SECRET_KEY", secret_key, "STRIPE_PRICE_ID", price_id).map(
        |credentials| {
            credentials.map(|(secret_key, price_id)| StripeCredentials {
                secret_key: secret_key.to_owned(),
                price_id: price_id.to_owned(),
            })
        },
    )
}

fn resolve_stripe_billing_credentials(
    environment: Environment,
    secret_key: Option<&str>,
    price_id: Option<&str>,
) -> anyhow::Result<Option<StripeCredentials>> {
    if !CONATION_ACCESS_POLICY.requires_payment_for_features() {
        return Ok(None);
    }

    let credentials = resolve_stripe_credentials(secret_key, price_id)?;
    Ok(credentials
        .filter(|credentials| stripe_billing_is_enabled_for_environment(environment, credentials)))
}

fn stripe_billing_is_enabled_for_environment(
    environment: Environment,
    credentials: &StripeCredentials,
) -> bool {
    CONATION_ACCESS_POLICY.requires_payment_for_features()
        && stripe_credentials_are_usable_for_environment(environment, credentials)
}

fn stripe_credentials_are_usable_for_environment(
    environment: Environment,
    credentials: &StripeCredentials,
) -> bool {
    match environment {
        // `run_local --no-doppler` provides a non-secret placeholder so the
        // process can start. Only genuine Stripe API keys would be usable
        // locally if a future product policy deliberately enabled billing.
        Environment::Local => {
            credentials.secret_key.starts_with("sk_") || credentials.secret_key.starts_with("rk_")
        }
        Environment::Production | Environment::Develop => true,
    }
}

fn resolve_credentials_pair<'a>(
    first_name: &str,
    first: Option<&'a str>,
    second_name: &str,
    second: Option<&'a str>,
) -> anyhow::Result<Option<(&'a str, &'a str)>> {
    match (nonblank_value(first), nonblank_value(second)) {
        (None, None) => Ok(None),
        (Some(first), Some(second)) => Ok(Some((first, second))),
        _ => anyhow::bail!(
            "{first_name} and {second_name} must both be set to nonblank values or both be unset"
        ),
    }
}

fn nonblank_value(value: Option<&str>) -> Option<&str> {
    value.filter(|value| !value.trim().is_empty())
}

/// Pulumi injects `CURSOR_API_KEY_KMS_KEY_ID` as a container env var, not
/// through Doppler. ECS always has `APP_SECRETS_JSON`, and `MacroConfig` will
/// not look at process env once that blob is present, so the field on `Config`
/// is unset in deployed environments. `CursorApiKeyKmsKeyId::new()` still
/// falls back to process env, which is what `process_env` is.
fn resolve_cursor_api_key_kms_key_id(
    configured: &CursorApiKeyKmsKeyId,
    process_env: Option<&str>,
) -> anyhow::Result<String> {
    nonblank_value(configured.value())
        .or_else(|| nonblank_value(process_env))
        .map(str::to_owned)
        .context("CURSOR_API_KEY_KMS_KEY_ID is required")
}

#[cfg(test)]
mod test;
