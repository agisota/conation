use std::time::Duration;

/// The default timeout threshold is 1 minute
pub const DEFAULT_TIMEOUT_THRESHOLD: u64 = 60_000;

/// Emit diagnostics while a websocket queue or write remains blocked this long.
pub(crate) const SLOW_WEBSOCKET_OPERATION_THRESHOLD: Duration = Duration::from_secs(1);
