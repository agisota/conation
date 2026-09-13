use super::*;

use std::sync::{Arc, Mutex};

use crate::domain::content::DocumentContent;
use crate::domain::events::InteractionReason;
use crate::domain::models::{
    CommentThread, CreateDocumentRepoArgs, CreateTaskRequest, DocumentError,
    DocumentTeamShareResponse, EditDocumentServiceArgs, GithubPullRequestsResponse,
    ImportEmailAttachmentRepoArgs, LocationQueryParams, TaskBranchName,
};
use crate::domain::ports::editing::{EditResult, EditingWorkerService};
use crate::domain::response::{
    CreateDocumentResponseData, DocumentResponse, GetDocumentResponseData, LocationResponseV3,
};
use conation_sync_service_jwt::DocumentPermissionToken;
use conation_user_id::{lowercased::Lowercase, user_id::MacroUserId, user_id::MacroUserIdStr};
use entity_access::domain::models::{
    AccessError, BotAccessScope, BotId, CallChannelInfo, EntityAccessReceipt, EntityPermission,
    MemberTeamRole, OwnerAccessLevel, RequiredPermission, TeamRole, UserTeamInfo, ViewAccessLevel,
};
use lexical_client::LexicalClient;
use model::{
    document::{DocumentBasic, FileType},
    sync_service::SyncServiceVersionID,
};
use model_entity::Entity;
use sync_service_client::SyncServiceClient;
use uuid::Uuid;

const TEST_USER_ID: &str = "conation|editor@example.com";
const TEST_DOCUMENT_ID: &str = "019fd3b9-3c6c-7c05-89c2-a27f0121813b";

fn document_with_file_type(file_type: Option<&str>) -> DocumentBasic {
    DocumentBasic {
        document_id: TEST_DOCUMENT_ID.to_string(),
        document_name: "Test document".to_string(),
        owner: MacroUserIdStr::try_from(TEST_USER_ID.to_string())
            .expect("test user id should be valid"),
        file_type: file_type.map(str::to_string),
        sub_type: None,
        branched_from_id: None,
        branched_from_version_id: None,
        document_family_id: None,
        project_id: None,
        deleted_at: None,
    }
}

struct FakeDocumentService {
    file_type: Option<String>,
    overwrites: Arc<Mutex<Vec<(String, String)>>>,
    stored: Arc<Mutex<Option<String>>>,
    read_error: Arc<Mutex<Option<String>>>,
}

impl FakeDocumentService {
    fn new(file_type: &str) -> Self {
        Self {
            file_type: Some(file_type.to_string()),
            overwrites: Arc::new(Mutex::new(Vec::new())),
            stored: Arc::new(Mutex::new(None)),
            read_error: Arc::new(Mutex::new(None)),
        }
    }

    fn with_stored_board(self, json: &str) -> Self {
        *self.stored.lock().expect("stored lock poisoned") = Some(json.to_string());
        self
    }

    fn with_read_error(self, message: &str) -> Self {
        *self.read_error.lock().expect("read_error lock poisoned") = Some(message.to_string());
        self
    }
}

impl Clone for FakeDocumentService {
    fn clone(&self) -> Self {
        Self {
            file_type: self.file_type.clone(),
            overwrites: self.overwrites.clone(),
            stored: self.stored.clone(),
            read_error: self.read_error.clone(),
        }
    }
}

impl DocumentService for FakeDocumentService {
    async fn internal_get_basic_document(
        &self,
        _document_id: &str,
    ) -> Result<DocumentBasic, DocumentError> {
        Ok(document_with_file_type(self.file_type.as_deref()))
    }

    // The guard reads the file type, which the basic document already carries.
    // Resolving the content location would be a second read of the same row --
    // and a racy one while an upload is still being finalized into sync-service.
    async fn get_document_content(
        &self,
        _document_context: &DocumentBasic,
    ) -> Result<DocumentContent, DocumentError> {
        panic!("unexpected get_document_content call")
    }

