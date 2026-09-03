use std::sync::Arc;

use analytics_client::AnalyticsClient;
use axum::extract::FromRef;
use channels::{
    domain::{
        service::ChannelServiceImpl,
        side_effects::{ChannelSideEffectService, SpawnedChannelEventDispatcher},
    },
    outbound::{
        connection_gateway_realtime::ConnectionGatewayChannelRealtimePublisher,
        contacts_dispatcher::ContactsChannelDispatcher,
        notification_sender::NotificationChannelSender,
        pg_channel_reference_share_permissions::PgChannelReferenceSharePermissions,
        pg_channels_repo::PgChannelsRepo, pg_side_effect_context::PgChannelSideEffectContext,
    },
};
use conation_auth::{InternalApiKey, middleware::decode_jwt::JwtValidationArgs};
use conation_authorization::{
    MacroAuthJwtValidator, MacroAuthorizationServiceImpl, MacroAuthorizationState,
};
use conation_cache_client::MacroCache;
use conation_env::Environment;
use conation_env_var::env_var;
use conation_event_broker::{KafkaEventPublisher, MacroEventBrokerService};
use contacts::{domain::service::SqsContactsIngress, outbound::ingress::SqsContactsQueue};
use entity_access::domain::service::EntityAccessServiceImpl;
use entity_access::outbound::PgAccessRepository;
use foreign_entity::domain::service::ForeignEntityServiceImpl;
use foreign_entity::outbound::pg_foreign_entity_repo::PgForeignEntityRepo;
use github::domain::service::GithubLinkServiceImpl;
use github::outbound::github_auth_client::GithubAuthImpl;
use github::outbound::github_oauth_client::GithubOauthImpl;
use github::outbound::pg_github_repo::PgGithubRepo;
use loops_client::LoopsClient;
use native_app_service::{domain::service::NativeAppServiceImpl, outbound::DefaultBundleFetcher};
use notification::outbound::queue::SqsQueue;
use notification::{
    domain::service::SqsNotificationIngress, outbound::rate_limit::RedisRateLimitAdapter,
};
use rate_limit::domain::service::RateLimitServiceImpl;
use referral::{
    domain::service::ReferralServiceImpl,
    outbound::{pg_referral_repo::PgReferralRepo, stripe_discount_client::StripeDiscountClient},
};
use remote_env_var::LocalOrRemoteSecret;
use roles_and_permissions::{
    domain::service::UserRolesAndPermissionsServiceImpl, outbound::pgpool::MacroDB,
};
use sqlx::PgPool;
use tokio_util::task::TaskTracker;

use crate::config::MailIdentity;
use crate::microsoft_token_cipher::MicrosoftTokenCipher;
use cursor_api_key::cipher::CursorApiKeyCipher;

pub(crate) type NotificationIngressType = SqsNotificationIngress<SqsQueue>;
pub(crate) type AuthenticationEventBroker =
    MacroEventBrokerService<KafkaEventPublisher, TaskTracker>;

pub(crate) type ChannelServiceType = ChannelServiceImpl<
    PgChannelsRepo,
    SpawnedChannelEventDispatcher<
        ChannelSideEffectService<
            PgChannelSideEffectContext,
            ConnectionGatewayChannelRealtimePublisher,
            NotificationChannelSender<NotificationIngressType>,
            ContactsChannelDispatcher<SqsContactsIngress<SqsContactsQueue>>,
            AuthenticationEventBroker,
        >,
    >,
    PgChannelReferenceSharePermissions<EntityAccessServiceType>,
>;

pub(crate) type TeamsServiceType = teams::domain::team_service::TeamServiceImpl<
    teams::outbound::team_repo::TeamRepositoryImpl,
    teams::outbound::customer_repo::CustomerRepositoryImpl,
    ChannelServiceType,
    UserRolesAndPermissionsServiceImpl<MacroDB, MacroDB>,
    NotificationIngressType,
    teams::outbound::crm_enqueuer::SqsCrmEnqueuer,
    teams::outbound::team_crm_settings_repo::TeamCrmSettingsRepositoryImpl,
    teams::outbound::team_analytics::AnalyticsClientTeamAnalytics,
    teams::outbound::contacts_enqueuer::ContactsIngressEnqueuer<
        SqsContactsIngress<SqsContactsQueue>,
    >,
    AuthenticationEventBroker,
>;

pub(crate) type RateLimiter = RateLimitServiceImpl<RedisRateLimitAdapter<redis::Client>>;

pub(crate) type ReferralServiceType = ReferralServiceImpl<
    PgReferralRepo,
    StripeDiscountClient,
    Arc<SqsNotificationIngress<SqsQueue>>,
