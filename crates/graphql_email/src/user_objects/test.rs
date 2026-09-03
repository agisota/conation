use super::GraphqlEmailProvider;
use email::domain::models::UserProvider;

#[test]
fn stalwart_provider_maps_to_graphql_contract() {
    assert_eq!(
        GraphqlEmailProvider::from(UserProvider::Stalwart),
        GraphqlEmailProvider::Stalwart
    );
}
