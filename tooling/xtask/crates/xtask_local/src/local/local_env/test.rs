use super::*;
use crate::local::Mode;
use crate::local::instance::{Instance, Port};

/// The merged env a `--no-doppler` stack sees: boot stubs below, the
/// authoritative local env on top (mirrors `env_layer::resolve`).
fn local_env() -> BTreeMap<String, String> {
    let instance = Instance::derive(None, None).expect("default instance derives");
    let local = LocalEnv::for_instance(Mode::Local, &instance, true, None);
    let mut env = local.boot_stub_env();
    env.extend(local.to_env());
    env
}