    async fn get_document_by_team_slug(
        &self,
        _team_receipt: EntityAccessReceipt<MemberTeamRole>,
        _slug: &str,
    ) -> Result<String, DocumentError> {
        panic!("unexpected get_document_by_team_slug call")
    }

    async fn get_document(
        &self,
        _entity_access_receipt: EntityAccessReceipt<ViewAccessLevel>,
    ) -> Result<GetDocumentResponseData, DocumentError> {
        panic!("unexpected get_document call")
    }

    async fn get_document_location(
        &self,
        _document_context: &DocumentBasic,
        _entity_access_receipt: EntityAccessReceipt<ViewAccessLevel>,
        _params: LocationQueryParams,
    ) -> Result<LocationResponseV3, DocumentError> {
        panic!("unexpected get_document_location call")
    }

    async fn delete_document(
        &self,
        _entity_access_receipt: EntityAccessReceipt<OwnerAccessLevel>,
        _project_id: Option<String>,
    ) -> Result<(), DocumentError> {
        panic!("unexpected delete_document call")
    }

    async fn get_document_text(
        &self,
        _entity_access_receipt: EntityAccessReceipt<ViewAccessLevel>,
    ) -> Result<String, DocumentError> {
        panic!("unexpected get_document_text call")
    }

    async fn get_document_comments(
        &self,
        _entity_access_receipt: EntityAccessReceipt<ViewAccessLevel>,
    ) -> Result<Vec<CommentThread>, DocumentError> {
        panic!("unexpected get_document_comments call")
    }

    async fn create_document(
        &self,
        _user_id: MacroUserIdStr<'static>,
        _args: CreateDocumentRepoArgs,
        _job_id: Option<String>,
    ) -> Result<CreateDocumentResponseData, DocumentError> {
        panic!("unexpected create_document call")
    }

    async fn import_email_attachment(
        &self,
        _user_id: MacroUserIdStr<'static>,
        _args: ImportEmailAttachmentRepoArgs,
    ) -> Result<CreateDocumentResponseData, DocumentError> {
        panic!("unexpected import_email_attachment call")
    }

    async fn get_short_id(
        &self,
        _entity_access_receipt: EntityAccessReceipt<ViewAccessLevel>,
    ) -> Result<String, DocumentError> {
        panic!("unexpected get_short_id call")
    }

    async fn get_task_branch_name(
        &self,
        _entity_access_receipt: EntityAccessReceipt<ViewAccessLevel>,
        _document_name: String,
    ) -> Result<TaskBranchName, DocumentError> {
        panic!("unexpected get_task_branch_name call")
    }

    async fn get_task_github_pull_requests(
        &self,
        _entity_access_receipt: EntityAccessReceipt<ViewAccessLevel>,
        _document_context: &DocumentBasic,
    ) -> Result<GithubPullRequestsResponse, DocumentError> {
        panic!("unexpected get_task_github_pull_requests call")
    }

    async fn edit_document(
        &self,
        _entity_access_receipt: EntityAccessReceipt<EditAccessLevel>,
        _document_context: DocumentBasic,
        _args: EditDocumentServiceArgs,
    ) -> Result<(), DocumentError> {
        panic!("unexpected edit_document call")
    }

    async fn update_task_status(
        &self,
        _entity_access_receipt: EntityAccessReceipt<EditAccessLevel>,
        _status: &str,
    ) -> Result<(), DocumentError> {
        panic!("unexpected update_task_status call")
    }

    async fn copy_document(
        &self,
        _entity_access_receipt: EntityAccessReceipt<ViewAccessLevel>,
        _document_context: DocumentBasic,
        _user_id: MacroUserIdStr<'static>,
        _document_name: String,
        _query_version_id: Option<i64>,
        _sync_version_id: Option<SyncServiceVersionID>,
    ) -> Result<DocumentResponse, DocumentError> {
        panic!("unexpected copy_document call")
    }

    async fn get_project_name(&self, _project_id: &str) -> Result<String, DocumentError> {
        panic!("unexpected get_project_name call")
    }

