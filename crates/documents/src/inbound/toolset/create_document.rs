//! CreateDocument tool for reading document content.

use ai_toolset::{ToolAnnotated, ToolAnnotations};
use std::str::FromStr;

use crate::domain::create::{NewDocumentMetadata, NewPlainTextDocument};
use crate::domain::models::DocumentError;
use crate::domain::ports::DocumentService;
use crate::domain::ports::create::DocumentCreationService;
use crate::domain::ports::editing::EditingWorkerService;
use ai_toolset::{AsyncTool, RequestContext, ServiceContext, ToolCallError, ToolResult};
use anyhow::Context;
use async_trait::async_trait;
use conation_user_id::user_id::MacroUserIdStr;
use entity_access::domain::models::{EditAccessLevel, EntityType};
use entity_access::domain::ports::EntityAccessService;
use model::document::FileType;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::DocumentToolContext;

/// Same empty canvas the web create menu uploads (`createCanvasFileFromJsonString`).
pub const EMPTY_CANVAS_JSON: &str = r#"{"nodes":[],"edges":[]}"#;

/// True when the agent asked for a canvas the same way the UI does (`fileType: canvas`).
pub fn is_canvas_extension(file_extension: &str) -> bool {
    matches!(
        file_extension
            .trim()
            .trim_start_matches('.')
            .to_ascii_lowercase()
            .as_str(),
        "canvas"
    )
}

/// Normalize create-document text so a canvas without body matches the UI empty board.
pub fn document_text_for_create(
    file_extension: &str,
    file_content: &str,
) -> Result<String, DocumentError> {
    if !is_canvas_extension(file_extension) {
        return Ok(file_content.to_string());
    }
    let trimmed = file_content.trim();
    if trimmed.is_empty() {
        return Ok(EMPTY_CANVAS_JSON.to_string());
    }
    validate_canvas_json(trimmed)?;
    Ok(trimmed.to_string())
}

fn validate_canvas_json(file_content: &str) -> Result<(), DocumentError> {
    let value: serde_json::Value = serde_json::from_str(file_content).map_err(|_| {
        DocumentError::BadRequest(
            "canvas content must be JSON matching the UI save format {\"nodes\":[],\"edges\":[]}"
                .to_string(),
        )
    })?;
    let Some(obj) = value.as_object() else {
        return Err(DocumentError::BadRequest(
            "canvas content must be a JSON object with nodes and edges arrays".to_string(),
        ));
    };
    if !obj.get("nodes").is_some_and(|v| v.is_array())
        || !obj.get("edges").is_some_and(|v| v.is_array())
    {
        return Err(DocumentError::BadRequest(
            "canvas JSON must include nodes and edges arrays, same as the app Create canvas action"
                .to_string(),
        ));
    }
    Ok(())
}

fn failed_to_create_document(error: DocumentError) -> ToolCallError {
    let description = match &error {
        DocumentError::BadRequest(message) => message.clone(),
        DocumentError::NameTooLong { max } => {
            format!("name too long (max {max} characters)")
        }
        _ => "failed to create document".to_string(),
    };

    ToolCallError {
        description,
        internal_error: error.into(),
    }
}

/// The read content response
#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentResponse {
    /// The id of the document
    pub document_id: uuid::Uuid,
}

#[derive(Debug, Deserialize, JsonSchema, Clone, Default)]
#[serde(rename_all = "camelCase")]
#[schemars(
    title = "CreateDocument",
    description = "Create a plaintext document or a canvas. For a canvas use fileExtension \"canvas\" and the same JSON the app saves: {\"nodes\":[],\"edges\":[]} (extra keys such as groups are fine). An empty canvas body is filled with that empty board automatically — the same payload the Create canvas menu uploads."
)]
pub struct CreateDocument {
    #[schemars(description = "The name of the document without the file extension")]
    pub document_name: String,

