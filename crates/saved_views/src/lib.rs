mod pgsql;
mod storage;
#[cfg(test)]
mod test;
use chrono::{DateTime, Utc};
use macro_uuid::generate_uuid_v7;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

pub use pgsql::PgViewStorage;
pub use storage::{ExcludedDefaultViewStorage, ViewPatch, ViewStorage};

/// The only dashboard identity accepted by the personal saved-view writer.
pub const PERSONAL_DASHBOARD_ID: &str = "dashboard:personal";

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PersonalDashboardConfig {
    pub kind: String,
    pub id: String,
    pub version: u8,
    pub revision: i64,
    pub preset: PersonalDashboardPreset,
    pub widgets: Vec<PersonalDashboardWidget>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PersonalDashboardPreset {
    Focus,
    Day,
    Blank,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PersonalDashboardWidget {
    Tasks,
    Calendar,
    Transcript,
}

impl PersonalDashboardConfig {
    /// Validate a complete replacement, including its CAS revision and bounded catalog.
    pub fn parse(value: serde_json::Value, expected_revision: i64) -> Result<Self, &'static str> {
        let config: Self =
            serde_json::from_value(value).map_err(|_| "Invalid dashboard configuration")?;
        if config.kind != "dashboard"
            || config.id != PERSONAL_DASHBOARD_ID
            || config.version != 1
            || !(0..i64::MAX).contains(&expected_revision)
            || config.revision != expected_revision + 1
            || config.widgets.len() > 3
            || config
                .widgets
                .iter()
                .enumerate()
                .any(|(index, widget)| config.widgets[..index].contains(widget))
        {
            return Err("Invalid personal dashboard layout or revision");
        }
        Ok(config)
    }
}

#[derive(Serialize, Deserialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub id: Uuid,
    pub user_id: String,
    pub name: String,
    /// It is an explicit choice that the structure of the view configuration
    /// is up to the frontend. The structure and composition of view configuration
    /// is still very much in flux.
    pub config: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl View {
    pub fn new(user_id: String, name: String, config: serde_json::Value) -> Self {
        let now = Utc::now();
        Self {
            id: generate_uuid_v7(),
            user_id,
            name,
            config,
            created_at: now,
            updated_at: now,
        }
    }
}

/// Frontend can define any set of its own default views for the user.
/// This is a list of views that are excluded from the default views list on the frontend.
///
/// It is important that the frontend can quickly iterate on default views, for that reason
/// we don't keep track of default views in the database, only those that are explicitly excluded.
#[derive(Serialize, Deserialize, Debug, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExcludedDefaultView {
    id: Uuid,
    pub user_id: String,
    pub default_view_id: String,
}

impl ExcludedDefaultView {
    pub fn new(user_id: String, default_view_id: String) -> Self {
        Self {
            id: generate_uuid_v7(),
            user_id,
            default_view_id,
        }
    }
}