    async fn get_project_children(
        &self,
        _project_id: &str,
    ) -> Result<Vec<Entity<'static>>, DocumentError> {
        panic!("unexpected get_project_children call")
    }

    async fn handle_task_properties(
        &self,
        _user_id: MacroUserIdStr<'static>,
        _document_id: &str,
        _request: &CreateTaskRequest,
    ) -> Result<(), DocumentError> {
        panic!("unexpected handle_task_properties call")
    }

    async fn get_snapshot(&self, _document_id: &str) -> anyhow::Result<Option<Vec<u8>>> {
        panic!("unexpected get_snapshot call")
    }

    async fn upload_snapshot(&self, _document_id: &str, _bytes: Vec<u8>) -> anyhow::Result<()> {
        panic!("unexpected upload_snapshot call")
    }

    async fn record_interaction(
        &self,
        _document_id: &str,
        _reason: InteractionReason,
    ) -> anyhow::Result<()> {
        panic!("unexpected record_interaction call")
    }

    async fn get_team_share(
        &self,
        _entity_access_receipt: EntityAccessReceipt<ViewAccessLevel>,
    ) -> Result<DocumentTeamShareResponse, DocumentError> {
        panic!("unexpected get_team_share call")
    }

    async fn set_team_share(
        &self,
        _entity_access_receipt: EntityAccessReceipt<EditAccessLevel>,
        _share: bool,
    ) -> Result<DocumentTeamShareResponse, DocumentError> {
        panic!("unexpected set_team_share call")
    }
}

impl DocumentCreationService for FakeDocumentService {
    async fn create_document(
        &self,
        _user_id: MacroUserIdStr<'static>,
        _args: CreateDocumentRepoArgs,
        _job_id: Option<String>,
    ) -> Result<CreateDocumentResponseData, DocumentError> {
        panic!("unexpected create_document call")
    }

    async fn handle_task_properties(
        &self,
        _user_id: MacroUserIdStr<'static>,
        _document_id: &str,
        _request: &CreateTaskRequest,
    ) -> Result<(), DocumentError> {
        panic!("unexpected handle_task_properties call")
    }

    async fn mark_document_uploaded(&self, _document_id: &str) -> Result<(), DocumentError> {
        panic!("unexpected mark_document_uploaded call")
    }

    async fn set_document_content(
        &self,
        _document_id: &str,
        _content: DocumentContent,
    ) -> Result<(), DocumentError> {
        panic!("unexpected set_document_content call")
    }

    async fn cleanup_created_document(&self, _document_id: &str) {
        panic!("unexpected cleanup_created_document call")
    }

    async fn overwrite_plain_text(
        &self,
        document_id: &str,
        file_type: FileType,
        text: String,
    ) -> Result<(), DocumentError> {
        assert_eq!(file_type, FileType::Canvas);
        self.overwrites
            .lock()
            .expect("overwrites lock poisoned")
            .push((document_id.to_string(), text));
        Ok(())
    }

    async fn read_plain_text(&self, _document_id: &str) -> Result<Option<String>, DocumentError> {
        if let Some(message) = self
            .read_error
            .lock()
            .expect("read_error lock poisoned")
            .clone()
        {
            return Err(DocumentError::Internal(anyhow::anyhow!(message)));
        }
        Ok(self.stored.lock().expect("stored lock poisoned").clone())
    }
}

#[derive(Clone, Default)]
struct FakeEntityAccessService;

impl EntityAccessService for FakeEntityAccessService {
    async fn generate_entity_access_receipt<T: RequiredPermission>(
        &self,
        user_id: &MacroUserId<Lowercase<'_>>,
        _user_org_id: Option<i64>,
        entity_id: &str,
        entity_type: EntityType,
    ) -> Result<EntityAccessReceipt<T>, AccessError> {
        EntityAccessReceipt::try_new_authenticated_user(
            MacroUserIdStr::try_from(user_id.as_ref().to_string())
                .expect("test user id should be valid"),
            entity_access::domain::models::Entity {
                entity_id: entity_id.to_string(),
                entity_type,
            },
            EntityPermission::AccessLevel {
                access_level: AccessLevel::Owner,
            },
        )
    }

