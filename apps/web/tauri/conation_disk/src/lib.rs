//! Conation Disk domain (not Google Drive).
//!
//! Models personal vs space files, addressed shares, revocable public links
//! with expiry, and on-demand vs pinned-offline. The macOS File Provider
//! extension in `apps/web/tauri/macos/FileProviderExtension` uses the same
//! identifiers. This crate does not talk to Finder; it compiles on Linux.

use std::collections::HashMap;
use std::path::Path;
use std::time::{Duration, SystemTime};

#[cfg(test)]
mod test;

/// Finder File Provider domain id. Shared with the macOS extension Info.plist.
pub const FILE_PROVIDER_DOMAIN: &str = "dev.conation.disk";
/// Sidebar label. Not "Google Drive".
pub const FILE_PROVIDER_DISPLAY_NAME: &str = "Conation Disk";
/// Extension bundle id.
pub const FILE_PROVIDER_EXTENSION_BUNDLE_ID: &str = "dev.conation.app.FileProvider";
/// `NSExtensionPointIdentifier` for a non-UI File Provider.
pub const FILE_PROVIDER_EXTENSION_POINT: &str = "com.apple.fileprovider-nonui";
/// App group shared with the desktop / iOS app.
pub const FILE_PROVIDER_APP_GROUP: &str = "group.dev.conation.app";
/// Item id for the personal-files root.
pub const PERSONAL_ROOT_ID: &str = "conation-disk-personal";
/// Item id for the spaces root.
pub const SPACES_ROOT_ID: &str = "conation-disk-spaces";

/// Stable File Provider item identifier.
#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub struct ItemId(String);

impl ItemId {
    /// Wrap a raw identifier.
    pub fn new(raw: impl Into<String>) -> Self {
        Self(raw.into())
    }

    /// Borrow the raw identifier.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Personal-files root.
    pub fn personal_root() -> Self {
        Self::new(PERSONAL_ROOT_ID)
    }

    /// Spaces root.
    pub fn spaces_root() -> Self {
        Self::new(SPACES_ROOT_ID)
    }
}

/// Where a file lives.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Scope {
    /// User's own files.
    Personal,
    /// Files belonging to a space.
    Space { space_id: String },
}

/// Materialization for Finder "files on demand".
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PinState {
    /// Placeholder in Finder; contents fetched when opened.
    OnDemand,
    /// Keep a local copy for offline use.
    PinnedOffline,
}

/// One Disk item (file or folder).
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DiskItem {
    /// File Provider item id.
    pub id: ItemId,
    /// Parent folder. Roots use themselves.
    pub parent: ItemId,
    /// Display name.
    pub name: String,
    /// Personal vs space.
    pub scope: Scope,
    /// On-demand vs pinned offline.
    pub pin: PinState,
}

/// Addressed (not public) grant to one user.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ShareGrant {
    /// Item being shared.
    pub item_id: ItemId,
    /// Recipient user id.
    pub user_id: String,
}

/// Revocable public link with optional expiry.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PublicLink {
    /// Unguessable token (hex).
    pub token: String,
    /// Item the link opens.
    pub item_id: ItemId,
    /// When the link stops working. `None` means no expiry (still revocable).
    pub expires_at: Option<SystemTime>,
    /// Set when revoked.
    pub revoked_at: Option<SystemTime>,
}

impl PublicLink {
    /// Active if not revoked and not past expiry.
    pub fn is_active(&self, now: SystemTime) -> bool {
        if self.revoked_at.is_some() {
            return false;
        }
        match self.expires_at {
            None => true,
            Some(exp) => now < exp,
        }
    }
}

/// In-memory Conation Disk. Not a Finder mount and not Google Drive.
#[derive(Debug, Default)]
pub struct Disk {
    items: HashMap<String, DiskItem>,
    grants: Vec<ShareGrant>,
    links: HashMap<String, PublicLink>,
    next_token: u64,
}

impl Disk {
    /// Empty disk with personal + spaces roots.
    pub fn new() -> Self {
        let mut disk = Self::default();
        disk.insert_root(ItemId::personal_root(), "Личное", Scope::Personal);
        disk.insert_root(
            ItemId::spaces_root(),
            "Spaces",
            Scope::Space {
                space_id: "root".into(),
            },
        );
        disk
    }

