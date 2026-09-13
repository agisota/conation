use super::SyncServiceClient;
use anyhow::Result;

impl SyncServiceClient {
    /// Import a Loro update into an already-initialized document and broadcast it.
    #[tracing::instrument(skip(self, update), err)]
    pub async fn apply_update(&self, document_id: &str, update: &[u8]) -> Result<()> {
        if update.is_empty() {
            return Ok(());
        }
        let full_url = format!("{}/document/{}/apply", self.url, document_id);
        let res = self
            .client
            .post(&full_url)
            .header(reqwest::header::CONTENT_TYPE, "application/octet-stream")
            .body(update.to_vec())
            .send()
            .await?;

        let status_code = res.status();
        if status_code != reqwest::StatusCode::OK {
            let body: String = res.text().await?;
            tracing::error!(
                body=%body,
                status=%status_code,
                "unexpected response from sync service while applying update"
            );
            anyhow::bail!(body);
        }

        Ok(())
    }
}
