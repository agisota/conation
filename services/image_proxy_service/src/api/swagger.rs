use model::response::{EmptyResponse, ErrorResponse};
use utoipa::OpenApi;

use super::health;
use super::proxy::{self, ProxyParams};

#[derive(OpenApi)]
#[openapi(
    info(
        terms_of_service = "https://conation.dev/terms",
        license(name = "GNU Affero General Public License v3.0", identifier = "AGPL-3.0-only"),
    ),
    paths(
        health::health_handler,
        proxy::proxy_request_handler,
    ),
    components(
        schemas(
            EmptyResponse,
            ErrorResponse,
            ProxyParams,
        ),
    ),
    tags(
        (name = "macro image proxy service", description = "Image Proxy Service")
    )
)]
pub struct ApiDoc;
