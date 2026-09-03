use crate::DocumentStorageServiceClient;
use crate::constants::INTERNAL_CONATION_USER_ID_HEADER;
use model::thread::response::GetThreadUserAccessLevelResponse;
use models_permissions::share_permission::access_level::AccessLevel;

impl DocumentStorageServiceClient {
    #[tracing::instrument(skip(self), err)]
    pub async fn get_thread_access_level(
        &self,
        user_id: &str,
        thread_id: &str,
    ) -> anyhow::Result<AccessLevel> {
        let res = self
            .client
            .get(format!(
                "{}/internal/threads/{}/access_level",
                self.url, thread_id
            ))
            .header(INTERNAL_CONATION_USER_ID_HEADER, user_id)
            .send()
            .await?
            .error_for_status()?;

        let access_level_response = res.json::<GetThreadUserAccessLevelResponse>().await?;

        Ok(access_level_response.user_access_level)
    }
}
