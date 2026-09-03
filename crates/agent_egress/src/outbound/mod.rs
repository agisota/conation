//! Adapters this crate reaches the rest of the world through.

/// Minting a scoped GitHub App installation credential.
pub mod github_tokens;

/// Answering the reserved `conation` slug with Conation's own MCP server.
pub mod conation_mcp;

/// Resolving an owner's Pipedream-connected apps to scoped upstream calls.
pub mod mcp_credentials;
/// Deployment-owned OmniRoute credential adapter.
pub mod omniroute;

/// Resolving a sandbox's session token to the session it stands for.
pub mod session_authority;

/// Executing an already-addressed, already-stamped request.
pub mod forwarder;
