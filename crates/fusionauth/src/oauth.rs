use serde::Serialize;
use std::borrow::Cow;

use crate::{
    Result, UnauthedClient,
    error::{FusionAuthClientError, GenericErrorResponse},
};
use anyhow::Context;
use reqwest::Url;

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "snake_case")]
struct RefreshTokenGrantCompleteRequest<'a> {
    /// The client id
    pub client_id: Cow<'a, str>,
    /// The client secret
    pub client_secret: Cow<'a, str>,
    /// The refresh token
    pub refresh_token: Cow<'a, str>,
    /// The grant type (should always be refresh_token)
    pub grant_type: Cow<'a, str>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
struct AuthorizationCodeGrantCompleteRequest<'a> {
    /// The client id
    pub client_id: Cow<'a, str>,
    /// The client secret
    pub client_secret: Cow<'a, str>,
    /// The authorization code
    pub code: Cow<'a, str>,
    /// The redirect uri
    pub redirect_uri: Cow<'a, str>,
    /// The grant type (should always be authorization_code)
    pub grant_type: Cow<'a, str>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
struct AuthorizationCodeGrantCompleteResponse<'a> {
    /// The access token
    pub access_token: Cow<'a, str>,
    /// The refresh token
    pub refresh_token: Cow<'a, str>,
    /// The expiration time of the access token
    pub expires_in: u64,
    // TODO: add other fields if we start to need them
}

/// Tokens returned by a successful OAuth2 grant.
#[derive(Debug)]
pub struct OAuth2Grant {
    /// The access token.
    pub access_token: String,
    /// The refresh token.
    pub refresh_token: String,
    /// Seconds until the access token expires, as reported by FusionAuth.
    pub expires_in: u64,
}

/// Minimal FusionAuth OAuth client for an application authorization-code flow.
///
/// Unlike [`crate::FusionAuthClient`], this client deliberately has no
/// identity-provider or FusionAuth-management API credentials. It can only
/// construct a normal application authorization URL and redeem authorization
/// or refresh-token grants. This is appropriate for consumers such as an MCP
/// OAuth broker, where FusionAuth itself must choose and authenticate the user.
#[derive(Clone, Debug)]
pub struct FusionAuthOAuthClient {
    client_id: String,
    client_secret: String,
    fusion_auth_base_url: String,
    fusion_auth_public_url: String,
    oauth_redirect_uri: String,
    unauth_client: UnauthedClient,
}

impl FusionAuthOAuthClient {
    /// Creates an OAuth client for one FusionAuth application.
    pub fn new(
        client_id: String,
        client_secret: String,
        fusion_auth_base_url: String,
        oauth_redirect_uri: String,
    ) -> Self {
        Self {
            client_id,
            client_secret,
            fusion_auth_public_url: fusion_auth_base_url.clone(),
            fusion_auth_base_url,
            oauth_redirect_uri,
            unauth_client: UnauthedClient::new(),
        }
    }

    /// Sets the browser-reachable FusionAuth URL used for authorization redirects.
    pub fn with_public_url(mut self, fusion_auth_public_url: String) -> Self {
        self.fusion_auth_public_url = fusion_auth_public_url;
        self
    }

    /// Builds the normal FusionAuth application authorization URL.
    ///
    /// The URL intentionally omits `idp_hint`: FusionAuth performs its regular
    /// login/session handling and may present only the identity providers that
    /// are actually configured for the application.
    #[tracing::instrument(skip(self, state), level = tracing::Level::TRACE)]
    pub fn construct_authorize_url<T>(&self, state: Option<T>) -> anyhow::Result<String>
    where
        T: serde::Serialize + std::fmt::Debug + 'static,
    {
        let mut url = Url::parse(&format!("{}/oauth2/authorize", self.fusion_auth_public_url))
            .context("invalid FusionAuth public URL")?;

        url.query_pairs_mut()
            .append_pair("client_id", &self.client_id)
            .append_pair("redirect_uri", &self.oauth_redirect_uri)
            .append_pair("response_type", "code")
            .append_pair("scope", "openid profile email offline_access")
            .append_pair("access_type", "offline");

        if let Some(state) = state {
            tracing::trace!(state=?state, "state provided");
            let state_str = serde_json::to_string(&state)
                .context("should be able to serialize state into string")?;
            url.query_pairs_mut().append_pair("state", &state_str);
        }

        Ok(url.to_string())
    }

