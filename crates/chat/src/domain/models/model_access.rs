//! Model availability for chat.
//!
//! Conation self-host has one catalog for every authenticated user. The
//! legacy free/paid constant names remain API-compatible aliases only.

/// The chat models offered to users, best-first.
pub const CHAT_MODELS: &[&str] = &[
    "rox/gemini-2.5-flash",
    "rox/nemotron-3-ultra",
    "rox/gpt-5.6-luna",
    "rox/gpt-5.6-terra",
    "anthropic/claude-sonnet-5",
    "anthropic/claude-opus-5",
    "anthropic/claude-haiku-4-5",
    "openai/gpt-5.6",
    "openai/gpt-5.6-mini",
];

/// Compatibility alias for the universal Conation default.
pub const PAID_DEFAULT_MODEL: &str = "rox/gemini-2.5-flash";

/// Compatibility alias for the same universal Conation default.
pub const FREE_MODEL: &str = PAID_DEFAULT_MODEL;
