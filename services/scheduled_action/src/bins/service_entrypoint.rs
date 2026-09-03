// Historical AWS deployment entrypoint. The implementation is shared with the
// workspace-unique standalone/local target.
#![recursion_limit = "256"]

include!("service.rs");
