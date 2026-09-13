//! HMAC-signed proof-of-work for open signup.
//!
//! Existing passwordless logins skip this check. New FusionAuth accounts
//! must present a solved challenge so bulk mailbox signup is not free.

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

#[cfg(test)]
mod test;

/// Leading zero bits the client must produce in SHA-256(`nonce:counter`).
pub const DIFFICULTY_BITS: u32 = 8;
/// How long an issued challenge stays valid.
pub const CHALLENGE_TTL_SECS: i64 = 120;

const SIGNING_KEY: &[u8] = b"conation-signup-antibot-v1";

type HmacSha256 = Hmac<Sha256>;

/// Issued challenge returned to the browser.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
pub struct SignupChallenge {
    /// Random nonce the client hashes with a counter.
    pub nonce: String,
    /// Unix timestamp (seconds) after which the challenge is rejected.
    pub expires_at: i64,
    /// Required leading zero bits of SHA-256(`nonce:counter`).
    pub difficulty: u32,
    /// HMAC binding the challenge to the signup email.
    pub mac: String,
}

/// Client solution posted with passwordless signup.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
pub struct AntibotProof {
    /// Challenge nonce.
    pub nonce: String,
    /// Counter that satisfies the proof-of-work.
    pub counter: u64,
    /// Expiry copied from the challenge.
    pub expires_at: i64,
    /// HMAC copied from the challenge.
    pub mac: String,
}

/// Why a signup proof was rejected.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AntibotError {
    /// Proof missing on a new-account passwordless request.
    Missing,
    /// Challenge clock expired.
    Expired,
    /// HMAC does not match email/nonce/expiry/difficulty.
    Mac,
    /// Hash does not meet the difficulty.
    Work,
}

impl AntibotError {
    /// Stable machine-readable code for the 403 body.
    pub fn code(self) -> &'static str {
        match self {
            Self::Missing => "ANTIBOT_REQUIRED",
            Self::Expired => "ANTIBOT_EXPIRED",
            Self::Mac | Self::Work => "ANTIBOT_INVALID",
        }
    }
}

/// Issue a challenge bound to `email`.
pub fn issue_challenge(email: &str, now: i64) -> SignupChallenge {
    issue_challenge_with_difficulty(email, now, DIFFICULTY_BITS)
}

/// Issue a challenge at an explicit difficulty (tests).
pub fn issue_challenge_with_difficulty(email: &str, now: i64, difficulty: u32) -> SignupChallenge {
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let expires_at = now + CHALLENGE_TTL_SECS;
    let mac = mac_hex(email, &nonce, expires_at, difficulty);
    SignupChallenge {
        nonce,
        expires_at,
        difficulty,
        mac,
    }
}

/// Verify a solved challenge for `email`.
pub fn verify_proof(email: &str, proof: &AntibotProof, now: i64) -> Result<(), AntibotError> {
    if proof.expires_at < now {
        return Err(AntibotError::Expired);
    }
    let expected = mac_hex(email, &proof.nonce, proof.expires_at, DIFFICULTY_BITS);
    if !constant_time_eq(&expected, &proof.mac) {
        return Err(AntibotError::Mac);
    }
    if leading_zero_bits(&pow_digest(&proof.nonce, proof.counter)) < DIFFICULTY_BITS {
        return Err(AntibotError::Work);
    }
    Ok(())
}

/// Convert a model proof into the local proof type.
pub fn proof_from_request(
    proof: &model::authentication::login::request::AntibotProof,
) -> AntibotProof {
    AntibotProof {
        nonce: proof.nonce.clone(),
        counter: proof.counter,
        expires_at: proof.expires_at,
        mac: proof.mac.clone(),
    }
}

/// SHA-256 digest of `nonce:counter`.
pub fn pow_digest(nonce: &str, counter: u64) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(nonce.as_bytes());
    hasher.update(b":");
    hasher.update(counter.to_string().as_bytes());
    hasher.finalize().into()
}

/// Count leading zero bits in a digest.
pub fn leading_zero_bits(digest: &[u8]) -> u32 {
    let mut bits = 0;
    for byte in digest {
        if *byte == 0 {
            bits += 8;
            continue;
        }
        bits += u32::from(byte.leading_zeros());
        break;
    }
    bits
}

/// Brute-force a valid counter (tests and local solvers).
pub fn solve_counter(nonce: &str, difficulty: u32) -> u64 {
    let mut counter = 0_u64;
    loop {
        if leading_zero_bits(&pow_digest(nonce, counter)) >= difficulty {
            return counter;
        }
        counter += 1;
    }
}

fn mac_hex(email: &str, nonce: &str, expires_at: i64, difficulty: u32) -> String {
    let mut mac = HmacSha256::new_from_slice(SIGNING_KEY).expect("HMAC-SHA256 accepts any key");
    mac.update(email.trim().to_ascii_lowercase().as_bytes());
    mac.update(b"|");
    mac.update(nonce.as_bytes());
    mac.update(b"|");
    mac.update(expires_at.to_string().as_bytes());
    mac.update(b"|");
    mac.update(difficulty.to_string().as_bytes());
    hex_encode(&mac.finalize().into_bytes())
}

fn hex_encode(bytes: impl AsRef<[u8]>) -> String {
    bytes
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.bytes()
        .zip(b.bytes())
        .fold(0_u8, |acc, (left, right)| acc | (left ^ right))
        == 0
}
