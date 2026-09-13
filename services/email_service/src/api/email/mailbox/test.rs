use super::*;
use axum::http::HeaderMap;
use std::{collections::HashMap, sync::Mutex, time::Instant};

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

#[test]
fn client_key_uses_rightmost_forwarded_hop() {
    let mut headers = HeaderMap::new();
    headers.insert(
        "x-forwarded-for",
        "203.0.113.1, 198.51.100.2".parse().unwrap(),
    );
    assert_eq!(client_key_from_headers(&headers), "198.51.100.2");
    assert_eq!(client_key_from_headers(&HeaderMap::new()), "direct");
}

#[test]
fn availability_lookup_is_rate_limited_per_client() {
    let store = Mutex::new(HashMap::new());
    let now = Instant::now();
    for _ in 0..AVAILABILITY_MAX_REQUESTS {
        assert!(allow_in(
            &store,
            "198.51.100.2",
            now,
            AVAILABILITY_MAX_REQUESTS,
            AVAILABILITY_WINDOW,
        ));
    }
    assert!(!allow_in(
        &store,
        "198.51.100.2",
        now,
        AVAILABILITY_MAX_REQUESTS,
        AVAILABILITY_WINDOW,
    ));
    assert!(allow_in(
        &store,
        "203.0.113.1",
        now,
        AVAILABILITY_MAX_REQUESTS,
        AVAILABILITY_WINDOW,
    ));
}
