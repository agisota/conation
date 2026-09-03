use super::DbUserProvider;
use doppleganger::Mirror;
use models_email::service::link::UserProvider;

#[test]
fn stalwart_provider_maps_between_service_and_database_contracts() {
    let db_provider = DbUserProvider::mirror(UserProvider::Stalwart);

    assert_eq!(db_provider, DbUserProvider::Stalwart);
    assert_eq!(db_provider.as_str(), "STALWART");
}
