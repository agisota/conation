use axum::{
    http::{HeaderMap, HeaderValue, header::SET_COOKIE},
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use cookie::{Cookie, SameSite};
use time::Duration;
use tower_cookies::Cookies;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub(crate) enum OAuthFlowKind {
    Sso,
    AccountLink,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub(crate) struct IssuedOAuthFlow {
    pub kind: OAuthFlowKind,
    pub provider: String,
    pub identity_provider_id: String,
    pub link_id: Option<Uuid>,
    pub link_owner_id: Option<String>,
    pub original_url: Option<String>,
    pub is_mobile: Option<bool>,
    pub referral_code: Option<String>,
}

impl IssuedOAuthFlow {
    pub(crate) fn matches_oauth2(
        &self,
        provider: &str,
        state: &crate::api::oauth2::OAuthState,
    ) -> bool {
        self.kind == OAuthFlowKind::AccountLink
            && self.provider == provider
            && self.identity_provider_id == state.identity_provider_id
            && self.link_id.is_some()
            && self.link_id == state.link_id
            && self.link_owner_id.is_some()
            && self.original_url == state.original_url
            && self.is_mobile == state.is_mobile
            && state.oauth_nonce.as_deref().is_some()
    }

    pub(crate) fn matches_sso(&self, state: &crate::api::login::sso::SsoState) -> bool {
        self.kind == OAuthFlowKind::Sso
            && self.provider == "sso"
            && self.identity_provider_id == state.identity_provider_id.as_deref().unwrap_or("")
            && self.link_id.is_none()
            && self.link_owner_id.is_none()
            && self.original_url == state.original_url.as_ref().map(ToString::to_string)
            && self.is_mobile == Some(state.is_mobile)
            && self.referral_code == state.referral_code
            && state.oauth_nonce.is_some()
    }
}

pub(crate) fn link_owner_matches(expected_owner: &str, actual_owner: Uuid) -> bool {
    Uuid::parse_str(expected_owner).is_ok_and(|expected| expected == actual_owner)
}
use crate::api::{context::ApiContext, utils::self_hosted_app_origin};

pub(crate) const COOKIE_NAME_PREFIX: &str = "__Host-ctn_oauth_nonce_";
pub(crate) const NONCE_TTL_SECONDS: u64 =
    macro_cache_client::auth::MACRO_OAUTH_STATE_NONCE_EXPIRY_SECONDS;

pub(crate) fn private_mode() -> bool {
    self_hosted_app_origin().is_some()
}

pub(crate) fn fresh_nonce() -> String {
    URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>())
}

/// A nonce-specific host cookie lets independent tabs complete without
/// overwriting one another. Lax is required because providers return by
/// top-level cross-site GET; Strict would suppress the cookie on that callback.
fn cookie_name(nonce: &str) -> String {
    format!("{COOKIE_NAME_PREFIX}{nonce}")
}

pub(crate) fn nonce_cookie(nonce: &str) -> Cookie<'static> {
    let mut cookie = Cookie::new(cookie_name(nonce), nonce.to_owned());
    cookie.set_path("/");
    cookie.set_secure(true);
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_max_age(Duration::seconds(NONCE_TTL_SECONDS as i64));
    cookie
}
pub(crate) fn clear_nonce_cookie(nonce: &str) -> Cookie<'static> {
    let mut cookie = Cookie::new(cookie_name(nonce), "");
    cookie.set_path("/");
    cookie.set_secure(true);
    cookie.set_http_only(true);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_max_age(Duration::ZERO);
    cookie
}

pub(crate) fn add_nonce_cookie_header(headers: &mut HeaderMap, nonce: &str) {
    // Nonces are URL-safe base64 and the cookie attributes are constants.
    let value = HeaderValue::from_str(&nonce_cookie(nonce).to_string())
        .expect("generated OAuth nonce cookie is a valid header");
    headers.append(SET_COOKIE, value);
}

pub(crate) fn reject_invalid_nonce() -> Response {
    (
        axum::http::StatusCode::BAD_REQUEST,
        axum::Json(model::response::ErrorResponse {
            message: "Sign-in failed. Please try again or contact support.".into(),
        }),
    )
        .into_response()
}

pub(crate) fn nonce_matches(state_nonce: Option<&str>, cookie_nonce: Option<&str>) -> bool {
    state_nonce.is_some() && state_nonce == cookie_nonce
}

fn cookie_matches_nonce(
    state_nonce: Option<&str>,
    actual_cookie_name: Option<&str>,
    cookie_nonce: Option<&str>,
) -> bool {
    let Some(nonce) = state_nonce else {
        return false;
    };
    let expected_name = cookie_name(nonce);
    actual_cookie_name == Some(expected_name.as_str()) && nonce_matches(Some(nonce), cookie_nonce)
}

