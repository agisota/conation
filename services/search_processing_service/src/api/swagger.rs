use utoipa::OpenApi;

use crate::api::health;
use model::response::EmptyResponse;

#[derive(OpenApi)]
#[openapi(
        info(
                terms_of_service = "https://conation.dev/terms",
                license(name = "GNU Affero General Public License v3.0", identifier = "AGPL-3.0-only"),
        ),
        paths(
                /// /health
                health::health_handler,
        ),
        components(
            schemas(
                        EmptyResponse,
                ),
        ),
        tags(
            (name = "search processing service", description = "Conation Search Processing Service")
        )
    )]
pub struct ApiDoc;