    async fn generate_bot_entity_access_receipt<T: RequiredPermission>(
        &self,
        _bot_id: BotId,
        _scope: BotAccessScope,
        _entity_id: &str,
        _entity_type: EntityType,
    ) -> Result<EntityAccessReceipt<T>, AccessError> {
        panic!("unexpected generate_bot_entity_access_receipt call")
    }

    async fn get_access_level(
        &self,
        _user_id: Option<&MacroUserId<Lowercase<'_>>>,
        _entity_id: &str,
        _entity_type: EntityType,
    ) -> Result<Option<AccessLevel>, AccessError> {
        panic!("unexpected get_access_level call")
    }

    async fn check_access(
        &self,
        _user_id: Option<&MacroUserId<Lowercase<'_>>>,
        _entity_id: &str,
        _entity_type: EntityType,
        _required_level: AccessLevel,
    ) -> Result<AccessLevel, AccessError> {
        panic!("unexpected check_access call")
    }

    async fn check_public_access(
        &self,
        _entity_id: &str,
        _entity_type: EntityType,
        _required_level: AccessLevel,
    ) -> Result<AccessLevel, AccessError> {
        panic!("unexpected check_public_access call")
    }

    async fn get_entity_permission(
        &self,
        _user_id: Option<&MacroUserId<Lowercase<'_>>>,
        _entity_id: &str,
        _entity_type: EntityType,
        _user_org_id: Option<i64>,
    ) -> Result<EntityPermission, AccessError> {
        panic!("unexpected get_entity_permission call")
    }

    async fn get_crm_entity_permission_with_team(
        &self,
        _user_id: Option<&MacroUserId<Lowercase<'_>>>,
        _entity_id: &str,
        _entity_type: EntityType,
    ) -> Result<(EntityPermission, Uuid, TeamRole), AccessError> {
        panic!("unexpected get_crm_entity_permission_with_team call")
    }

    async fn get_users_by_entity(
        &self,
        _entity_id: &str,
        _entity_type: EntityType,
    ) -> Result<Vec<MacroUserIdStr<'static>>, AccessError> {
        panic!("unexpected get_users_by_entity call")
    }

    async fn get_call_channel(
        &self,
        _call_id: &Uuid,
    ) -> Result<Option<CallChannelInfo>, AccessError> {
        panic!("unexpected get_call_channel call")
    }

    async fn get_call_channel_by_channel_id(
        &self,
        _channel_id: &Uuid,
    ) -> Result<Option<CallChannelInfo>, AccessError> {
        panic!("unexpected get_call_channel_by_channel_id call")
    }

    async fn get_user_team(
        &self,
        _user_id: &MacroUserId<Lowercase<'_>>,
    ) -> Result<Option<UserTeamInfo>, AccessError> {
        panic!("unexpected get_user_team call")
    }
}

#[derive(Clone, Default)]
struct FakeEditingWorker {
    edit_calls: Arc<Mutex<Vec<String>>>,
}

impl EditingWorkerService for FakeEditingWorker {
    async fn edit(
        &self,
        document_id: &str,
        _document_token: &DocumentPermissionToken,
        _instructions: &str,
    ) -> anyhow::Result<EditResult> {
        self.edit_calls
            .lock()
            .expect("edit calls lock poisoned")
            .push(document_id.to_string());

        Ok(EditResult {
            edits_applied: 1,
            usage: Vec::new(),
            clarification: None,
        })
    }

    async fn delete_traces(&self, _document_id: &str) -> anyhow::Result<()> {
        panic!("unexpected delete_traces call")
    }
}

type TestToolContext =
    DocumentToolContext<FakeDocumentService, FakeEntityAccessService, FakeEditingWorker>;

