use super::*;
use crate::domain::models::queue_message::EmailContent;
use std::sync::Mutex;

fn assert_email_service_ops<T: EmailServiceOps>() {}

#[test]
fn configured_ses_client_satisfies_notification_email_contract() {
    assert_email_service_ops::<ses_client::SesClient>();
}

struct RecordingMailer {
    from: Mutex<Option<String>>,
    to: Mutex<Option<String>>,
    subject: Mutex<Option<String>>,
    body: Mutex<Option<String>>,
}

impl RecordingMailer {
    fn new() -> Self {
        Self {
            from: Mutex::new(None),
            to: Mutex::new(None),
            subject: Mutex::new(None),
            body: Mutex::new(None),
        }
    }
}

impl EmailServiceOps for RecordingMailer {
    async fn send_email(
        &self,
        from_email: &str,
        to_email: &str,
        subject: &str,
        html_body: &str,
    ) -> Result<(), Report> {
        *self.from.lock().expect("from lock") = Some(from_email.to_owned());
        *self.to.lock().expect("to lock") = Some(to_email.to_owned());
        *self.subject.lock().expect("subject lock") = Some(subject.to_owned());
        *self.body.lock().expect("body lock") = Some(html_body.to_owned());
        Ok(())
    }
}

struct FailingMailer;

impl EmailServiceOps for FailingMailer {
    async fn send_email(
        &self,
        _from_email: &str,
        _to_email: &str,
        _subject: &str,
        _html_body: &str,
    ) -> Result<(), Report> {
        Err(rootcause::report!("smtp relay refused"))
    }
}

#[tokio::test]
async fn adapter_forwards_digest_fields_through_smtp_ops() {
    let mailer = RecordingMailer::new();
    let adapter = EmailAdapter::new(mailer, "no-reply-local@conation.dev".to_owned());
    let recipient = MacroUserIdStr::try_from_email("digest.user@example.com").unwrap();
    let content = EmailContent {
        subject: "Digest".to_owned(),
        body: "<p>hello</p>".to_owned(),
    };

    EmailSender::send_email(&adapter, recipient, &content)
        .await
        .expect("adapter send");

    assert_eq!(
        adapter
            .email_service
            .from
            .lock()
            .expect("from lock")
            .as_deref(),
        Some("no-reply-local@conation.dev")
    );
    assert_eq!(
        adapter.email_service.to.lock().expect("to lock").as_deref(),
        Some("digest.user@example.com")
    );
    assert_eq!(
        adapter
            .email_service
            .subject
            .lock()
            .expect("subject lock")
            .as_deref(),
        Some("Digest")
    );
    assert_eq!(
        adapter
            .email_service
            .body
            .lock()
            .expect("body lock")
            .as_deref(),
        Some("<p>hello</p>")
    );
}

#[tokio::test]
async fn adapter_surfaces_smtp_transport_errors() {
    let adapter = EmailAdapter::new(FailingMailer, "no-reply@conation.dev".to_owned());
    let recipient = MacroUserIdStr::try_from_email("digest.user@example.com").unwrap();
    let content = EmailContent {
        subject: "Digest".to_owned(),
        body: "<p>hello</p>".to_owned(),
    };

    let error = EmailSender::send_email(&adapter, recipient, &content)
        .await
        .expect_err("smtp failure must surface");

    assert!(error.to_string().contains("smtp relay refused"));
}
