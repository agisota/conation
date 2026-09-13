use super::*;

#[test]
fn normalizes_and_rejects_reserved() {
    assert_eq!(normalize_local_part(" Alice.Work ").unwrap(), "alice.work");
    assert!(normalize_local_part("support").is_err());
    assert!(normalize_local_part("-leading").is_err());
    assert!(normalize_local_part("a..b").is_err());
    assert!(normalize_local_part("bad local").is_err());
}

#[test]
fn suggested_local_strips_gmail_domain() {
    assert_eq!(
        suggested_local_from_login("Ada.Lovelace@gmail.com"),
        "ada.lovelace"
    );
    assert_eq!(
        suggested_local_from_login("already@conation.dev"),
        "already"
    );
}

#[test]
fn candidates_suffix_from_two() {
    assert_eq!(next_candidate("alice", 1), "alice");
    assert_eq!(next_candidate("alice", 2), "alice2");
    assert_eq!(address_for_local("alice"), "alice@conation.dev");
}
