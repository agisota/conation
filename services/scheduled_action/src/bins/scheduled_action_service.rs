// The standalone/local stack needs a workspace-unique binary name, while the
// existing AWS deployment still builds the historical `service` target. Keep
// one implementation until that external deployment contract is migrated.
#![recursion_limit = "256"]

include!("service.rs");
