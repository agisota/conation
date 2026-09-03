use super::service_provider;
use email::domain::models::UserProvider as DomainUserProvider;
use models_email::service::link::UserProvider as ServiceUserProvider;

#[test]
fn middleware_preserves_stalwart_provider_identity() {
    assert_eq!(
        service_provider(DomainUserProvider::Stalwart),
        ServiceUserProvider::Stalwart
    );
}

#[test]
fn middleware_preserves_gmail_provider_identity() {
    assert_eq!(
        service_provider(DomainUserProvider::Gmail),
        ServiceUserProvider::Gmail
    );
}
