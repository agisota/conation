use std::collections::HashSet;

use super::apply_product_access_policy;

#[test]
fn no_subscription_permission_still_receives_feature_entitlement() {
    let permissions =
        apply_product_access_policy(HashSet::from(["unrelated:permission".to_string()]));

    assert!(permissions.contains("read:professional_features"));
    assert!(permissions.contains("unrelated:permission"));
    assert_eq!(
        permissions.len(),
        2,
        "ordinary permissions must be preserved"
    );
}

#[test]
fn existing_subscription_permission_is_not_duplicated() {
    let permissions =
        apply_product_access_policy(HashSet::from(["read:professional_features".to_string()]));

    assert_eq!(permissions.len(), 1);
}