fn tool_context(
    service: FakeDocumentService,
    editing: FakeEditingWorker,
) -> ServiceContext<TestToolContext> {
    ServiceContext(DocumentToolContext::new(
        service,
        FakeEntityAccessService,
        LexicalClient::new(
            "unused-internal-key".to_string(),
            "http://localhost/lexical".to_string(),
        ),
        SyncServiceClient::new(
            "unused-internal-key".to_string(),
            "http://localhost/sync".to_string(),
        ),
        editing,
        "unused-jwt-secret".to_string(),
    ))
}

fn request_context() -> RequestContext {
    RequestContext::new(
        MacroUserIdStr::try_from(TEST_USER_ID.to_string()).expect("test user id should be valid"),
    )
}

async fn call_edit_document(
    file_type: &str,
) -> (ToolResult<EditDocumentResponse>, FakeEditingWorker) {
    let editing = FakeEditingWorker::default();
    let tool = EditDocument {
        document_id: TEST_DOCUMENT_ID.to_string(),
        instructions: "tidy up the imports".to_string(),
        file_content: None,
        canvas_ops: None,
    };

    let result = tool
        .call(
            tool_context(FakeDocumentService::new(file_type), editing.clone()),
            request_context(),
        )
        .await;

    (result, editing)
}

#[tokio::test]
async fn rejects_non_markdown_document_without_calling_the_worker() {
    let (result, editing) = call_edit_document("py").await;

    let error = result.expect_err("a source file should be rejected");
    assert!(
        error.description.contains("`py`"),
        "description should name the file type: {}",
        error.description
    );
    assert!(
        error.description.contains("cannot be edited"),
        "description should state the constraint: {}",
        error.description
    );
    assert!(
        editing
            .edit_calls
            .lock()
            .expect("edit calls lock poisoned")
            .is_empty(),
        "the editing worker must not be called for a rejected document"
    );
}

/// Also pins the mid-finalization case: the fake panics on
/// `get_document_content`, so reaching the worker proves the guard never
/// consulted the content location. Markdown uploaded to S3 is only initialized
/// into sync-service when its upload finalizes, and a location check during
/// that window would reject an edit the sync handshake is designed to serve.
#[tokio::test]
async fn allows_markdown_document() {
    let (result, editing) = call_edit_document("md").await;

    let response = result.expect("a markdown document should be editable");
    assert_eq!(response.summary, "Applied 1 edit(s) to the document.");
    assert_eq!(
        *editing.edit_calls.lock().expect("edit calls lock poisoned"),
        vec![TEST_DOCUMENT_ID.to_string()]
    );
}

#[test]
fn only_markdown_is_editable() {
    assert!(ensure_markdown(&document_with_file_type(Some("md"))).is_ok());

    for file_type in ["py", "pdf", "docx", "png", "csv", "not-a-file-type"] {
        assert!(
            ensure_markdown(&document_with_file_type(Some(file_type))).is_err(),
            "{file_type} never gets a Loro doc and must be rejected"
        );
    }

    assert!(
        ensure_markdown(&document_with_file_type(None)).is_err(),
        "a document with no file type must be rejected"
    );
}

async fn call_overwrite_canvas(
    file_content: Option<&str>,
) -> (
    ToolResult<EditDocumentResponse>,
    FakeDocumentService,
    FakeEditingWorker,
) {
    let service = FakeDocumentService::new("canvas");
    let editing = FakeEditingWorker::default();
    let tool = EditDocument {
        document_id: TEST_DOCUMENT_ID.to_string(),
        instructions: "add a box".to_string(),
        file_content: file_content.map(str::to_string),
        canvas_ops: None,
    };

    let result = tool
        .call(
            tool_context(service.clone(), editing.clone()),
            request_context(),
        )
        .await;

    (result, service, editing)
}