    fn insert_root(&mut self, id: ItemId, name: &str, scope: Scope) {
        let item = DiskItem {
            id: id.clone(),
            parent: id.clone(),
            name: name.into(),
            scope,
            pin: PinState::OnDemand,
        };
        self.items.insert(id.as_str().to_owned(), item);
    }

    /// Add a child file or folder under `parent`.
    pub fn add_item(
        &mut self,
        id: ItemId,
        parent: ItemId,
        name: String,
        scope: Scope,
    ) -> Result<(), String> {
        if !self.items.contains_key(parent.as_str()) {
            return Err("parent missing".into());
        }
        if self.items.contains_key(id.as_str()) {
            return Err("duplicate id".into());
        }
        self.items.insert(
            id.as_str().to_owned(),
            DiskItem {
                id,
                parent,
                name,
                scope,
                pin: PinState::OnDemand,
            },
        );
        Ok(())
    }

    /// Get an item.
    pub fn get(&self, id: &ItemId) -> Option<&DiskItem> {
        self.items.get(id.as_str())
    }

    /// Children of `parent` (not including the parent).
    pub fn children(&self, parent: &ItemId) -> Vec<&DiskItem> {
        self.items
            .values()
            .filter(|item| item.parent == *parent && item.id != *parent)
            .collect()
    }

    /// Pin for offline, or unpin back to on-demand.
    pub fn set_pin(&mut self, id: &ItemId, pin: PinState) -> Result<(), String> {
        let item = self
            .items
            .get_mut(id.as_str())
            .ok_or_else(|| "missing item".to_string())?;
        item.pin = pin;
        Ok(())
    }

    /// True when the item is kept locally.
    pub fn is_available_offline(&self, id: &ItemId) -> bool {
        self.get(id)
            .is_some_and(|item| item.pin == PinState::PinnedOffline)
    }

    /// Address a share at one user.
    pub fn share_with(
        &mut self,
        id: &ItemId,
        user_id: impl Into<String>,
    ) -> Result<ShareGrant, String> {
        if !self.items.contains_key(id.as_str()) {
            return Err("missing item".into());
        }
        let grant = ShareGrant {
            item_id: id.clone(),
            user_id: user_id.into(),
        };
        if !self
            .grants
            .iter()
            .any(|g| g.item_id == grant.item_id && g.user_id == grant.user_id)
        {
            self.grants.push(grant.clone());
        }
        Ok(grant)
    }

    /// Revoke an addressed share.
    pub fn revoke_share(&mut self, id: &ItemId, user_id: &str) -> bool {
        let before = self.grants.len();
        self.grants
            .retain(|g| !(g.item_id == *id && g.user_id == user_id));
        before != self.grants.len()
    }

    /// Grants for an item.
    pub fn grants_for(&self, id: &ItemId) -> Vec<&ShareGrant> {
        self.grants.iter().filter(|g| g.item_id == *id).collect()
    }

    /// Create a revocable public link. `ttl` `None` means no expiry.
    pub fn create_public_link(
        &mut self,
        id: &ItemId,
        now: SystemTime,
        ttl: Option<Duration>,
    ) -> Result<PublicLink, String> {
        if !self.items.contains_key(id.as_str()) {
            return Err("missing item".into());
        }
        self.next_token += 1;
        let token = format!(
            "cdlk-{:032x}",
            self.next_token.wrapping_mul(0x9E37_79B9_7F4A_7C15)
        );
        let link = PublicLink {
            token: token.clone(),
            item_id: id.clone(),
            expires_at: ttl.map(|d| now + d),
            revoked_at: None,
        };
        self.links.insert(token, link.clone());
        Ok(link)
    }

    /// Revoke a public link by token.
    pub fn revoke_public_link(&mut self, token: &str, now: SystemTime) -> bool {
        if let Some(link) = self.links.get_mut(token) {
            if link.revoked_at.is_some() {
                return false;
            }
            link.revoked_at = Some(now);
            return true;
        }
        false
    }

    /// Look up a public link.
    pub fn public_link(&self, token: &str) -> Option<&PublicLink> {
        self.links.get(token)
    }
}

/// Directory of the macOS File Provider extension (relative to this crate).
pub fn file_provider_extension_path() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../macos/FileProviderExtension")
}
