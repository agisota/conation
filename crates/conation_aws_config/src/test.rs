use super::*;

#[test]
fn test_transform_path_style_localstack() {
    let input = "http://localstack:4566/doc-storage/macro%7Cteo%40macro.com/doc/1?x-id=PutObject";
    let expected = "http://localhost:4566/doc-storage/macro%7Cteo%40macro.com/doc/1?x-id=PutObject";

    let result = transform_local_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_transform_path_style_localhost() {
    let input = "http://localhost:4566/doc-storage/macro%7Cteo%40macro.com/doc/1?x-id=PutObject";
    let expected = "http://localhost:4566/doc-storage/macro%7Cteo%40macro.com/doc/1?x-id=PutObject";

    let result = transform_local_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_transform_presigned_url_with_query_params_localstack() {
    let input = "http://static-file-storage.localstack:4566/file/a31e9af3-dd26-4531-b367-bfbbbac706cc?x-id=PutObject&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ANOTREAL%2F20260203%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260203T184319Z&X-Amz-Expires=120&X-Amz-SignedHeaders=content-type%3Bhost&X-Amz-Signature=deed6b123a18335b61567eaf8ddb7ea6e00bf264cfd80cb0f4031860235dc077";

    let expected = "http://localhost:4566/static-file-storage/file/a31e9af3-dd26-4531-b367-bfbbbac706cc?x-id=PutObject&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ANOTREAL%2F20260203%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260203T184319Z&X-Amz-Expires=120&X-Amz-SignedHeaders=content-type%3Bhost&X-Amz-Signature=deed6b123a18335b61567eaf8ddb7ea6e00bf264cfd80cb0f4031860235dc077";

    let result = transform_local_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_transform_presigned_url_with_query_params_localhost() {
    let input = "http://static-file-storage.localhost:4566/file/a31e9af3-dd26-4531-b367-bfbbbac706cc?x-id=PutObject&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ANOTREAL%2F20260203%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260203T184319Z&X-Amz-Expires=120&X-Amz-SignedHeaders=content-type%3Bhost&X-Amz-Signature=deed6b123a18335b61567eaf8ddb7ea6e00bf264cfd80cb0f4031860235dc077";

    let expected = "http://localhost:4566/static-file-storage/file/a31e9af3-dd26-4531-b367-bfbbbac706cc?x-id=PutObject&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ANOTREAL%2F20260203%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260203T184319Z&X-Amz-Expires=120&X-Amz-SignedHeaders=content-type%3Bhost&X-Amz-Signature=deed6b123a18335b61567eaf8ddb7ea6e00bf264cfd80cb0f4031860235dc077";

    let result = transform_local_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_transform_simple_url_localstack() {
    let input = "http://my-bucket.localstack:4566/some/path/to/file.txt";
    let expected = "http://localhost:4566/my-bucket/some/path/to/file.txt";

    let result = transform_local_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_transform_simple_url_localhost() {
    let input = "http://my-bucket.localhost:4566/some/path/to/file.txt";
    let expected = "http://localhost:4566/my-bucket/some/path/to/file.txt";

    let result = transform_local_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_transform_url_root_path() {
    let input = "http://bucket.localstack:4566/";
    let expected = "http://localhost:4566/bucket/";

    let result = transform_local_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_transform_url_no_path() {
    let input = "http://bucket.localhost:4566";
    let expected = "http://localhost:4566/bucket/";

    let result = transform_local_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_transform_url_with_simple_query() {
    let input = "http://test-bucket.localstack:4566/key?versionId=123";
    let expected = "http://localhost:4566/test-bucket/key?versionId=123";

    let result = transform_local_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_transform_url_with_simple_query_localhost() {
    let input = "http://test-bucket.localhost:4566/key?versionId=123";
    let expected = "http://localhost:4566/test-bucket/key?versionId=123";

    let result = transform_local_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_transform_url_default_port_localstack() {
    let input = "http://bucket.localstack/path/file.txt";
    let expected = "http://localhost:4566/bucket/path/file.txt";

    let result = transform_local_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_transform_url_default_port_localhost() {
    let input = "http://bucket.localhost/path/file.txt";
    let expected = "http://localhost:4566/bucket/path/file.txt";

    let result = transform_local_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_internal_fetch_rewrites_localhost_to_localstack() {
    let input = "http://localhost:4566/doc-storage/macro%7Cteo%40macro.com/doc/1";
    let expected = "http://localstack:4566/doc-storage/macro%7Cteo%40macro.com/doc/1";

    let result = transform_internal_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_internal_fetch_preserves_query_params() {
    let input = "http://localhost:4566/doc-storage/key?versionId=123";
    let expected = "http://localstack:4566/doc-storage/key?versionId=123";

    let result = transform_internal_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_internal_fetch_localstack_is_idempotent() {
    let input = "http://localstack:4566/doc-storage/key";
    let expected = "http://localstack:4566/doc-storage/key";

    let result = transform_internal_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_internal_fetch_leaves_remote_url_untouched() {
    let input = "https://d123.cloudfront.net/doc-storage/key?Signature=abc";
    let expected = "https://d123.cloudfront.net/doc-storage/key?Signature=abc";

    let result = transform_internal_url(input);
    assert_eq!(result, expected);
}

#[test]
fn test_internal_fetch_leaves_minio_url_untouched() {
    let input = "http://minio:9000/doc-storage/key?X-Amz-Signature=abc";
    let expected = "http://minio:9000/doc-storage/key?X-Amz-Signature=abc";

    let result = transform_internal_url(input);
    assert_eq!(result, expected);
}

#[test]
fn explicit_s3_endpoint_disables_localstack_s3_behavior() {
    assert!(!s3_uses_localstack_with_endpoint(
        true,
        Some("http://minio:9000")
    ));
    assert!(s3_uses_localstack_with_endpoint(true, None));
    assert!(!s3_uses_localstack_with_endpoint(false, None));
}

#[cfg(feature = "s3")]
#[tokio::test]
async fn explicit_s3_endpoint_overrides_localstack_for_presigned_urls() {
    use std::time::Duration;

    use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};

    let s3_endpoint_url = "http://minio:9000";
    let config = s3_config_builder(
        aws_sdk_s3::config::Builder::new()
            .behavior_version(BehaviorVersion::latest())
            .region(Region::new("us-east-1"))
            .credentials_provider(Credentials::new("test", "test", None, None, "test"))
            .endpoint_url("http://localstack:4566"),
        Some(s3_endpoint_url),
        s3_uses_localstack_with_endpoint(true, Some(s3_endpoint_url)),
    )
    .build();

    let presigned_url = aws_sdk_s3::Client::from_conf(config)
        .get_object()
        .bucket("doc-storage")
        .key("path/file.txt")
        .presigned(
            aws_sdk_s3::presigning::PresigningConfig::expires_in(Duration::from_secs(60))
                .expect("valid presigning duration"),
        )
        .await
        .expect("presigning succeeds without network access");

    assert!(
        presigned_url
            .uri()
            .starts_with("http://minio:9000/doc-storage/path/file.txt?"),
        "{}",
        presigned_url.uri()
    );
}

#[cfg(feature = "s3")]
#[test]
fn explicit_s3_endpoint_uses_its_own_credential_configuration() {
    assert_eq!(
        s3_config_source(Some("http://minio:9000")),
        S3ConfigSource::ExplicitEndpoint
    );
    assert_eq!(s3_config_source(None), S3ConfigSource::SharedAws);
}
