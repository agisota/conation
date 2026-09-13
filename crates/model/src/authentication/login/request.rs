use utoipa::ToSchema;

#[derive(serde::Serialize, serde::Deserialize, Debug, ToSchema)]
pub struct PasswordlessRequest {
    /// The email to initiate passwordless authentication for
    pub email: String,
    /// The redirect uri to redirect to after login
    pub redirect_uri: String,
    /// The referral code
    pub referral_code: Option<String>,
    /// Proof-of-work required when this email does not already have an account.
    #[serde(default)]
    pub antibot: Option<AntibotProof>,
}

/// HMAC-signed proof-of-work issued by `GET /login/signup-challenge`.
#[derive(serde::Serialize, serde::Deserialize, Debug, ToSchema)]
pub struct AntibotProof {
    /// Challenge nonce.
    pub nonce: String,
    /// Counter that satisfies SHA-256(`nonce:counter`) leading-zero bits.
    pub counter: u64,
    /// Unix expiry copied from the challenge.
    pub expires_at: i64,
    /// HMAC binding the challenge to the signup email.
    pub mac: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, ToSchema)]
pub struct PasswordRequest {
    /// The email to login with
    pub email: String,
    // The password to login with
    pub password: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, ToSchema)]
pub struct AppleLoginRequest {
    pub id_token: String,
    pub code: String,
}
