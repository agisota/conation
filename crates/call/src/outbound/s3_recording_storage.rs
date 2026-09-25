//! S3-backed call recording storage with authorized byte streaming.

use crate::domain::ports::{RecordingStorage, recording_object_key};

/// S3-backed recording storage.
pub struct S3RecordingStorage {
    client: aws_sdk_s3::Client,
    bucket: String,
}

impl S3RecordingStorage {
    /// Create the read client with the same bucket, region, and credentials as recording egress.
    pub fn new(s3_config: &crate::domain::models::EgressS3Config) -> Self {
        let local_url = macro_aws_config::LocalAwsUrl::new();
        let config = aws_sdk_s3::config::Builder::new()
            .behavior_version(aws_sdk_s3::config::BehaviorVersion::latest())
            .region(aws_sdk_s3::config::Region::new(s3_config.region.clone()))
            .credentials_provider(aws_sdk_s3::config::Credentials::new(
                s3_config.access_key.clone(),
                s3_config.secret.clone(),
                None,
                None,
                "call-recording-storage",
            ))
            .force_path_style(local_url.is_some());
        let config = match local_url {
            Some(url) => config.endpoint_url(url.as_ref()).build(),
            None => config.build(),
        };
        let client = aws_sdk_s3::Client::from_conf(config);
        Self {
            client,
            bucket: s3_config.bucket.clone(),
        }
    }
}

impl RecordingStorage for S3RecordingStorage {
    async fn head_recording_object(
        &self,
        object_key: &str,
    ) -> anyhow::Result<Option<crate::domain::ports::RecordingObjectMetadata>> {
        let output = match self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(object_key)
            .send()
            .await
        {
            Ok(output) => output,
            Err(error)
                if error
                    .as_service_error()
                    .is_some_and(|error| error.is_not_found()) =>
            {
                return Ok(None);
            }
            Err(error) => return Err(error.into()),
        };
        Ok(Some(crate::domain::ports::RecordingObjectMetadata {
            content_length: output.content_length().unwrap_or_default().max(0) as u64,
        }))
    }

    async fn get_recording_object(
        &self,
        object_key: &str,
        range: Option<(u64, u64)>,
    ) -> anyhow::Result<crate::domain::ports::RecordingObjectStream> {
        let mut request = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(object_key);
        if let Some((start, end)) = range {
            request = request.range(format!("bytes={start}-{end}"));
        }
        let output = request.send().await?;
        Ok(crate::domain::ports::RecordingObjectStream { body: output.body })
    }

    async fn delete_recording(&self, recording_key: &str) -> anyhow::Result<()> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(recording_object_key(recording_key))
            .send()
            .await?;
        Ok(())
    }

    async fn delete_recording_preview(&self, preview_key: &str) -> anyhow::Result<()> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(preview_key)
            .send()
            .await?;
        Ok(())
    }
}