pub(crate) fn cookie_matches_state(cookies: &Cookies, state_nonce: Option<&str>) -> bool {
    let Some(nonce) = state_nonce else {
        return false;
    };
    let name = cookie_name(nonce);
    cookies.get(&name).is_some_and(|cookie| {
        cookie_matches_nonce(Some(nonce), Some(cookie.name()), Some(cookie.value()))
    })
}

pub(crate) async fn consume_issued_nonce(
    ctx: &ApiContext,
    nonce: &str,
    cookies: &Cookies,
) -> Result<IssuedOAuthFlow, Response> {
    let serialized_context = ctx
        .macro_cache_client
        .consume_oauth_state_nonce(nonce)
        .await
        .map_err(|error| {
            tracing::error!(error = ?error, "unable to consume OAuth state nonce");
            axum::http::StatusCode::SERVICE_UNAVAILABLE.into_response()
        })?
        .ok_or_else(reject_invalid_nonce)?;
    let flow_context: IssuedOAuthFlow =
        serde_json::from_str(&serialized_context).map_err(|_| reject_invalid_nonce())?;
    cookies.add(clear_nonce_cookie(nonce));
    Ok(flow_context)
}

pub(crate) async fn register_nonce(
    ctx: &ApiContext,
    nonce: &str,
    flow_context: &IssuedOAuthFlow,
) -> anyhow::Result<()> {
    let serialized_context = serde_json::to_string(flow_context)?;
    let issued = ctx
        .macro_cache_client
        .issue_oauth_state_nonce(nonce, &serialized_context)
        .await?;
    anyhow::ensure!(issued, "OAuth state nonce collision");
    Ok(())
}

