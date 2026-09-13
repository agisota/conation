//! Port definitions for markdown document initialization.

use std::future::Future;

use crate::domain::models::DocumentError;

/// Initializes markdown document content in the collaborative editor backend.
pub trait MarkdownInitializationPort: Send + Sync {
    /// Initialize an already-created markdown document and return the canonical snapshot.
    fn initialize_existing_markdown(
        &self,
        document_id: &str,
        markdown: &str,
    ) -> impl Future<Output = Result<Vec<u8>, DocumentError>> + Send;

    /// Encode canvas JSON as a Loro snapshot and seed sync-service when wired.
    ///
    /// Default implementation encodes only (no HTTP) so fakes stay HTTP-free.
    fn initialize_existing_canvas(
        &self,
        _document_id: &str,
        json: &str,
    ) -> impl Future<Output = Result<Vec<u8>, DocumentError>> + Send {
        async move {
            crate::domain::canvas_loro::snapshot_from_json(json)
                .map_err(|e| DocumentError::BadRequest(e.to_string()))
        }
    }
}

/// Utilities from the lexical service
#[cfg_attr(test, mockall::automock)]
pub trait LexicalSnapshotPort: Send + Sync + 'static {
    /// Convert markdown to loro via lexical using lexical service
    fn markdown_to_loro_snapshot(
        &self,
        markdown: &str,
    ) -> impl Future<Output = anyhow::Result<Vec<u8>>> + Send;
}

/// Utilities for the worker/do
#[cfg_attr(test, mockall::automock)]
pub trait SyncInitializeSnapshotPort: Send + Sync + 'static {
    /// "Boot" a durable object from a loro snapshot via the worker/do
    fn initialize_from_snapshot(
        &self,
        document_id: &str,
        snapshot: &[u8],
    ) -> impl Future<Output = anyhow::Result<()>> + Send;
}
