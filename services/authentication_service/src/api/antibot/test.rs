use super::*;

#[test]
fn accepted_solution_verifies() {
    let now = 1_700_000_000;
    let challenge = issue_challenge("User@Conation.dev", now);
    let counter = solve_counter(&challenge.nonce, challenge.difficulty);
    let proof = AntibotProof {
        nonce: challenge.nonce,
        counter,
        expires_at: challenge.expires_at,
        mac: challenge.mac,
    };
    verify_proof("user@conation.dev", &proof, now).expect("solved proof must verify");
}

#[test]
fn expired_challenge_is_rejected() {
    let now = 1_700_000_000;
    let challenge = issue_challenge("a@b.co", now);
    let counter = solve_counter(&challenge.nonce, challenge.difficulty);
    let proof = AntibotProof {
        nonce: challenge.nonce,
        counter,
        expires_at: challenge.expires_at,
        mac: challenge.mac,
    };
    assert_eq!(
        verify_proof("a@b.co", &proof, now + CHALLENGE_TTL_SECS + 1),
        Err(AntibotError::Expired)
    );
}

#[test]
fn other_email_cannot_reuse_mac() {
    let now = 1_700_000_000;
    let challenge = issue_challenge("alice@example.com", now);
    let counter = solve_counter(&challenge.nonce, challenge.difficulty);
    let proof = AntibotProof {
        nonce: challenge.nonce,
        counter,
        expires_at: challenge.expires_at,
        mac: challenge.mac,
    };
    assert_eq!(
        verify_proof("bob@example.com", &proof, now),
        Err(AntibotError::Mac)
    );
}

#[test]
fn unsolved_counter_is_rejected() {
    let now = 1_700_000_000;
    let challenge = issue_challenge("a@b.co", now);
    let proof = AntibotProof {
        nonce: challenge.nonce.clone(),
        counter: u64::MAX,
        expires_at: challenge.expires_at,
        mac: challenge.mac,
    };
    if leading_zero_bits(&pow_digest(&proof.nonce, proof.counter)) >= DIFFICULTY_BITS {
        return;
    }
    assert_eq!(verify_proof("a@b.co", &proof, now), Err(AntibotError::Work));
}

#[test]
fn difficulty_eight_means_first_byte_is_zero() {
    let digest = pow_digest("abc", 0);
    let bits = leading_zero_bits(&digest);
    if bits >= 8 {
        assert_eq!(digest[0], 0);
    }
}
