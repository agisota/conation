use super::*;

#[test]
fn preserves_ses_when_smtp_is_not_selected() {
    let config = SmtpConfig::from_values(false, None, None, None, None).unwrap();

    assert!(config.is_none());
}

#[test]
fn uses_local_mailpit_with_the_default_port() {
    let config = SmtpConfig::from_values(true, Some("mailpit"), None, None, None).unwrap();

    match config {
        Some(SmtpConfig::Mailpit { host, port }) => {
            assert_eq!(host, "mailpit");
            assert_eq!(port, 1025);
        }
        Some(SmtpConfig::Relay { .. }) | None => panic!("expected local Mailpit transport"),
    }
}

#[test]
fn preserves_an_explicit_local_mailpit_port() {
    let config = SmtpConfig::from_values(true, Some("mailpit"), Some("2525"), None, None).unwrap();

    match config {
        Some(SmtpConfig::Mailpit { host, port }) => {
            assert_eq!(host, "mailpit");
            assert_eq!(port, 2525);
        }
        Some(SmtpConfig::Relay { .. }) | None => panic!("expected local Mailpit transport"),
    }
}

#[test]
fn selects_authenticated_starttls_relay_outside_local() {
    let config = SmtpConfig::from_values(
        false,
        Some("smtp.example.test"),
        Some("587"),
        Some("relay-user"),
        Some("relay-password"),
    )
    .unwrap();

    match config {
        Some(SmtpConfig::Relay {
            host,
            port,
            username,
            password,
        }) => {
            assert_eq!(host, "smtp.example.test");
            assert_eq!(port, 587);
            assert_eq!(username, "relay-user");
            assert_eq!(password, "relay-password");
        }
        Some(SmtpConfig::Mailpit { .. }) | None => panic!("expected authenticated TLS relay"),
    }
}

#[test]
fn rejects_nonlocal_relay_host_with_port() {
    let error = SmtpConfig::from_values(
        false,
        Some("smtp.example.test:587"),
        Some("587"),
        Some("relay-user"),
        Some("relay-password"),
    )
    .err()
    .expect("SMTP_HOST with a port must be rejected");

    assert!(error.to_string().contains("SMTP_HOST"));
}

#[test]
fn preserves_nonblank_relay_credential_whitespace() {
    let config = SmtpConfig::from_values(
        false,
        Some("smtp.example.test"),
        Some("587"),
        Some(" relay-user "),
        Some("\trelay-password\n"),
    )
    .unwrap();

    match config {
        Some(SmtpConfig::Relay {
            username, password, ..
        }) => {
            assert_eq!(username, " relay-user ");
            assert_eq!(password, "\trelay-password\n");
        }
        Some(SmtpConfig::Mailpit { .. }) | None => panic!("expected authenticated TLS relay"),
    }
}

#[test]
fn rejects_whitespace_only_nonlocal_relay_credentials() {
    for (username, password, required_variable) in [
        (Some(" \t"), Some("relay-password"), "SMTP_USERNAME"),
        (Some("relay-user"), Some("\r\n"), "SMTP_PASSWORD"),
    ] {
        let error = SmtpConfig::from_values(
            false,
            Some("smtp.example.test"),
            Some("587"),
            username,
            password,
        )
        .err()
        .expect("whitespace-only relay credentials must be rejected");

        assert!(error.to_string().contains(required_variable));
    }
}

#[test]
fn rejects_incomplete_nonlocal_relay_configuration() {
    for (port, username, password, required_variable) in [
        (
            None,
            Some("relay-user"),
            Some("relay-password"),
            "SMTP_PORT",
        ),
        (Some("587"), None, Some("relay-password"), "SMTP_USERNAME"),
        (Some("587"), Some("relay-user"), None, "SMTP_PASSWORD"),
    ] {
        let error =
            SmtpConfig::from_values(false, Some("smtp.example.test"), port, username, password)
                .err()
                .expect("incomplete selected relay must be rejected");

        assert!(error.to_string().contains(required_variable));
    }
}

#[test]
fn rejects_blank_smtp_host() {
    let error = SmtpConfig::from_values(
        false,
        Some("  "),
        Some("587"),
        Some("relay-user"),
        Some("relay-password"),
    )
    .err()
    .expect("blank SMTP_HOST must be rejected");

    assert!(error.to_string().contains("SMTP_HOST"));
}

#[test]
fn rejects_zero_or_non_numeric_nonlocal_relay_ports() {
    for port in ["0", "not-a-port"] {
        let error = SmtpConfig::from_values(
            false,
            Some("smtp.example.test"),
            Some(port),
            Some("relay-user"),
            Some("relay-password"),
        )
        .err()
        .expect("invalid SMTP_PORT must be rejected");

        assert!(error.to_string().contains("SMTP_PORT"));
    }
}
