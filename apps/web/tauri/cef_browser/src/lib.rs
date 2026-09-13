//! Compiled CEF host stub.
//!
//! This crate is **not** Chromium Embedded Framework. It compiles a tab and
//! history host so the Tauri navigation plugin can intercept external URLs
//! behind `--features cef` without claiming a CEF binary is linked.

use std::sync::{Mutex, OnceLock};
use url::Url;

#[cfg(test)]
mod test;

/// Process-wide stub used when `navigation_plugin` is built with `cef`.
pub fn process_host() -> &'static StubHost {
    static HOST: OnceLock<StubHost> = OnceLock::new();
    HOST.get_or_init(StubHost::new)
}

/// Whether a CEF (or other) engine is actually linked into this binary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EngineStatus {
    /// Engine name this stub stands in for.
    pub engine: &'static str,
    /// Always `false` in this crate: no Chromium is linked.
    pub linked: bool,
    /// Honest reason the engine cannot render pages.
    pub detail: &'static str,
}

/// Issue #7 capabilities that require a real CEF (or equivalent) engine.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AgentCapability {
    /// Capture DOM / React context from an in-app tab.
    DomCapture,
    /// Page annotations.
    Annotations,
    /// In-app downloads.
    Downloads,
    /// Authenticated site sessions inside the in-app browser.
    AuthSessions,
}

/// A requested capability that this stub cannot satisfy.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Unsupported {
    /// Capability that was requested.
    pub capability: AgentCapability,
    /// Engine name.
    pub engine: &'static str,
    /// Always `false` here.
    pub linked: bool,
}

/// One in-app browser tab recorded by the stub.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tab {
    /// Stable tab id (1-based, incrementing).
    pub id: u64,
    /// URL the tab was opened with.
    pub url: Url,
    /// Title placeholder; a real CEF would update this from the page.
    pub title: String,
}

/// One history entry for a tab open.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HistoryEntry {
    /// Tab that produced the entry.
    pub tab_id: u64,
    /// URL recorded.
    pub url: Url,
}

/// In-memory CEF host. Compiles and records tabs; does not render.
#[derive(Debug)]
pub struct StubHost {
    inner: Mutex<State>,
}

#[derive(Debug, Default)]
struct State {
    next_id: u64,
    tabs: Vec<Tab>,
    history: Vec<HistoryEntry>,
}

impl StubHost {
    /// Empty host with no tabs.
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(State::default()),
        }
    }

    /// Engine status: CEF is named, not linked.
    pub fn status(&self) -> EngineStatus {
        EngineStatus {
            engine: "cef",
            linked: false,
            detail: "CEF is not linked; this is the compiled stub",
        }
    }

    /// Open a tab for `url`. Invalid URLs return `None`.
    pub fn open(&self, url: &Url) -> Tab {
        let mut state = self.inner.lock().expect("cef stub mutex");
        state.next_id += 1;
        let tab = Tab {
            id: state.next_id,
            url: url.clone(),
            title: url.host_str().unwrap_or("tab").to_owned(),
        };
        state.history.push(HistoryEntry {
            tab_id: tab.id,
            url: url.clone(),
        });
        state.tabs.push(tab.clone());
        tab
    }

    /// Close `id` if it exists.
    pub fn close(&self, id: u64) -> bool {
        let mut state = self.inner.lock().expect("cef stub mutex");
        let before = state.tabs.len();
        state.tabs.retain(|tab| tab.id != id);
        before != state.tabs.len()
    }

    /// Snapshot of open tabs.
    pub fn tabs(&self) -> Vec<Tab> {
        self.inner.lock().expect("cef stub mutex").tabs.clone()
    }

    /// Snapshot of open history (not a real Chromium history store).
    pub fn history(&self) -> Vec<HistoryEntry> {
        self.inner.lock().expect("cef stub mutex").history.clone()
    }

    /// Agent capabilities require a linked engine. This stub always refuses.
    pub fn capability(&self, capability: AgentCapability) -> Result<(), Unsupported> {
        Err(Unsupported {
            capability,
            engine: "cef",
            linked: false,
        })
    }
}

impl Default for StubHost {
    fn default() -> Self {
        Self::new()
    }
}
