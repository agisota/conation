use anyhow::Context;
use aws_sdk_s3::operation::head_object::HeadObjectOutput;

async fn head_object(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
) -> anyhow::Result<Option<HeadObjectOutput>> {
    match client.head_object().bucket(bucket).key(key).send().await {
        Ok(response) => Ok(Some(response)),
        Err(error) if error.as_service_error().is_some_and(|e| e.is_not_found()) => Ok(None),
        Err(error) => Err(error).context("failed to perform head object operation"),
    }
}

/// Checks if a given key exists in the bucket.
#[tracing::instrument(skip(client))]
pub(crate) async fn exists(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
) -> anyhow::Result<bool> {
    Ok(head_object(client, bucket, key).await?.is_some())
}

/// Returns the verified content length of an existing object.
#[tracing::instrument(skip(client))]
pub(crate) async fn size_bytes(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
) -> anyhow::Result<Option<i64>> {
    head_object(client, bucket, key)
        .await?
        .map(|response| {
            response
                .content_length()
                .context("object has no content length")
        })
        .transpose()
}
