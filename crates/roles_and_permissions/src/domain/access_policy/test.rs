use super::CONATION_ACCESS_POLICY;

#[test]
fn missing_or_expired_subscription_still_grants_product_features() {
    assert!(CONATION_ACCESS_POLICY.grants_professional_features(false));
    assert!(CONATION_ACCESS_POLICY.grants_professional_features(true));
}

#[test]
fn teams_are_unlimited_and_do_not_sync_billable_seats() {
    assert_eq!(CONATION_ACCESS_POLICY.team_member_limit(), None);
    assert!(!CONATION_ACCESS_POLICY.sync_subscription_seats());
    assert!(!CONATION_ACCESS_POLICY.requires_payment_for_features());
}