#[tokio::test]
async fn overwrites_canvas_json_without_calling_the_worker() {
    let json = r#"{"nodes":[{"id":"n1"}],"edges":[],"groups":[]}"#;
    let (result, service, editing) = call_overwrite_canvas(Some(json)).await;

    let response = result.expect("canvas JSON should overwrite");
    assert_eq!(response.summary, "Overwrote canvas JSON.");
    assert!(response.clarification.is_none());
    assert_eq!(
        *service.overwrites.lock().expect("overwrites lock poisoned"),
        vec![(TEST_DOCUMENT_ID.to_string(), json.to_string())]
    );
    assert!(
        editing
            .edit_calls
            .lock()
            .expect("edit calls lock poisoned")
            .is_empty(),
        "canvas overwrite must not use the Loro markdown worker"
    );
}

#[tokio::test]
async fn empty_canvas_file_content_writes_the_same_empty_board_as_create() {
    use crate::inbound::toolset::create_document::EMPTY_CANVAS_JSON;

    let (result, service, _) = call_overwrite_canvas(Some("  ")).await;
    result.expect("empty canvas body should become the UI empty board");
    assert_eq!(
        *service.overwrites.lock().expect("overwrites lock poisoned"),
        vec![(TEST_DOCUMENT_ID.to_string(), EMPTY_CANVAS_JSON.to_string())]
    );
}

#[tokio::test]
async fn canvas_overwrite_requires_file_content() {
    let (result, service, editing) = call_overwrite_canvas(None).await;
    let error = result.expect_err("canvas without fileContent should fail");
    assert!(
        error.description.contains("fileContent"),
        "description should ask for fileContent: {}",
        error.description
    );
    assert!(
        service
            .overwrites
            .lock()
            .expect("overwrites lock poisoned")
            .is_empty()
    );
    assert!(
        editing
            .edit_calls
            .lock()
            .expect("edit calls lock poisoned")
            .is_empty()
    );
}

