//! Port definitions for backend-owned document creation.

use std::future::Future;
use std::sync::Arc;

use activity::Attribution;
use macro_user_id::user_id::MacroUserIdStr;

use crate::domain::content::DocumentContent;
use crate::domain::models::{CreateDocumentRepoArgs, CreateTaskRequest, DocumentError};
use crate::domain::response::CreateDocumentResponseData;
use model::document::FileType;

/// Uploaded document bytes and metadata for a presigned object-storage URL.
pub struct DocumentBytesUpload {
    /// Presigned URL to upload bytes to.
    pub presigned_url: String,
    /// Content type to send with the upload.
    pub content_type: String,
    /// Base64-encoded SHA-256 checksum to send with the upload.
    pub base64_sha256: String,
    /// Bytes to upload.
    pub bytes: Vec<u8>,
}

/// Uploads document bytes to object storage using a presigned URL.
pub trait DocumentBytesUploadPort: Send + Sync {
    /// Upload document bytes.
    fn upload_document_bytes(
        &self,
        upload: DocumentBytesUpload,
    ) -> impl Future<Output = Result<(), DocumentError>> + Send;
}

/// Service operations needed by backend-owned document creation.
pub trait DocumentCreationService: Send + Sync {
    /// Create a document metadata row and any service-owned creation side effects.
    fn create_document(
        &self,
        user_id: MacroUserIdStr<'static>,
        args: CreateDocumentRepoArgs,
        job_id: Option<String>,
    ) -> impl Future<Output = Result<CreateDocumentResponseData, DocumentError>> + Send;

    /// Assign task properties to a markdown task document.
    fn handle_task_properties(
        &self,
        user_id: MacroUserIdStr<'static>,
        document_id: &str,
        request: &CreateTaskRequest,
        attribution: &Attribution,
    ) -> impl Future<Output = Result<(), DocumentError>> + Send;

    /// Mark a created document's upload/finalization lifecycle as complete.
    fn mark_document_uploaded(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<(), DocumentError>> + Send;

    /// Set a created document's persisted content lifecycle metadata.
    fn set_document_content(
        &self,
        document_id: &str,
        content: DocumentContent,
    ) -> impl Future<Output = Result<(), DocumentError>> + Send;

    /// Clean up a document that failed after its database row was created.
    fn cleanup_created_document(&self, document_id: &str) -> impl Future<Output = ()> + Send;

    /// Overwrite a document's object-storage bytes with UTF-8 text.
    fn overwrite_plain_text(
        &self,
        document_id: &str,
        file_type: FileType,
        text: String,
    ) -> impl Future<Output = Result<(), DocumentError>> + Send;

    /// Read a document's object-storage bytes as UTF-8 text.
    fn read_plain_text(
        &self,
        document_id: &str,
    ) -> impl Future<Output = Result<Option<String>, DocumentError>> + Send;
}

impl<T> DocumentCreationService for Arc<T>
where
    T: DocumentCreationService + ?Sized,
{
    async fn create_document(
        &self,
        user_id: MacroUserIdStr<'static>,
        args: CreateDocumentRepoArgs,
        job_id: Option<String>,
    ) -> Result<CreateDocumentResponseData, DocumentError> {
        (**self).create_document(user_id, args, job_id).await
    }

    async fn handle_task_properties(
        &self,
        user_id: MacroUserIdStr<'static>,
        document_id: &str,
        request: &CreateTaskRequest,
        attribution: &Attribution,
    ) -> Result<(), DocumentError> {
        (**self)
            .handle_task_properties(user_id, document_id, request, attribution)
            .await
    }

    async fn mark_document_uploaded(&self, document_id: &str) -> Result<(), DocumentError> {
        (**self).mark_document_uploaded(document_id).await
    }

    async fn set_document_content(
        &self,
        document_id: &str,
        content: DocumentContent,
    ) -> Result<(), DocumentError> {
        (**self).set_document_content(document_id, content).await
    }

    async fn cleanup_created_document(&self, document_id: &str) {
        (**self).cleanup_created_document(document_id).await
    }

    async fn overwrite_plain_text(
        &self,
        document_id: &str,
        file_type: FileType,
        text: String,
    ) -> Result<(), DocumentError> {
        (**self)
            .overwrite_plain_text(document_id, file_type, text)
            .await
    }

    async fn read_plain_text(
        &self,
        document_id: &str,
    ) -> Result<Option<String>, DocumentError> {
        (**self).read_plain_text(document_id).await
    }
}
