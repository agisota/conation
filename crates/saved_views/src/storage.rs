use serde::{Deserialize, Serialize};
use std::future::Future;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{ExcludedDefaultView, View};

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct ViewPatch {
    pub name: Option<String>,
    pub config: Option<serde_json::Value>,
}

pub trait ViewStorage {
    type Err;
    /// Create a new view
    fn create_view(&self, view: &View) -> impl Future<Output = Result<(), Self::Err>> + Send;
    /// Atomically insert or replace this owner's personal board only at the expected revision.
    /// A missing result denotes a stale revision, including a competing first insert.
    fn upsert_personal_dashboard(
        &self,
        view: &View,
        expected_revision: i64,
    ) -> impl Future<Output = Result<Option<View>, Self::Err>> + Send;
    /// Get all views for a user
    fn get_views_for_user(
        &self,
        user_id: &str,
    ) -> impl Future<Output = Result<Vec<View>, Self::Err>> + Send;
    /// Patch a view
    fn patch_view(
        &self,
        id: Uuid,
        user_id: &str,
        patch: ViewPatch,
    ) -> impl Future<Output = Result<bool, Self::Err>> + Send;
    /// Delete an owned view; false means missing or inaccessible.
    fn delete_view(
        &self,
        id: Uuid,
        user_id: &str,
    ) -> impl Future<Output = Result<bool, Self::Err>> + Send;
}

pub trait ExcludedDefaultViewStorage {
    type Err;
    /// Create a new view
    fn create_excluded_default_view(
        &self,
        view: ExcludedDefaultView,
    ) -> impl Future<Output = Result<(), Self::Err>> + Send;
    /// Get all views for a user
    fn get_excluded_default_views_for_user(
        &self,
        user_id: &str,
    ) -> impl Future<Output = Result<Vec<ExcludedDefaultView>, Self::Err>> + Send;
}