>;

pub(crate) type GithubLinkServiceType = GithubLinkServiceImpl<
    PgGithubRepo,
    GithubOauthImpl,
    GithubAuthImpl,
    ForeignEntityServiceImpl<PgForeignEntityRepo>,
>;

pub(crate) type EntityAccessServiceType = EntityAccessServiceImpl<PgAccessRepository>;

pub(crate) type FavoritesServiceType = favorites::domain::service::FavoritesServiceImpl<
    favorites::outbound::pg_favorites_repo::PgFavoritesRepo,
>;

pub(crate) type AuthorizationService = MacroAuthorizationServiceImpl<MacroAuthJwtValidator>;

/// Whether hosted Stripe billing is configured for this deployment.
#[derive(Clone, Copy)]
pub(crate) struct StripeBillingEnabled(pub(crate) bool);

/// Whether Google OAuth is configured for Gmail account linking.
#[derive(Clone, Copy)]
pub(crate) struct GoogleOAuthEnabled(pub(crate) bool);

#[derive(Clone, FromRef)]
pub(crate) struct ApiContext {
    pub db: PgPool,
    pub github_link_service: Arc<GithubLinkServiceType>,
    pub auth_client: Arc<fusionauth::FusionAuthClient>,
    pub microsoft_token_cipher: Option<Arc<dyn MicrosoftTokenCipher>>,
    /// Encrypts users' Cursor API keys.
    pub cursor_api_key_cipher: Arc<dyn CursorApiKeyCipher>,
    pub conation_cache_client: Arc<MacroCache>,
    pub stripe_client: Arc<stripe::Client>,
    pub stripe_enabled: StripeBillingEnabled,
    pub google_oauth_enabled: GoogleOAuthEnabled,
    pub document_storage_service_client:
        Arc<document_storage_service_client::DocumentStorageServiceClient>,
    pub email_service_client: Arc<email::outbound::EmailServiceHttpClient>,
    pub ses_client: Arc<ses_client::Ses>,
    /// Validated sender and support addresses owned by this deployment.
    pub mail_identity: MailIdentity,
    /// Validated browser-facing application URL used in transactional mail.
    pub app_base_url: url::Url,
    pub notification_ingress_service: Arc<NotificationIngressType>,
    pub sqs_client: Arc<sqs_client::SQS>,
    pub environment: Environment,
    pub jwt_args: JwtValidationArgs,
    pub authorization_state: MacroAuthorizationState<AuthorizationService>,
    pub token_context: ConationApiTokenContext,
    pub internal_api_key: InternalApiKey,
    /// Shared secret used to verify Stripe webhooks when hosted billing is enabled.
    pub stripe_webhook_secret: Option<LocalOrRemoteSecret<StripeWebhookSecretKey>>,
    pub user_roles_and_permissions_service:
        Arc<UserRolesAndPermissionsServiceImpl<MacroDB, MacroDB>>, // Note: since FromRef doesn't support generics we have to specify the concrete types here
    pub teams_service: Arc<TeamsServiceType>,
    pub channel_service: Arc<ChannelServiceType>,
    pub favorites_service: Arc<FavoritesServiceType>,
    pub entity_access_service: Arc<EntityAccessServiceType>,
    pub native_app_service: Arc<NativeAppServiceImpl<DefaultBundleFetcher>>,
    pub analytics_client: Arc<AnalyticsClient>,
    pub loops_client: Arc<LoopsClient>,
    pub referral_service: Arc<ReferralServiceType>,
    pub rate_limit_service: RateLimiter,
    /// The stripe price id
    pub stripe_price_id: String,
    /// Whether Gmail link consent requests the Google Calendar scope.
    pub calendar_scope_enabled: bool,
}

env_var! {
    #[derive(Clone)]
    pub struct StripeWebhookSecretKey;
}

env_var! {
    #[derive(Clone)]
pub struct ConationApiTokenIssuer;
}
env_var! {
    #[derive(Clone)]
pub struct ConationApiTokenPrivateSecretKey;
}

env_var! {
    #[derive(Clone)]
pub struct ConationApiTokenExpirySeconds;
}

#[derive(Clone)]
pub struct ConationApiTokenContext {
    /// The issuer of the Conation API token.
    pub issuer: ConationApiTokenIssuer,
    /// The private key used to sign Conation API tokens.
    pub conation_api_token_private_key: LocalOrRemoteSecret<ConationApiTokenPrivateSecretKey>,
    /// The token expiry duration in seconds
    pub expiry_seconds: usize,
}

#[derive(Clone)]
pub struct TokenContext {
    /// The access token
    pub access_token: String,
    /// The refresh token
    pub refresh_token: String,
}
