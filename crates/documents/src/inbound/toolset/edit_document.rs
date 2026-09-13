//! EditDocument tool — Loro markdown edits, or canvas JSON overwrite.

use crate::domain::models::DocumentError;
use crate::domain::permission_token::encode_permission_token;
use crate::domain::ports::{
    DocumentService, create::DocumentCreationService, editing::EditingWorkerService,
};
use ai_toolset::{AsyncTool, RequestContext, ServiceContext, ToolCallError, ToolResult};
use ai_toolset::{ToolAnnotated, ToolAnnotations};
use async_trait::async_trait;
use entity_access::domain::{
    models::{EditAccessLevel, EntityType},
    ports::EntityAccessService,
};
use model::document::{DocumentBasic, FileType};
use models_permissions::share_permission::access_level::AccessLevel;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::DocumentToolContext;
use super::create_document::document_text_for_create;

#[cfg(test)]
mod test;

#[derive(Debug, Deserialize, JsonSchema)]
#[schemars(
    title = "EditDocument",
    description = "Edit a Conation markdown document in place, or overwrite a canvas with the same JSON the app saves ({\"nodes\":[],\"edges\":[]}). Markdown uses `instructions` through the collaborative editor. Canvas uses `fileContent` — the same JSON CreateDocument writes. Uploaded files -- PDFs, DOCX, spreadsheets, images, source files such as .py or .ts -- are readable but not editable. If the response contains a `clarification` field, invoke again with the requested info appended to `instructions`. To insert mention(s), include each person's userId and email. To insert document-card(s), include each document's documentId and documentName."
)]
pub struct EditDocument {
    #[schemars(
        description = "The ID of the markdown or canvas document to edit. Call ReadMetadata first if you are not certain of `fileType`. Markdown is `md`; canvas is `canvas`. Other uploaded files fail."
    )]
    pub document_id: String,
    #[schemars(
        description = "Natural language instructions for markdown. Ignored when overwriting a canvas with `fileContent`."
    )]
    pub instructions: String,
    #[schemars(
        description = "For canvas documents, the same JSON the UI saves ({nodes, edges}). Extra keys such as groups are fine. Required to overwrite an existing canvas; omit for markdown."
    )]
    #[serde(default)]
    pub file_content: Option<String>,
}

fn failed_to_overwrite_canvas(error: DocumentError) -> ToolCallError {
    let description = match &error {
        DocumentError::BadRequest(message) => message.clone(),
        _ => "failed to overwrite canvas".to_string(),
    };
    ToolCallError {
        description,
        internal_error: error.into(),
    }
}

fn canvas_overwrite_text(file_content: Option<&str>) -> Result<String, ToolCallError> {
    let Some(file_content) = file_content else {
        return Err(ToolCallError {
            description: "canvas overwrite requires fileContent JSON matching the UI save format {\"nodes\":[],\"edges\":[]}".to_string(),
            internal_error: anyhow::anyhow!("canvas EditDocument called without fileContent"),
        });
    };
    document_text_for_create("canvas", file_content).map_err(failed_to_overwrite_canvas)
}