#[tokio::test]
async fn canvas_overwrite_rejects_json_without_nodes_and_edges() {
    let (result, service, _) = call_overwrite_canvas(Some(r#"{"nodes":[]}"#)).await;
    result.expect_err("canvas JSON must include nodes and edges");
    assert!(
        service
            .overwrites
            .lock()
            .expect("overwrites lock poisoned")
            .is_empty()
    );
}

async fn call_canvas_ops(
    file_content: Option<&str>,
    canvas_ops: Option<Vec<crate::domain::canvas_loro::CanvasOp>>,
) -> (
    ToolResult<EditDocumentResponse>,
    FakeDocumentService,
    FakeEditingWorker,
) {
    call_canvas_ops_with(FakeDocumentService::new("canvas"), file_content, canvas_ops).await
}

async fn call_canvas_ops_with(
    service: FakeDocumentService,
    file_content: Option<&str>,
    canvas_ops: Option<Vec<crate::domain::canvas_loro::CanvasOp>>,
) -> (
    ToolResult<EditDocumentResponse>,
    FakeDocumentService,
    FakeEditingWorker,
) {
    let editing = FakeEditingWorker::default();
    let tool = EditDocument {
        document_id: TEST_DOCUMENT_ID.to_string(),
        instructions: "add a box".to_string(),
        file_content: file_content.map(str::to_string),
        canvas_ops,
    };

    let result = tool
        .call(
            tool_context(service.clone(), editing.clone()),
            request_context(),
        )
        .await;

    (result, service, editing)
}

#[tokio::test]
async fn canvas_ops_upsert_node_without_whole_board() {
    use crate::domain::canvas_loro::CanvasOp;

    let (result, service, editing) = call_canvas_ops(
        None,
        Some(vec![CanvasOp::UpsertNode {
            node: serde_json::json!({"id":"n1","type":"shape","x":8,"y":4}),
        }]),
    )
    .await;

    let response = result.expect("node-level op should apply");
    assert_eq!(response.summary, "Applied 1 canvas op(s).");
    let overwrites = service.overwrites.lock().expect("overwrites lock poisoned");
    assert_eq!(overwrites.len(), 1);
    let board: serde_json::Value = serde_json::from_str(&overwrites[0].1).unwrap();
    assert_eq!(board["nodes"][0]["id"], "n1");
    assert_eq!(board["nodes"][0]["x"], 8.0);
    assert_eq!(board["edges"], serde_json::json!([]));
    assert!(
        editing
            .edit_calls
            .lock()
            .expect("edit calls lock poisoned")
            .is_empty()
    );
}

#[tokio::test]
async fn canvas_ops_delete_from_file_content_base() {
    use crate::domain::canvas_loro::CanvasOp;

    let base = r#"{"nodes":[{"id":"a"},{"id":"b"}],"edges":[{"id":"e1"}]}"#;
    let (result, service, _) = call_canvas_ops(
        Some(base),
        Some(vec![
            CanvasOp::DeleteNode { id: "b".into() },
            CanvasOp::DeleteEdge { id: "e1".into() },
        ]),
    )
    .await;

    result.expect("delete ops should apply");
    let overwrites = service.overwrites.lock().expect("overwrites lock poisoned");
    let board: serde_json::Value = serde_json::from_str(&overwrites[0].1).unwrap();
    assert_eq!(board["nodes"], serde_json::json!([{"id":"a"}]));
    assert_eq!(board["edges"], serde_json::json!([]));
}

#[tokio::test]
async fn canvas_ops_empty_list_is_rejected() {
    let (result, service, editing) = call_canvas_ops(None, Some(vec![])).await;
    let error = result.expect_err("empty canvasOps should fail");
    assert!(
        error.description.contains("canvasOps"),
        "{}",
        error.description
    );
    assert!(
        service
            .overwrites
            .lock()
            .expect("overwrites lock poisoned")
            .is_empty()
    );
    assert!(
        editing
            .edit_calls
            .lock()
            .expect("edit calls lock poisoned")
            .is_empty()
    );
}

#[tokio::test]
async fn canvas_ops_load_from_object_storage_when_snapshot_missing() {
    use crate::domain::canvas_loro::CanvasOp;

    let stored = r#"{"nodes":[{"id":"keep","x":1,"y":2}],"edges":[{"id":"e1"}]}"#;
    let service = FakeDocumentService::new("canvas").with_stored_board(stored);
    let (result, service, editing) = call_canvas_ops_with(
        service,
        None,
        Some(vec![CanvasOp::UpsertNode {
            node: serde_json::json!({"id":"n2","type":"shape","x":8,"y":4}),
        }]),
    )
    .await;

    let response = result.expect("ops should apply onto the stored board");
    assert_eq!(response.summary, "Applied 1 canvas op(s).");
    let overwrites = service.overwrites.lock().expect("overwrites lock poisoned");
    let board: serde_json::Value = serde_json::from_str(&overwrites[0].1).unwrap();
    assert_eq!(board["nodes"].as_array().map(|n| n.len()), Some(2));
    assert_eq!(board["nodes"][0]["id"], "keep");
    assert_eq!(board["nodes"][1]["id"], "n2");
    assert_eq!(board["edges"], serde_json::json!([{"id":"e1"}]));
    assert!(
        editing
            .edit_calls
            .lock()
            .expect("edit calls lock poisoned")
            .is_empty()
    );
}

#[tokio::test]
async fn canvas_ops_do_not_start_empty_when_object_storage_read_fails() {
    use crate::domain::canvas_loro::CanvasOp;

    let service = FakeDocumentService::new("canvas").with_read_error("s3 unavailable");
    let (result, service, editing) = call_canvas_ops_with(
        service,
        None,
        Some(vec![CanvasOp::UpsertNode {
            node: serde_json::json!({"id":"n1","type":"shape","x":8,"y":4}),
        }]),
    )
    .await;

    let error = result.expect_err("ops must not start from empty when DSS read fails");
    assert!(
        error.description.contains("object storage") || error.description.contains("s3"),
        "{}",
        error.description
    );
    assert!(
        service
            .overwrites
            .lock()
            .expect("overwrites lock poisoned")
            .is_empty()
    );
    assert!(
        editing
            .edit_calls
            .lock()
            .expect("edit calls lock poisoned")
            .is_empty()
    );
}
