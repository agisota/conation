#![deny(missing_docs)]

//! This crate creates a standard way to make AWS configs.

pub use aws_config::SdkConfig;
use conation_env_var::maybe_env_var;

maybe_env_var! {
    #[derive(Clone)]
    pub struct LocalAwsUrl;
}

maybe_env_var! {
    struct S3EndpointUrl;
}

#[cfg(feature = "s3")]
#[derive(Debug, Eq, PartialEq)]
enum S3ConfigSource {
    SharedAws,
    ExplicitEndpoint,
}

#[cfg(feature = "s3")]
fn s3_config_source(s3_endpoint_url: Option<&str>) -> S3ConfigSource {
    if s3_endpoint_url.is_some() {
        S3ConfigSource::ExplicitEndpoint
    } else {
        S3ConfigSource::SharedAws
    }
}

#[cfg(feature = "s3")]
async fn get_s3_aws_config(source: S3ConfigSource) -> aws_config::SdkConfig {
    match source {
        S3ConfigSource::SharedAws => get_conation_aws_config().await,
        S3ConfigSource::ExplicitEndpoint => {
            aws_config::defaults(aws_config::BehaviorVersion::latest())
                .region("us-east-1")
                .load()
                .await
        }
    }
}

#[cfg(feature = "s3")]
fn s3_config_builder(
    builder: aws_sdk_s3::config::Builder,
    s3_endpoint_url: Option<&str>,
    s3_uses_localstack: bool,
) -> aws_sdk_s3::config::Builder {
    let builder = builder.force_path_style(s3_uses_localstack || s3_endpoint_url.is_some());
    if let Some(s3_endpoint_url) = s3_endpoint_url {
        builder.endpoint_url(s3_endpoint_url)
    } else {
        builder
    }
}

/// Creates an S3 client.
///
/// An explicit `S3_ENDPOINT_URL` uses the normal AWS credential chain rather
/// than the fixed LocalStack test credentials selected by `LOCAL_AWS_URL`.
#[cfg(feature = "s3")]
pub async fn s3_client() -> aws_sdk_s3::Client {
    let s3_endpoint_url = S3EndpointUrl::new();
    let source = s3_config_source(s3_endpoint_url.as_deref());
    let s3_uses_localstack =
        s3_uses_localstack_with_endpoint(is_localstack(), s3_endpoint_url.as_deref());
    let s3_config = s3_config_builder(
        aws_sdk_s3::config::Builder::from(&get_s3_aws_config(source).await),
        s3_endpoint_url.as_deref(),
        s3_uses_localstack,
    )
    .build();
    aws_sdk_s3::Client::from_conf(s3_config)
}

/// Creates an SQS client
#[cfg(feature = "sqs")]
pub async fn sqs_client() -> aws_sdk_sqs::Client {
    aws_sdk_sqs::Client::new(&get_conation_aws_config().await)
}

/// Creates an AWS SDK config.
///
/// `LOCAL_AWS_URL` configures all AWS SDK clients to use LocalStack with test
/// credentials. S3-only endpoints are configured separately by [`s3_client`].
pub async fn get_conation_aws_config() -> aws_config::SdkConfig {
    if let Some(local_aws_url) = LocalAwsUrl::new() {
        local_aws_config(local_aws_url.as_ref()).await
    } else {
        aws_config::defaults(aws_config::BehaviorVersion::latest())
            .region("us-east-1")
            .load()
            .await
    }
}

/// Creates an AWS SDK config pointed at a LocalStack endpoint.
pub async fn local_aws_config(local_aws_url: &str) -> aws_config::SdkConfig {
    aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region("us-east-1")
        .test_credentials()
        .endpoint_url(local_aws_url)
        .load()
        .await
}

fn is_localstack() -> bool {
    LocalAwsUrl::new().is_some()
}

fn s3_uses_localstack_with_endpoint(
    localstack_enabled: bool,
    s3_endpoint_url: Option<&str>,
) -> bool {
    localstack_enabled && s3_endpoint_url.is_none()
}

/// Returns whether S3 requests use LocalStack.
///
/// An explicit `S3_ENDPOINT_URL` takes precedence over `LOCAL_AWS_URL`, so
/// S3-only endpoints such as MinIO do not use LocalStack URL transformations
/// or local-storage skips.
pub fn s3_uses_localstack() -> bool {
    s3_uses_localstack_with_endpoint(is_localstack(), S3EndpointUrl::new().as_deref())
}

/// internal method to transform the local aws url
fn transform_local_url(url: &str) -> String {
    // NOTE: it is ok to use expect as this is only run locally
    let parsed = url::Url::parse(url).expect("valid url");
    let host = parsed.host_str().unwrap();
    let port = parsed.port().unwrap_or(4566);
    let path = parsed.path();
    let query = parsed.query().map(|q| format!("?{q}")).unwrap_or_default();

    // Path-style LocalStack URLs generated inside Docker use `localstack` as
    // the host, which the browser on the host machine cannot resolve. Keep the
    // existing path (`/{bucket}/{key}`) and only swap the host to localhost.
    if host == "localstack" || host == "localhost" {
        return format!("http://localhost:{port}{path}{query}");
    }

    // hostname should be in the form {asset}.localstack or {asset}.localhost
    let asset = host
        .strip_suffix(".localstack")
        .or_else(|| host.strip_suffix(".localhost"))
        .unwrap();

    format!("http://localhost:{port}/{asset}{path}{query}")
}

/// Transforms a LocalStack S3 URL into one a browser can reach.
///
/// No-op unless S3 uses LocalStack; explicit endpoints such as MinIO remain
/// unchanged.
pub fn transform_aws_url(url: &str) -> String {
    if s3_uses_localstack() {
        return transform_local_url(url);
    }
    url.to_string()
}

/// internal method to transform a browser-facing local url into one reachable
/// from inside the docker network
fn transform_internal_url(url: &str) -> String {
    // NOTE: it is ok to use expect as this is only run locally
    let parsed = url::Url::parse(url).expect("valid url");
    let host = parsed.host_str().unwrap();
    let port = parsed.port().unwrap_or(4566);
    let path = parsed.path();
    let query = parsed.query().map(|q| format!("?{q}")).unwrap_or_default();

    // Browser-facing local URLs use `localhost`, which inside a container
    // resolves to the container itself. Swap it for the `localstack` service
    // hostname so service-to-service fetches reach LocalStack. Leave any other
    // host untouched.
    if host == "localhost" || host == "localstack" {
        return format!("http://localstack:{port}{path}{query}");
    }

    url.to_string()
}

/// Transforms a browser-facing LocalStack S3 URL into one reachable from
/// inside the app's own containers when fetching an object server-side.
///
/// The inverse of [`transform_aws_url`]: presigned and distribution URLs are
/// minted with the `localhost` host so the browser on the host machine can
/// reach LocalStack, but a service fetching the same object from inside the
/// Docker network must use the `localstack` service hostname. No-op unless S3
/// uses LocalStack.
pub fn transform_aws_url_for_internal_fetch(url: &str) -> String {
    if s3_uses_localstack() {
        return transform_internal_url(url);
    }
    url.to_string()
}

#[cfg(test)]
mod test;
