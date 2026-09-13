//! Domain layer: models, ports (trait interfaces), and service implementation.

/// Canvas board JSON as a Loro CRDT snapshot.
pub mod canvas_loro;

/// Event-to-activity mappings for this domain.
pub mod activity;
pub mod branch_name;
pub mod content;
/// Unified entity-mutation capability impls.
#[cfg(feature = "service")]
pub mod entity_mutation;
pub mod events;
#[cfg(feature = "ports")]
pub mod markdown_backfill;

#[cfg(feature = "document_create")]
pub mod create;

#[cfg(feature = "ports")]
pub mod upload_finalize;

pub mod models;
#[cfg(feature = "axum")]
pub mod permission_token;
pub mod response;

#[cfg(feature = "ports")]
pub mod ports;

#[cfg(feature = "service")]
pub mod service;