    /// Completes FusionAuth's authorization-code grant.
    #[tracing::instrument(skip(self), fields(application_id=%self.client_id, fusion_auth_base_url=%self.fusion_auth_base_url))]
    pub async fn complete_authorization_code_grant(&self, code: &str) -> Result<OAuth2Grant> {
        complete(
            &self.unauth_client,
            &self.fusion_auth_base_url,
            AuthorizationCodeGrantCompleteRequest {
                client_id: Cow::Borrowed(&self.client_id),
                client_secret: Cow::Borrowed(&self.client_secret),
                code: Cow::Borrowed(code),
                redirect_uri: Cow::Borrowed(&self.oauth_redirect_uri),
                grant_type: Cow::Borrowed("authorization_code"),
            },
        )
        .await
    }

    /// Completes FusionAuth's refresh-token grant.
    #[tracing::instrument(skip(self), fields(application_id=%self.client_id, fusion_auth_base_url=%self.fusion_auth_base_url))]
    pub async fn complete_refresh_token_grant(&self, refresh_token: &str) -> Result<OAuth2Grant> {
        complete(
            &self.unauth_client,
            &self.fusion_auth_base_url,
            RefreshTokenGrantCompleteRequest {
                client_id: Cow::Borrowed(&self.client_id),
                client_secret: Cow::Borrowed(&self.client_secret),
                refresh_token: Cow::Borrowed(refresh_token),
                grant_type: Cow::Borrowed("refresh_token"),
            },
        )
        .await
    }
}

/// Completes the authorization code grant
/// https://fusionauth.io/docs/lifecycle/authenticate-users/oauth/endpoints#complete-the-authorization-code-grant-request
/// Valid respones: 200, 400, 401, 500, 503
async fn complete(
    client: &UnauthedClient,
    base_url: &str,
    request: impl Serialize,
) -> Result<OAuth2Grant> {
    let body = serde_urlencoded::to_string(&request).map_err(|e| {
        FusionAuthClientError::Generic(GenericErrorResponse {
            message: e.to_string(),
        })
    })?;

    let res = client
        .client()
        .post(format!("{base_url}/oauth2/token"))
        .header(
            reqwest::header::CONTENT_TYPE,
            "application/x-www-form-urlencoded",
        )
        .body(body)
        .send()
        .await
        .map_err(|e| {
            FusionAuthClientError::Generic(GenericErrorResponse {
                message: e.to_string(),
            })
        })?;

    tracing::trace!("request sent");

    match res.status() {
        reqwest::StatusCode::OK => {
            tracing::info!("authorization code grant complete");
            let body = res
                .json::<AuthorizationCodeGrantCompleteResponse>()
                .await
                .map_err(|e| {
                    tracing::error!(error=?e, "unable to decode successful oauth2 token response");
                    FusionAuthClientError::Generic(GenericErrorResponse {
                        message: e.to_string(),
                    })
                })?;

            Ok(OAuth2Grant {
                access_token: body.access_token.into(),
                refresh_token: body.refresh_token.into(),
                expires_in: body.expires_in,
            })
        }
        _ => {
            let body = res.text().await.map_err(|e| {
                FusionAuthClientError::Generic(GenericErrorResponse {
                    message: e.to_string(),
                })
            })?;

            tracing::error!(body=%body, "unexpected response from fusionauth");

            Err(FusionAuthClientError::Generic(GenericErrorResponse {
                message: body,
            }))
        }
    }
}

impl crate::FusionAuthClient {
    /// Completes the OAuth2 authorization code grant flow.
    #[tracing::instrument(skip(self), fields(application_id=%self.client_id, fusion_auth_base_url=%self.fusion_auth_base_url))]
    pub async fn complete_authorization_code_grant(&self, code: &str) -> Result<OAuth2Grant> {
        complete(
            &self.unauth_client,
            &self.fusion_auth_base_url,
            AuthorizationCodeGrantCompleteRequest {
                client_id: Cow::Borrowed(&self.client_id),
                client_secret: Cow::Borrowed(&self.client_secret),
                code: Cow::Borrowed(code),
                redirect_uri: Cow::Borrowed(&self.oauth_redirect_uri),
                grant_type: Cow::Borrowed("authorization_code"),
            },
        )
        .await
    }

    /// complete the OAuth2 Refresh token grant flow.
    #[tracing::instrument(skip(self), fields(application_id=%self.client_id, fusion_auth_base_url=%self.fusion_auth_base_url))]
    pub async fn complete_refresh_token_grant(&self, refresh_token: &str) -> Result<OAuth2Grant> {
        complete(
            &self.unauth_client,
            &self.fusion_auth_base_url,
            RefreshTokenGrantCompleteRequest {
                client_id: Cow::Borrowed(&self.client_id),
                client_secret: Cow::Borrowed(&self.client_secret),
                refresh_token: Cow::Borrowed(refresh_token),
                grant_type: Cow::Borrowed("refresh_token"),
            },
        )
        .await
    }
}

#[cfg(test)]
mod test;
