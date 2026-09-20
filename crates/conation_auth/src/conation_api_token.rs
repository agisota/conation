use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Context;
use base64::Engine as _;

#[cfg(test)]
mod test;

/// The expected JWT access token that is provided back from FusionAuth
#[derive(serde::Serialize, serde::Deserialize, Eq, PartialEq, Debug, Clone)]
pub struct ConationApiToken {
    /// The expiration time of the token
    pub exp: usize,
    /// The issuer of the token
    /// This is the fuisionauth domain
    pub iss: String,
    /// The root FusionAuth id of the user.
    pub fusion_user_id: String,
    /// The Conation user id of the user.
    #[serde(rename = "conation_user_id")]
    pub macro_user_id: String,
    /// The organization id for the user if they belong to one
    #[serde(rename = "conation_organization_id")]
    pub macro_organization_id: Option<i32>,
}

pub struct EncodeConationApiTokenArgs {
    /// The fusionauth id
    pub fusionauth_id: String,
    /// The macro user id
    pub macro_user_id: String,
    /// The organization id
    pub organization_id: Option<i32>,
    /// The issuer of the token
    pub issuer: String,
    /// The private key used to sign the token
    pub private_key: String,
    /// The token expiry duration in seconds
    pub expiry_seconds: usize,
}

/// Shape-only diagnostics for secret material. Never include key bytes.
fn secret_shape(s: &str) -> String {
    let begins_pem = s.trim_start().starts_with("-----BEGIN");
    let newline_count = s.chars().filter(|&c| c == '\n').count();
    let has_literal_escapes = s.contains("\\n") || s.contains("\\r");
    format!(
        "len={len}, begins_pem={begins_pem}, newlines={newline_count}, has_literal_escapes={has_literal_escapes}",
        len = s.len(),
    )
}

/// Build an RS256 [`jsonwebtoken::EncodingKey`] from deployed secret formats.
///
/// Accepts:
/// - PEM (`BEGIN RSA PRIVATE KEY` / `BEGIN PRIVATE KEY`) with real newlines
/// - PEM with literal `\n` / `\r\n` escapes (common from JSON / Secrets Manager / .env)
/// - Standard base64 wrapping a PEM blob or raw PKCS#1/PKCS#8 DER
pub fn rsa_encoding_key_from_secret(
    private_key: &str,
) -> anyhow::Result<jsonwebtoken::EncodingKey> {
    let trimmed = private_key.trim();

    if let Ok(key) = jsonwebtoken::EncodingKey::from_rsa_pem(trimmed.as_bytes()) {
        return Ok(key);
    }

    let unescaped = trimmed
        .replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\r", "\n");
    if unescaped.as_str() != trimmed {
        if let Ok(key) = jsonwebtoken::EncodingKey::from_rsa_pem(unescaped.as_bytes()) {
            return Ok(key);
        }
    }

    let compact: String = trimmed.chars().filter(|c| !c.is_whitespace()).collect();
    if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(compact.as_bytes()) {
        if let Ok(key) = jsonwebtoken::EncodingKey::from_rsa_pem(&decoded) {
            return Ok(key);
        }
        if let Ok(as_utf8) = std::str::from_utf8(&decoded) {
            let as_utf8 = as_utf8.trim();
            if let Ok(key) = jsonwebtoken::EncodingKey::from_rsa_pem(as_utf8.as_bytes()) {
                return Ok(key);
            }
            let unescaped_decoded = as_utf8
                .replace("\\r\\n", "\n")
                .replace("\\n", "\n")
                .replace("\\r", "\n");
            if let Ok(key) = jsonwebtoken::EncodingKey::from_rsa_pem(unescaped_decoded.as_bytes()) {
                return Ok(key);
            }
        }
        if let Ok(key) = jsonwebtoken::EncodingKey::from_rsa_der(&decoded) {
            return Ok(key);
        }
    }

    Err(anyhow::anyhow!(
        "failed to create encoding key (secret shape: {})",
        secret_shape(trimmed)
    ))
}

#[tracing::instrument(skip(args))]
pub fn encode_conation_api_token(args: EncodeConationApiTokenArgs) -> anyhow::Result<String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize;

    let claims = ConationApiToken {
        exp: now + args.expiry_seconds,
        iss: args.issuer.clone(),
        fusion_user_id: args.fusionauth_id.clone(),
        macro_user_id: args.macro_user_id.clone(),
        macro_organization_id: args.organization_id,
    };

    let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256);
    header.kid = Some("conation".to_string());

    let encoding_key =
        rsa_encoding_key_from_secret(&args.private_key).context("failed to create encoding key")?;

    let token = jsonwebtoken::encode(&header, &claims, &encoding_key)
        .context("failed to encode token")?;

    Ok(token)
}
