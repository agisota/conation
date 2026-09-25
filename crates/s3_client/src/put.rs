use anyhow::Context;
use aws_sdk_s3::presigning::PresigningConfig;
use base64::Engine;
use std::time::Duration;
use tracing::instrument;

#[tracing::instrument(skip(client))]
pub async fn put(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
    content: &[u8],
) -> anyhow::Result<()> {
    let body = aws_sdk_s3::primitives::ByteStream::from(content.to_vec());
    client
        .put_object()
        .bucket(bucket)
        .key(key)
        .body(body)
        .send()
        .await?;
    Ok(())
}

/// generates a presigned URL for uploading a file to a bucket
#[instrument(skip(client))]
pub async fn put_presigned_url(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
    sha: &str,
    mime_type: &str,
    size_bytes: i64,
) -> anyhow::Result<aws_sdk_s3::presigning::PresignedRequest> {
    // Allows the app 2 minutes to grab the document
    let expiry_duration = Duration::from_secs(2 * 60);

    // Convert the hex SHA256 hash to binary
    let payload_sha256_bytes = hex::decode(sha).context("able to decode hex sha")?;
    // Encode the binary hash into base64
    let base64_encoded_sha = base64::engine::general_purpose::STANDARD.encode(payload_sha256_bytes);

    // Generate the presigned URL.
    let presigned_url = client
        .put_object()
        .bucket(bucket)
        .key(key)
        .content_type(mime_type)
        .content_length(size_bytes)
        .checksum_sha256(base64_encoded_sha)
        .presigned(PresigningConfig::expires_in(expiry_duration)?)
        .await?;

    Ok(presigned_url)
}

#[cfg(test)]
mod tests {
    use super::*;
    use aws_sdk_s3::config::{Credentials, Region};

    #[tokio::test]
    async fn draft_upload_signature_binds_raw_byte_length() {
        let config = aws_sdk_s3::config::Builder::new()
            .region(Region::new("us-east-1"))
            .behavior_version(aws_sdk_s3::config::BehaviorVersion::latest())
            .credentials_provider(Credentials::new("key", "secret", None, None, "test"))
            .endpoint_url("https://storage.example.test")
            .force_path_style(true)
            .build();
        let client = aws_sdk_s3::Client::from_conf(config);

        let presigned = put_presigned_url(
            &client,
            "mail",
            "draft/attachment",
            &"00".repeat(32),
            "application/pdf",
            18_000_000,
        )
        .await
        .unwrap();

        assert!(
            presigned
                .uri()
                .to_ascii_lowercase()
                .contains("content-length"),
            "Content-Length must be signed"
        );
        assert_eq!(
            presigned
                .headers()
                .find(|(name, _)| name.eq_ignore_ascii_case("content-length"))
                .map(|(_, value)| value),
            Some("18000000")
        );
    }
}
