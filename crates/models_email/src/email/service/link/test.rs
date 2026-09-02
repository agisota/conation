use super::UserProvider;

#[test]
fn provider_contract_uses_stable_database_values() {
    assert_eq!(UserProvider::Gmail.as_str(), "GMAIL");
    assert_eq!(UserProvider::Stalwart.as_str(), "STALWART");
}

#[test]
fn stalwart_provider_round_trips_through_serde() {
    let json = serde_json::to_string(&UserProvider::Stalwart).unwrap();
    assert_eq!(json, r#""Stalwart""#);
    assert_eq!(
        serde_json::from_str::<UserProvider>(&json).unwrap(),
        UserProvider::Stalwart
    );
}
