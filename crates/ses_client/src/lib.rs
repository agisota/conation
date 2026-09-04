mod invite_user;
mod send_email;
mod send_email_smtp;

#[cfg(test)]
mod test;

use anyhow::Context;
use aws_sdk_sesv2 as ses;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, Tokio1Executor};
#[allow(unused_imports)]
use mockall::automock;

conation_env_var::maybe_env_vars! {
    struct SmtpHost;
    struct SmtpPort;
    struct SmtpUsername;
    struct SmtpPassword;
}

#[cfg(test)]
pub use MockSesClient as Ses;
#[cfg(not(test))]
pub use SesClient as Ses;

/// How outbound mail is delivered.
///
/// SMTP transports are built during startup so invalid relay configuration
/// cannot defer a failure until the first email send.
#[derive(Clone)]
enum Transport {
    Ses(ses::Client),
    Smtp(AsyncSmtpTransport<Tokio1Executor>),
}

impl Transport {
    fn name(&self) -> &'static str {
        match self {
            Self::Ses(_) => "ses",
            Self::Smtp(_) => "smtp",
        }
    }
}

#[derive(Clone)]
pub struct SesClient {
    transport: Transport,
    invite_email: Option<String>,
    invite_url: String,
    support_email: String,
}

impl std::fmt::Debug for SesClient {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SesClient")
            .field("transport", &self.transport.name())
            .field("invite_email", &self.invite_email)
            .field("invite_url", &self.invite_url)
            .field("support_email", &self.support_email)
            .finish()
    }
}

enum SmtpConfig {
    Mailpit {
        host: String,
        port: u16,
    },
    Relay {
        host: String,
        port: u16,
        username: String,
        password: String,
    },
}

impl SmtpConfig {
    fn from_env(is_local: bool) -> anyhow::Result<Option<Self>> {
        let host = SmtpHost::new();
        let port = SmtpPort::new();
        let username = SmtpUsername::new();
        let password = SmtpPassword::new();

        Self::from_values(
            is_local,
            host.as_ref().and_then(SmtpHost::value),
            port.as_ref().and_then(SmtpPort::value),
            username.as_ref().and_then(SmtpUsername::value),
            password.as_ref().and_then(SmtpPassword::value),
        )
    }

    fn from_values(
        is_local: bool,
        host: Option<&str>,
        port: Option<&str>,
        username: Option<&str>,
        password: Option<&str>,
    ) -> anyhow::Result<Option<Self>> {
        let Some(host) = host else {
            return Ok(None);
        };
        let host = required_smtp_value("SMTP_HOST", Some(host))?;

        if is_local {
            return Ok(Some(Self::Mailpit {
                host,
                port: port.map_or(Ok(1025), |port| required_smtp_port(Some(port)))?,
            }));
        }

        Ok(Some(Self::Relay {
            host: required_starttls_hostname(host)?,
            port: required_smtp_port(port)?,
            username: required_smtp_credential("SMTP_USERNAME", username)?,
            password: required_smtp_credential("SMTP_PASSWORD", password)?,
        }))
    }

    fn into_mailer(self) -> anyhow::Result<AsyncSmtpTransport<Tokio1Executor>> {
        match self {
            Self::Mailpit { host, port } => Ok(
                AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(host)
                    .port(port)
                    .build(),
            ),
            Self::Relay {
                host,
                port,
                username,
                password,
            } => Ok(AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&host)
                .context("creating TLS SMTP relay transport")?
                .port(port)
                .credentials(Credentials::new(username, password))
                .build()),
        }
    }
}

fn required_smtp_value(name: &str, value: Option<&str>) -> anyhow::Result<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .with_context(|| format!("{name} is required and must be nonblank when SMTP is selected"))
}

fn required_starttls_hostname(host: String) -> anyhow::Result<String> {
    if host.parse::<std::net::IpAddr>().is_err() && host.contains(':') {
        anyhow::bail!(
            "SMTP_HOST must be a hostname without a port; configure the port with SMTP_PORT"
        );
    }

    Ok(host)
}

