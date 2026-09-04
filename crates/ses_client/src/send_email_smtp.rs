//! SMTP delivery through a transport configured during service startup.

use anyhow::{Context, Result};
use lettre::message::Mailbox;
use lettre::message::header::ContentType;
use lettre::{Address, AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

/// Send an HTML email through an already configured SMTP transport.
pub async fn send_email_smtp(
    mailer: &AsyncSmtpTransport<Tokio1Executor>,
    from_email: &str,
    to_email: &str,
    subject: &str,
    content: &str,
) -> Result<()> {
    let from = mailbox(from_email).context("parsing from address")?;
    let to = mailbox(to_email).context("parsing to address")?;

    let email = Message::builder()
        .from(from)
        .to(to)
        .subject(subject)
        .header(ContentType::TEXT_HTML)
        .body(content.to_string())
        .context("building SMTP message")?;

    mailer.send(email).await.context("sending via SMTP")?;
    Ok(())
}

fn mailbox(email: &str) -> Result<Mailbox> {
    let address: Address = email
        .parse()
        .with_context(|| format!("invalid email '{email}'"))?;
    Ok(Mailbox::new(None, address))
}