/// The editing worker opens a sync-service session and blocks on the initial
/// Loro snapshot. Only markdown documents ever get a Loro doc, so anything else
/// waits out the worker's handshake timeout and surfaces as an opaque gateway
/// error. Reject those up front instead.
///
/// This gates on the file type rather than the document's current content
/// location on purpose. Markdown uploaded to S3 is initialized into sync-service
/// when its upload finalizes, so its location is legitimately `object_storage`
/// for the width of that window while the Loro doc is still being created. The
/// sync session tolerates that -- the server broadcasts the snapshot to sockets
/// already waiting once `/initialize` lands. Gating on location would reject an
/// edit that window is designed to serve; the file type does not move.
fn ensure_markdown(document: &DocumentBasic) -> Result<(), ToolCallError> {
    if document.try_file_type() == Some(FileType::Md) {
        return Ok(());
    }

    let file_type = document.file_type.as_deref().unwrap_or("unknown");
    Err(ToolCallError {
        description: format!(
            "this document cannot be edited: it is a `{file_type}` file, not a Conation markdown document. AI editing only works on markdown documents authored in Conation's collaborative editor -- uploaded files (PDFs, DOCX, images, source files, and so on) are readable but not editable. Report this back to the user rather than retrying."
        ),
        internal_error: anyhow::anyhow!("document file type {file_type} is not markdown"),
    })
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct EditDocumentResponse {
    /// A short outcome for the model -- whether the edit was applied or
    /// interrupted -- never the underlying list of edit operations.
    pub summary: String,
    /// If present, invoke this tool again with this information appended to `instructions`.
    pub clarification: Option<String>,
}

impl ToolAnnotated for EditDocument {
    const ANNOTATIONS: ToolAnnotations = ToolAnnotations::destructive("Edit document");
}

#[async_trait]
impl<DSvc, ESvc, EDSvc> AsyncTool<DocumentToolContext<DSvc, ESvc, EDSvc>> for EditDocument
where
    DSvc: DocumentService + DocumentCreationService,
    ESvc: EntityAccessService,
    EDSvc: EditingWorkerService,
{
    type Output = EditDocumentResponse;

    #[tracing::instrument(skip_all, fields(document_id = %self.document_id), err)]
    async fn call(
        &self,
        ctx: ServiceContext<DocumentToolContext<DSvc, ESvc, EDSvc>>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        ctx.entity_access_service
            .generate_entity_access_receipt::<EditAccessLevel>(
                &request_context.user_id,
                None,
                &self.document_id,
                EntityType::Document,
            )
            .await
            .map_err(|e| ToolCallError {
                description: "you do not have edit access to this document".to_string(),
                internal_error: e.into(),
            })?;

        let document = ctx
            .service
            .internal_get_basic_document(&self.document_id)
            .await
            .map_err(|e| ToolCallError {
                description: "unable to look up this document".to_string(),
                internal_error: e.into(),
            })?;

        if document.try_file_type() == Some(FileType::Canvas) {
            let text = canvas_overwrite_text(self.file_content.as_deref())?;
            ctx.service
                .overwrite_plain_text(&self.document_id, FileType::Canvas, text)
                .await
                .map_err(failed_to_overwrite_canvas)?;
            return Ok(EditDocumentResponse {
                summary: "Overwrote canvas JSON.".to_string(),
                clarification: None,
            });
        }

        ensure_markdown(&document)?;

        let document_token = encode_permission_token(
            Some(request_context.user_id.to_string()),
            self.document_id.clone(),
            AccessLevel::Edit,
            &ctx.document_permission_jwt_secret,
        )
        .map_err(|e| ToolCallError {
            description: "failed to mint document token".to_string(),
            internal_error: e.into(),
        })?;

        // Honor user cancellation: if the request is cancelled mid-edit, drop the
        // in-flight worker call (closing the HTTP connection so the worker aborts
        // its own LLM work) and surface a `cancelled` tool error -- matching how
        // the chat stream renders cancellation for tool calls that never returned.
        let result = tokio::select! {
            _ = request_context.cancel.cancelled() => {
                return Err(ToolCallError {
                    description: "cancelled".to_string(),
                    internal_error: anyhow::anyhow!("edit cancelled by user. document might be left in a partially edited state."),
                });
            }
            r = ctx.editing.edit(&self.document_id, &document_token, &self.instructions) => r,
        }
        .map_err(|e| ToolCallError {
            description: e.to_string(),
            internal_error: e,
        })?;

        // The worker runs several models on the caller's behalf; record each so
        // their tokens land on the usage ledger (attributed to this user).
        let entity = conation_uuid::string_to_uuid(&self.document_id).ok();
        for u in &result.usage {
            let cx = ai_usage::UsageContext::new(
                ai_usage::AiFeature::AiEditing,
                request_context.user_id.clone(),
            )
            .with_entity(entity);
            ctx.recorder.record(cx.into_event(
                u.model.clone(),
                u.input_tokens as u64,
                u.output_tokens as u64,
            ));
        }

        let summary = if result.clarification.is_some() {
            "Paused for clarification; no edits applied.".to_string()
        } else {
            format!("Applied {} edit(s) to the document.", result.edits_applied)
        };

        Ok(EditDocumentResponse {
            summary,
            clarification: result.clarification,
        })
    }
}
