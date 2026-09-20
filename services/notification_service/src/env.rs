use crate::config::SenderBaseAddress;
use macro_env::Environment;
use std::sync::LazyLock;

#[cfg(test)]
mod test;

pub static SENDER_ADDRESS: LazyLock<String> = LazyLock::new(|| {
    // The SENDER_BASE_ADDRESS is part of the config so the service will fail without it, we can
    // safely expect it here. Use conation_config so APP_SECRETS_JSON is supported too.
    let sender_base_address = SenderBaseAddress::new()
        .expect("SENDER_BASE_ADDRESS must be provided via APP_SECRETS_JSON or env");

    sender_address_for(Environment::new_or_prod(), sender_base_address.as_ref())
        .expect("SENDER_BASE_ADDRESS must produce a valid RFC 5322 From address")
});

/// Build the notification digest From address for an environment.
///
/// `sender_base` is the domain only (`conation.dev`), not a mailbox. SMTP
/// delivery rejects malformed From/To at send time; fail at startup instead.
pub(crate) fn sender_address_for(
    environment: Environment,
    sender_base: &str,
) -> anyhow::Result<String> {
    let domain = sender_base.trim();
    if domain.is_empty() || domain.contains('@') || domain.contains(char::is_whitespace) {
        anyhow::bail!("SENDER_BASE_ADDRESS must be a hostname without a mailbox local-part");
    }

    let prefix = match environment {
        Environment::Production => "",
        Environment::Develop => "-dev",
        Environment::Local => "-local",
    };
    let address = format!("no-reply{prefix}@{domain}");
    if !is_rfc5322_mailbox(&address) {
        anyhow::bail!("SENDER_BASE_ADDRESS produced invalid From address {address}");
    }
    Ok(address)
}

pub(crate) fn is_rfc5322_mailbox(address: &str) -> bool {
    let Some((local, domain)) = address.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && !domain.is_empty()
        && !local.contains('@')
        && !domain.contains('@')
        && !address.contains(char::is_whitespace)
        && (domain.contains('.') || domain.eq_ignore_ascii_case("localhost"))
}

/// String passed to `ses_client::Ses::from_env`. Must stay `"local"` for the
/// plaintext Mailpit transport; any other value requires authenticated STARTTLS.
pub(crate) fn smtp_environment_slug(environment: Environment) -> String {
    environment.to_string()
}
