use super::*;

use std::sync::{Arc, Mutex};

use crate::domain::canvas_loro::snapshot_from_json;
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
use crate::inbound::toolset::DocumentToolContext;
use crate::inbound::toolset::create_document::EMPTY_CANVAS_JSON;
use conation_sync_service_jwt::DocumentPermissionToken;
use conation_user_id::{lowercased::Lowercase, user_id::MacroUserId, user_id::MacroUserIdStr};
use entity_access::domain::models::{
    AccessError, AccessLevel, BotAccessScope, BotId, CallChannelInfo, EditAccessLevel,
    EntityAccessReceipt, EntityPermission, MemberTeamRole, OwnerAccessLevel, RequiredPermission,
    TeamRole, UserTeamInfo, ViewAccessLevel,
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
        document_name: "Test canvas".to_string(),
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
    stored: Arc<Mutex<Option<String>>>,
    read_error: Arc<Mutex<Option<String>>>,
}

impl FakeDocumentService {
    fn new(file_type: &str) -> Self {
        Self {
            file_type: Some(file_type.to_string()),
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
        Ok(Vec::new())
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
        _document_id: &str,
        _file_type: FileType,
        _text: String,
    ) -> Result<(), DocumentError> {
        panic!("unexpected overwrite_plain_text call")
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
struct FakeEditingWorker;

impl EditingWorkerService for FakeEditingWorker {
    async fn edit(
        &self,
        _document_id: &str,
        _document_token: &DocumentPermissionToken,
        _instructions: &str,
    ) -> anyhow::Result<EditResult> {
        panic!("unexpected edit call")
    }

    async fn delete_traces(&self, _document_id: &str) -> anyhow::Result<()> {
        panic!("unexpected delete_traces call")
    }
}

type TestToolContext =
    DocumentToolContext<FakeDocumentService, FakeEntityAccessService, FakeEditingWorker>;

fn tool_context(
    service: FakeDocumentService,
    sync: SyncServiceClient,
) -> ServiceContext<TestToolContext> {
    ServiceContext(DocumentToolContext::new(
        service,
        FakeEntityAccessService,
        LexicalClient::new(
            "unused-internal-key".to_string(),
            "http://localhost/lexical".to_string(),
        ),
        sync,
        FakeEditingWorker,
        "unused-jwt-secret".to_string(),
    ))
}

fn offline_sync() -> SyncServiceClient {
    SyncServiceClient::new(
        "unused-internal-key".to_string(),
        "http://localhost/sync".to_string(),
    )
}

fn request_context() -> RequestContext {
    RequestContext::new(
        MacroUserIdStr::try_from(TEST_USER_ID.to_string()).expect("test user id should be valid"),
    )
}

fn board_text(content: Content) -> String {
    match content {
        Content::Text(text) => text,
        Content::Markdown(_) => panic!("canvas ReadContent must return board JSON, not markdown"),
    }
}

async fn call_read_content(
    service: FakeDocumentService,
    sync: SyncServiceClient,
) -> ToolResult<ReadContentResponse> {
    ReadContent {
        document_id: Uuid::parse_str(TEST_DOCUMENT_ID).expect("test document id"),
    }
    .call(tool_context(service, sync), request_context())
    .await
}

async fn serve_snapshot(bytes: Vec<u8>) -> SyncServiceClient {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind snapshot listener");
    let addr = listener.local_addr().expect("listener addr");
    tokio::spawn(async move {
        let app = axum::Router::new().route(
            "/document/{id}/snapshot",
            axum::routing::get(move || {
                let bytes = bytes.clone();
                async move { (axum::http::StatusCode::OK, bytes) }
            }),
        );
        let _ = axum::serve(listener, app).await;
    });
    SyncServiceClient::new("unused-internal-key".to_string(), format!("http://{addr}"))
}

#[test]
fn empty_or_unreadable_loro_snapshot_falls_through() {
    assert!(canvas_board_from_loro_snapshot(None).is_none());
    assert!(canvas_board_from_loro_snapshot(Some(&[])).is_none());
    assert!(canvas_board_from_loro_snapshot(Some(b"not-a-loro-snapshot")).is_none());
}

#[test]
fn readable_loro_snapshot_returns_nodes_and_edges() {
    let json = r#"{"nodes":[{"id":"live","x":3,"y":4}],"edges":[{"id":"e1"}]}"#;
    let snapshot = snapshot_from_json(json).expect("encode live board");
    let decoded = canvas_board_from_loro_snapshot(Some(&snapshot)).expect("decode");
    let board: serde_json::Value = serde_json::from_str(&decoded).unwrap();
    assert_eq!(board["nodes"][0]["id"], "live");
    assert_eq!(board["edges"][0]["id"], "e1");
}

#[tokio::test]
async fn canvas_read_returns_stored_dss_when_loro_missing() {
    let stored = r#"{"nodes":[{"id":"keep","x":1,"y":2}],"edges":[{"id":"e1"}]}"#;
    let result = call_read_content(
        FakeDocumentService::new("canvas").with_stored_board(stored),
        offline_sync(),
    )
    .await
    .expect("canvas ReadContent should load DSS when Loro is missing");
    let board: serde_json::Value = serde_json::from_str(&board_text(result.content)).unwrap();
    assert_eq!(board["nodes"][0]["id"], "keep");
    assert_eq!(board["edges"][0]["id"], "e1");
    assert!(result.comments.is_empty());
}

#[tokio::test]
async fn canvas_read_returns_empty_board_when_dss_missing() {
    let result = call_read_content(FakeDocumentService::new("canvas"), offline_sync())
        .await
        .expect("missing DSS object is an empty board");
    assert_eq!(board_text(result.content), EMPTY_CANVAS_JSON);
}

#[tokio::test]
async fn canvas_read_errors_when_object_storage_fails() {
    let error = call_read_content(
        FakeDocumentService::new("canvas").with_read_error("s3 unavailable"),
        offline_sync(),
    )
    .await
    .expect_err("failed DSS read must not become an empty board");
    assert!(
        error.description.contains("object storage") || error.description.contains("s3"),
        "{}",
        error.description
    );
}

#[tokio::test]
async fn canvas_read_prefers_live_loro_board_over_stale_dss() {
    let live = r#"{"nodes":[{"id":"live","type":"shape","x":8,"y":4}],"edges":[]}"#;
    let stale = r#"{"nodes":[{"id":"stale","x":1,"y":2}],"edges":[{"id":"old"}]}"#;
    let snapshot = snapshot_from_json(live).expect("encode live board");
    let result = call_read_content(
        FakeDocumentService::new("canvas").with_stored_board(stale),
        serve_snapshot(snapshot).await,
    )
    .await
    .expect("live Loro board should win over stale DSS");
    let board: serde_json::Value = serde_json::from_str(&board_text(result.content)).unwrap();
    assert_eq!(board["nodes"][0]["id"], "live");
    assert_eq!(board["edges"], serde_json::json!([]));
}

#[tokio::test]
async fn canvas_read_falls_back_to_dss_when_loro_snapshot_is_unreadable() {
    let stored = r#"{"nodes":[{"id":"keep"}],"edges":[]}"#;
    let result = call_read_content(
        FakeDocumentService::new("canvas").with_stored_board(stored),
        serve_snapshot(b"not-a-loro-snapshot".to_vec()).await,
    )
    .await
    .expect("unreadable Loro snapshot should fall through to DSS");
    let board: serde_json::Value = serde_json::from_str(&board_text(result.content)).unwrap();
    assert_eq!(board["nodes"][0]["id"], "keep");
}