    #[schemars(
        description = "The string content of the document you are creating. For canvas, the same JSON the UI uploads ({nodes, edges}). Leave empty to create a blank canvas."
    )]
    pub file_content: String,

    #[schemars(
        description = "The extension of the plaintext file you are creating. Use \"canvas\" for a canvas board (application/x-macro-canvas), same as the user Create canvas action."
    )]
    pub file_extension: String,

    #[schemars(description = "Whether this document is a task. Only applies to md documents.")]
    #[serde(default)]
    pub is_task: bool,

    #[schemars(
        description = "The id of the project (shown as a folder in the app UI) to create the document in. Requires edit access to the project. Omit to create the document at the top level of the user's files."
    )]
    #[serde(default)]
    pub project_id: Option<uuid::Uuid>,
}

impl ToolAnnotated for CreateDocument {
    const ANNOTATIONS: ToolAnnotations = ToolAnnotations::additive("Create document");
}

#[async_trait]
impl<DSvc, ESvc, EDSvc> AsyncTool<DocumentToolContext<DSvc, ESvc, EDSvc>> for CreateDocument
where
    DSvc: DocumentService + DocumentCreationService,
    ESvc: EntityAccessService,
    EDSvc: EditingWorkerService,
{
    type Output = CreateDocumentResponse;

    async fn call(
        &self,
        service_context: ServiceContext<DocumentToolContext<DSvc, ESvc, EDSvc>>,
        request_context: RequestContext,
    ) -> ToolResult<Self::Output> {
        tracing::info!(params=?self, "Create content");

        let parsed_file_type =
            FileType::from_str(&self.file_extension).map_err(|e| ToolCallError {
                description: format!("invalid file extension {}", self.file_extension),
                internal_error: e.into(),
            })?;
        let user_id: MacroUserIdStr<'static> = request_context.user_id.clone();

        // Mirrors the axum create route's project body extractor: creating
        // inside a project requires edit access to that project.
        if let Some(project_id) = self.project_id {
            service_context
                .entity_access_service
                .generate_entity_access_receipt::<EditAccessLevel>(
                    &user_id,
                    None,
                    &project_id.to_string(),
                    EntityType::Project,
                )
                .await
                .map_err(|e| ToolCallError {
                    description: "you need edit access to the target project, or it does not exist"
                        .to_string(),
                    internal_error: e.into(),
                })?;
        }

        // gets the members team if exists so we can track the task number correctly
        let maybe_team = if self.is_task {
            service_context
                .entity_access_service
                .get_user_team(&user_id)
                .await
                .map(|t| t.map(|tt| tt.team_id))
                .map_err(|e| ToolCallError {
                    description: "failed to get users team".to_string(),
                    internal_error: e.into(),
                })?
        } else {
            None
        };

        let mut metadata_builder = NewDocumentMetadata::builder(self.document_name.clone());
        if let Some(project_id) = self.project_id {
            metadata_builder = metadata_builder.project_id(project_id);
        }

        let document = NewPlainTextDocument::builder(metadata_builder.build())
            .file_type(parsed_file_type)
            .text(
                document_text_for_create(&self.file_extension, &self.file_content)
                    .map_err(failed_to_create_document)?,
            )
            .task_flag(self.is_task, maybe_team)
            .build()
            .map_err(failed_to_create_document)?;

        let response = service_context
            .creator
            .create_plain_text(user_id, document)
            .await
            .map(|document| document.into_response())
            .map_err(failed_to_create_document)?;

        tracing::trace!("created document");

        let document_id_str = response
            .document_response
            .document_metadata
            .metadata
            .document_id
            .to_string();

        let document_id = document_id_str
            .parse()
            .context("expected valid uuid")
            .map_err(|e| ToolCallError {
                internal_error: e,
                description: format!("invalid document id was output {}", document_id_str),
            })?;

        tracing::info!("got to end");
        Ok(CreateDocumentResponse { document_id })
    }
}
