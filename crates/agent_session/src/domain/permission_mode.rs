//! How a managed sandbox answers OpenCode tool permission prompts.

use serde::{Deserialize, Serialize};

#[cfg(test)]
mod test;

/// Session-level OpenCode permission mode.
///
/// Fail-closed default is [`Self::Ask`]. More permissive modes must be
/// requested explicitly on session create; they never include leaving the
/// workspace, and they are not ACP `AllowAlways`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(utoipa::ToSchema))]
#[serde(rename_all = "lowercase")]
pub enum SessionPermissionMode {
    /// Auto-approve tool calls inside the sandbox.
    Yolo,
    /// Auto-approve edits; still ask for other tools.
    Task,
    /// Approve each tool call.
    Control,
    /// Fail-closed: ask every tool, deny leaving the workspace.
    #[default]
    Ask,
}
