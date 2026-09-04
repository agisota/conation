use super::*;

fn assert_email_service_ops<T: EmailServiceOps>() {}

#[test]
fn configured_ses_client_satisfies_notification_email_contract() {
    assert_email_service_ops::<ses_client::SesClient>();
}
