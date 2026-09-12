//! The seam between the ACP surface and the agentic loop that serves it.

use agent::types::ChatMessage;
use agent::{AgentError, StreamPart};
use conation_user_id::user_id::MacroUserIdStr;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

/// The agent's display name and `@` handle, for the turn's system prompt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentIdentity {
    /// Display name, e.g. `Grunk`.
    pub name: String,
    /// Stable `@` handle without a leading `@`, e.g. `grunk`.
    pub handle: String,
}


/// Everything one conversational turn needs.
pub struct TurnRequest {
    /// The user the turn acts on behalf of. Tools run with their identity and
    /// token usage is recorded against them.
    pub owner: MacroUserIdStr<'static>,
    /// Model id the turn runs on. Unknown ids fall back to the loop's
    /// default model rather than failing the turn.
    pub model: String,
    /// Who this agent is. Folded into every turn's system prompt so the
    /// model can answer "who are you" even when the session has no
    /// instructions. `None` leaves the standing prompt unnamed.
    pub identity: Option<AgentIdentity>,
    /// The session's instructions, appended to the engine's own system
    /// prompt. `None` runs the engine's default prompt unchanged.
    pub instructions: Option<String>,
    /// The full conversation, oldest first, ending with the prompt being
    /// answered.
    pub messages: Vec<ChatMessage>,
    /// Cancelling this token stops the turn; the stream ends after the
    /// engine has drained cooperatively.
    pub cancel: CancellationToken,
}

/// Runs one conversational turn and streams its parts back.
///
/// The trait is the testing seam: the ACP surface is exercised against a
/// scripted engine, and production plugs in
/// [`crate::outbound::rig_engine::RigTurnEngine`].
pub trait TurnEngine: Send + Sync + 'static {
    /// Start the turn. Parts arrive on the returned receiver; the stream
    /// ending is the turn ending, and an `Err` item is a turn-fatal failure.
    fn run_turn(&self, request: TurnRequest) -> mpsc::Receiver<Result<StreamPart, AgentError>>;
}
