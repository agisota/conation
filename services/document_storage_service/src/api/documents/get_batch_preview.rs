use std::collections::HashSet;

use crate::api::context::{ApiContext, AuthorizationService};
use crate::model::{
    request::documents::preview::GetBatchPreviewRequest,
    response::documents::preview::GetBatchPreviewResponse,
};
use anyhow::Result;
use axum::extract::Json;
use axum::extract::State;
use axum::response::{IntoResponse, Response};
use macro_authorization::{OptionalMacroAuthorizationExtractor, UserOrInternalService};
use entity_access::domain::models::AccessError;
use entity_access::domain::ports::EntityAccessService;
use model::document::{DocumentPreview, DocumentPreviewV2, WithDocumentId};
use model::response::{GenericErrorResponse, GenericResponse};
use model_entity::EntityType;
use reqwest::StatusCode;

#[tracing::instrument(
    skip(ctx, user, req),
    fields(actor = tracing::field::Empty)
)]
#[utoipa::path(
    tag = "document",
    post,
    path = "/documents/preview",
    responses(
        (status = 200, body=GetBatchPreviewResponse),
        (status = 401, body=GenericErrorResponse),
        (status = 404, body=GenericErrorResponse),
        (status = 500, body=GenericErrorResponse),
    )
)]
pub async fn get_batch_preview_handler(
    State(ctx): State<ApiContext>,
    user: OptionalMacroAuthorizationExtractor<AuthorizationService, UserOrInternalService>,
    Json(req): Json<GetBatchPreviewRequest>,
) -> Result<(StatusCode, Json<GetBatchPreviewResponse>), Response> {
    if let Some(actor) = user.acting_entity() {
        tracing::Span::current().record("actor", tracing::field::display(actor));
    }

    // Ensure the document ids are unique to prevent duplicate work
    let unique_document_ids: HashSet<String> = req.document_ids.iter().cloned().collect();
    let document_ids: Vec<String> = unique_document_ids.into_iter().collect();

    let document_preview_results =
        conation_db_client::document::preview::batch_get_document_preview_v2(
            &ctx.db,
            &document_ids,
        )
        .await
        .map_err(|err| {
            tracing::error!(error=?err, "unable to get document preview");
            GenericResponse::builder()
                .message("failed to retrive document previews")
                .is_error(true)
                .send(StatusCode::INTERNAL_SERVER_ERROR)
                .into_response()
        })?;

    let skip_access_check = user
        .authorization
        .as_ref()
        .is_some_and(|auth| auth.is_internal());
    let user_id = user
        .authorization
        .as_ref()
        .and_then(|auth| auth.acting_user())
        .map(|acting_user| acting_user.macro_user_id.clone());

    let mut result = Vec::with_capacity(document_preview_results.len());
    for preview in document_preview_results {
        match preview {
            DocumentPreviewV2::DoesNotExist(preview_data) => {
                result.push(DocumentPreview::DoesNotExist(WithDocumentId {
                    document_id: preview_data.document_id,
                }));
            }
            DocumentPreviewV2::Found(preview_data) => {
                if skip_access_check {
                    result.push(DocumentPreview::Access(preview_data));
                    continue;
                }

                let has_access = match ctx
                    .entity_access_service
                    .get_access_level(
                        user_id.as_ref().map(|v| &**v),
                        &preview_data.document_id,
                        EntityType::Document,
                    )
                    .await
                {
                    Ok(level) => level.is_some(),
                    Err(
                        AccessError::Unauthorized
                        | AccessError::UnauthorizedWithMessage(_)
                        | AccessError::BadRequest(_)
                        | AccessError::NotFound(_),
                    ) => false,
                    Err(err) => {
                        tracing::error!(error=?err, "unable to check document preview access");
                        return Err(GenericResponse::builder()
                            .message("failed to retrive document previews")
                            .is_error(true)
                            .send(StatusCode::INTERNAL_SERVER_ERROR)
                            .into_response());
                    }
                };

                if has_access {
                    result.push(DocumentPreview::Access(preview_data));
                } else {
                    result.push(DocumentPreview::NoAccess(WithDocumentId {
                        document_id: preview_data.document_id,
                    }));
                }
            }
        }
    }

    Ok((
        StatusCode::OK,
        Json(GetBatchPreviewResponse { previews: result }),
    ))
}
