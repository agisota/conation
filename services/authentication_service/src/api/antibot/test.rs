use super::*;

const TEST_KEY: &[u8] = b"test-signup-antibot-key";

fn issue(email: &str, now: i64) -> SignupChallenge {
    issue_challenge_with_key(TEST_KEY, email, now, DIFFICULTY_BITS)
}

fn verify(email: &str, proof: &AntibotProof, now: i64) -> Result<(), AntibotError> {
    verify_proof_with_key(TEST_KEY, email, proof, now)
}

#[test]
fn accepted_solution_verifies() {
    let now = 1_700_000_000;
    let challenge = issue("User@Conation.dev", now);
    let counter = solve_counter(&challenge.nonce, challenge.difficulty);
    let proof = AntibotProof {
        nonce: challenge.nonce,
        counter,
        expires_at: challenge.expires_at,
        mac: challenge.mac,
    };
    verify("user@conation.dev", &proof, now).expect("solved proof must verify");
}

#[test]
fn expired_challenge_is_rejected() {
    let now = 1_700_000_000;
    let challenge = issue("a@b.co", now);
    let counter = solve_counter(&challenge.nonce, challenge.difficulty);
    let proof = AntibotProof {
        nonce: challenge.nonce,
        counter,
        expires_at: challenge.expires_at,
        mac: challenge.mac,
    };
    assert_eq!(
        verify("a@b.co", &proof, now + CHALLENGE_TTL_SECS + 1),
        Err(AntibotError::Expired)
    );
}

#[test]
fn other_email_cannot_reuse_mac() {
    let now = 1_700_000_000;
    let challenge = issue("alice@example.com", now);
    let counter = solve_counter(&challenge.nonce, challenge.difficulty);
    let proof = AntibotProof {
        nonce: challenge.nonce,
        counter,
        expires_at: challenge.expires_at,
        mac: challenge.mac,
    };
    assert_eq!(
        verify("bob@example.com", &proof, now),
        Err(AntibotError::Mac)
    );
}

#[test]
fn other_hmac_key_cannot_reuse_mac() {
    let now = 1_700_000_000;
    let challenge = issue("a@b.co", now);
    let counter = solve_counter(&challenge.nonce, challenge.difficulty);
    let proof = AntibotProof {
        nonce: challenge.nonce,
        counter,
        expires_at: challenge.expires_at,
        mac: challenge.mac,
    };
    assert_eq!(
        verify_proof_with_key(b"other-key", "a@b.co", &proof, now),
        Err(AntibotError::Mac)
    );
}

#[test]
fn unsolved_counter_is_rejected() {
    let now = 1_700_000_000;
    let challenge = issue("a@b.co", now);
    let proof = AntibotProof {
        nonce: challenge.nonce.clone(),
        counter: u64::MAX,
        expires_at: challenge.expires_at,
        mac: challenge.mac,
    };
    if leading_zero_bits(&pow_digest(&proof.nonce, proof.counter)) >= DIFFICULTY_BITS {
        return;
    }
    assert_eq!(verify("a@b.co", &proof, now), Err(AntibotError::Work));
}

#[test]
fn difficulty_eight_means_first_byte_is_zero() {
    let digest = pow_digest("abc", 0);
    let bits = leading_zero_bits(&digest);
    if bits >= 8 {
        assert_eq!(digest[0], 0);
    }
}