fn required_smtp_credential(name: &str, value: Option<&str>) -> anyhow::Result<String> {
    value
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
        .with_context(|| format!("{name} is required and must be nonblank when SMTP is selected"))
}

fn required_smtp_port(value: Option<&str>) -> anyhow::Result<u16> {
    let value = required_smtp_value("SMTP_PORT", value)?;
    let port = value
        .parse::<u16>()
        .map_err(|_| anyhow::anyhow!("SMTP_PORT must be an integer from 1 through 65535"))?;

    if port == 0 {
        anyhow::bail!("SMTP_PORT must be an integer from 1 through 65535");
    }

    Ok(port)
}

#[cfg_attr(test, automock)]
impl SesClient {
    /// Construct outbound delivery from environment configuration.
    ///
    /// `SMTP_HOST` selects SMTP. In `local`, that creates a plaintext Mailpit
    /// transport and defaults `SMTP_PORT` to `1025`. In every other
    /// environment, SMTP requires a nonblank `SMTP_PORT`, `SMTP_USERNAME`, and
    /// `SMTP_PASSWORD`, and uses authenticated mandatory STARTTLS.
    ///
    /// # Errors
    ///
    /// Returns an error for selected SMTP with missing or invalid settings, or
    /// when Lettre rejects the TLS relay hostname.
    pub fn from_env(inner: ses::Client, environment: &str) -> anyhow::Result<Self> {
        let transport = match SmtpConfig::from_env(environment == "local")? {
            Some(config) => Transport::Smtp(config.into_mailer()?),
            None => Transport::Ses(inner),
        };

        Ok(Self {
            transport,
            invite_email: None,
            invite_url: "https://conation.dev/app/?login=true".to_owned(),
            support_email: "pythia@conation.dev".to_owned(),
        })
    }

    /// Sets the invite_email
    pub fn invite_email(mut self, invite_email: &str) -> Self {
        self.invite_email = Some(invite_email.to_string());
        self
    }

    /// Sets the browser-facing invitation URL.
    pub fn invite_url(mut self, invite_url: &str) -> Self {
        self.invite_url = invite_url.to_owned();
        self
    }

    /// Sets the operator-owned support address rendered into invitations.
    pub fn support_email(mut self, support_email: &str) -> Self {
        self.support_email = support_email.to_owned();
        self
    }

    /// Sends an invitation email to the user
    #[tracing::instrument(skip(self))]
    pub async fn invite_user(&self, organization_name: &str, email: &str) -> anyhow::Result<()> {
        let Some(invite_email) = self.invite_email.clone() else {
            return Err(anyhow::anyhow!("invite_email is not set"));
        };
        let html = invite_user::build_user_invite_message(
            organization_name,
            &self.invite_url,
            &self.support_email,
        );
        self.deliver(
            &invite_email,
            email,
            invite_user::INVITE_USER_SUBJECT,
            &html,
        )
        .await
    }

    /// Sends an email to the user
    #[tracing::instrument(skip(self, subject, content))]
    pub async fn send_email(
        &self,
        from_email: &str,
        to_email: &str,
        subject: &str,
        content: &str,
    ) -> anyhow::Result<()> {
        self.deliver(from_email, to_email, subject, content).await
    }
}

impl SesClient {
    /// Route a fully-rendered HTML email through the active transport.
    async fn deliver(
        &self,
        from_email: &str,
        to_email: &str,
        subject: &str,
        content: &str,
    ) -> anyhow::Result<()> {
        match &self.transport {
            Transport::Ses(client) => {
                send_email::send_email(client, from_email, to_email, subject, content).await
            }
            Transport::Smtp(mailer) => {
                send_email_smtp::send_email_smtp(mailer, from_email, to_email, subject, content)
                    .await
            }
        }
    }
}
