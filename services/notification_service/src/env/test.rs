use super::*;
use conation_env::Environment;

#[test]
fn local_environment_selects_mailpit_smtp_mode() {
    assert_eq!(smtp_environment_slug(Environment::Local), "local");
    assert_eq!(smtp_environment_slug(Environment::Develop), "dev");
    assert_eq!(smtp_environment_slug(Environment::Production), "prod");
}

#[test]
fn sender_address_uses_environment_local_part() {
    assert_eq!(
        sender_address_for(Environment::Production, "conation.dev").unwrap(),
        "no-reply@conation.dev"
    );
    assert_eq!(
        sender_address_for(Environment::Develop, "conation.dev").unwrap(),
        "no-reply-dev@conation.dev"
    );
    assert_eq!(
        sender_address_for(Environment::Local, "conation.dev").unwrap(),
        "no-reply-local@conation.dev"
    );
}

#[test]
fn sender_address_rejects_mailbox_or_blank_base() {
    for base in ["", "  ", "no-reply@conation.dev", "conation.dev extra"] {
        sender_address_for(Environment::Local, base)
            .expect_err("mailbox or blank SENDER_BASE_ADDRESS must fail at startup");
    }
}