pub(crate) async fn issue_nonce(
    ctx: &ApiContext,
    nonce: &str,
    flow_context: &IssuedOAuthFlow,
) -> Result<(), Response> {
    register_nonce(ctx, nonce, flow_context)
        .await
        .map_err(|error| {
            tracing::error!(error = ?error, "unable to register OAuth state nonce");
            axum::http::StatusCode::SERVICE_UNAVAILABLE.into_response()
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nonce_cookie_is_host_only_secure_http_only_lax_and_short_lived() {
        let cookie = nonce_cookie("nonce-value");
        assert_eq!(cookie.name(), format!("{COOKIE_NAME_PREFIX}nonce-value"));
        assert_eq!(cookie.value(), "nonce-value");
        assert_eq!(cookie.path(), Some("/"));
        assert_eq!(cookie.domain(), None);
        assert!(cookie.secure().unwrap_or(false));
        assert!(cookie.http_only().unwrap_or(false));
        assert_eq!(cookie.same_site(), Some(SameSite::Lax));
        assert_eq!(
            cookie.max_age(),
            Some(Duration::seconds(NONCE_TTL_SECONDS as i64))
        );
    }

    #[test]
    fn concurrent_states_bind_each_callback_to_its_own_cookie() {
        let first = nonce_cookie("flow-one");
        let second = nonce_cookie("flow-two");

        assert!(cookie_matches_nonce(
            Some("flow-one"),
            Some(first.name()),
            Some(first.value())
        ));
        assert!(cookie_matches_nonce(
            Some("flow-two"),
            Some(second.name()),
            Some(second.value())
        ));
        assert!(!cookie_matches_nonce(
            Some("flow-one"),
            Some(second.name()),
            Some(second.value())
        ));
        assert!(!cookie_matches_nonce(Some("flow-one"), None, None));
    }

    #[test]
    fn callback_rejects_missing_and_mismatched_nonce_but_accepts_match() {
        assert!(!nonce_matches(None, Some("cookie")));
        assert!(!nonce_matches(Some("state"), None));
        assert!(!nonce_matches(Some("state"), Some("other")));
        assert!(nonce_matches(Some("same"), Some("same")));
    }

    #[test]
    fn immutable_link_context_rejects_switched_provider_link_and_owner() {
        let link_id = Uuid::new_v4();
        let owner_id = Uuid::new_v4();
        let context = IssuedOAuthFlow {
            kind: OAuthFlowKind::AccountLink,
            provider: "google".into(),
            identity_provider_id: "provider-original".into(),
            link_id: Some(link_id),
            link_owner_id: Some(owner_id.to_string()),
            original_url: Some("https://app.example/finish".into()),
            is_mobile: Some(false),
            referral_code: None,
        };
        let mut state = crate::api::oauth2::OAuthState {
            identity_provider_id: "provider-original".into(),
            link_id: Some(link_id),
            original_url: Some("https://app.example/finish".into()),
            is_mobile: Some(false),
            oauth_nonce: Some("nonce".into()),
        };

        assert!(context.matches_oauth2("google", &state));
        assert!(!context.matches_oauth2("github", &state));
        state.link_id = Some(Uuid::new_v4());
        assert!(!context.matches_oauth2("google", &state));
        state.link_id = Some(link_id);
        state.identity_provider_id = "provider-switched".into();
        assert!(!context.matches_oauth2("google", &state));
        state.identity_provider_id = "provider-original".into();
        state.original_url = Some("https://attacker.example/finish".into());
        assert!(!context.matches_oauth2("google", &state));
        state.original_url = Some("https://app.example/finish".into());
        state.is_mobile = Some(true);
        assert!(!context.matches_oauth2("google", &state));
        assert!(link_owner_matches(&owner_id.to_string(), owner_id));
        assert!(!link_owner_matches(&Uuid::new_v4().to_string(), owner_id));
        assert!(!link_owner_matches("not-a-uuid", owner_id));
    }

    #[test]
    fn immutable_sso_context_rejects_switched_identity_provider() {
        let context = IssuedOAuthFlow {
            kind: OAuthFlowKind::Sso,
            provider: "sso".into(),
            identity_provider_id: "idp-original".into(),
            link_id: None,
            link_owner_id: None,
            original_url: None,
            is_mobile: Some(false),
            referral_code: None,
        };
        let mut state = crate::api::login::sso::SsoState {
            identity_provider_id: Some("idp-original".into()),
            oauth_nonce: Some("nonce".into()),
            ..Default::default()
        };
        assert!(context.matches_sso(&state));
        state.identity_provider_id = Some("idp-switched".into());
        assert!(!context.matches_sso(&state));
    }
    #[tokio::test]
    async fn shared_nonce_store_rejects_replay_and_expired_nonce() {
        let Ok(redis_uri) = std::env::var("REDIS_URI") else {
            return;
        };
        let cache = macro_cache_client::MacroCache::new(&redis_uri);
        let flow = IssuedOAuthFlow {
            kind: OAuthFlowKind::AccountLink,
            provider: "github".into(),
            identity_provider_id: "idp".into(),
            link_id: Some(Uuid::new_v4()),
            link_owner_id: Some(Uuid::new_v4().to_string()),
            original_url: None,
            is_mobile: None,
            referral_code: None,
        };
        let serialized_flow = serde_json::to_string(&flow).unwrap();
        let replay_nonce = fresh_nonce();
        assert!(
            cache
                .issue_oauth_state_nonce(&replay_nonce, &serialized_flow)
                .await
                .unwrap()
        );
        let (first, second) = tokio::join!(
            cache.consume_oauth_state_nonce(&replay_nonce),
            cache.consume_oauth_state_nonce(&replay_nonce)
        );
        let first = first.unwrap();
        let second = second.unwrap();
        assert_eq!(first.is_some() as u8 + second.is_some() as u8, 1);
        let consumed = first.or(second).unwrap();
        assert_eq!(
            serde_json::from_str::<IssuedOAuthFlow>(&consumed).unwrap(),
            flow
        );
        assert!(
            cache
                .consume_oauth_state_nonce(&replay_nonce)
                .await
                .unwrap()
                .is_none()
        );

        let expired_nonce = fresh_nonce();
        assert!(
            cache
                .issue_oauth_state_nonce(&expired_nonce, &serialized_flow)
                .await
                .unwrap()
        );
        let client = redis::Client::open(redis_uri).unwrap();
        let mut connection = client.get_multiplexed_async_connection().await.unwrap();
        let key = format!(
            "{}{}",
            macro_cache_client::auth::MACRO_OAUTH_STATE_NONCE_PREFIX,
            expired_nonce
        );
        redis::cmd("PEXPIRE")
            .arg(key)
            .arg(1)
            .query_async::<()>(&mut connection)
            .await
            .unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        assert!(
            cache
                .consume_oauth_state_nonce(&expired_nonce)
                .await
                .unwrap()
                .is_none()
        );
        let session_code = fresh_nonce();
        cache
            .set_mobile_login_session(&session_code, "refresh-token")
            .await
            .unwrap();
        let (first, second) = tokio::join!(
            cache.take_mobile_login_session(&session_code),
            cache.take_mobile_login_session(&session_code)
        );
        let redeemed = [first.unwrap(), second.unwrap()]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        assert_eq!(redeemed, ["refresh-token"]);
        assert!(
            cache
                .take_mobile_login_session(&session_code)
                .await
                .unwrap()
                .is_none()
        );
    }
}
