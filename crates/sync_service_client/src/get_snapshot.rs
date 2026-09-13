use super::SyncServiceClient;
use anyhow::Result;
use reqwest::StatusCode;

impl SyncServiceClient {
    /// Fetch the current Loro snapshot, or `None` when the document was never initialized.
    #[tracing::instrument(skip(self), err)]
    pub async fn get_snapshot(&self, document_id: &str) -> Result<Option<Vec<u8>>> {
        let full_url = format!("{}/document/{}/snapshot", self.url, document_id);
        let res = self.client.get(&full_url).send().await?;
        let status_code = res.status();
        if status_code == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if status_code != StatusCode::OK {
            let body: String = res.text().await?;
            tracing::error!(
                body=%body,
                status=%status_code,
                "unexpected response from sync service while getting snapshot"
            );
            anyhow::bail!(body);
        }
        Ok(Some(res.bytes().await?.to_vec()))
    }
}
