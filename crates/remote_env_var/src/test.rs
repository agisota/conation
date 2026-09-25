use super::*;

macro_env_var::env_var! {
    #[derive(Debug)]
    struct TestSecretName;
}

#[test]
fn local_or_remote_secret_deserializes_macro_env_var_as_local() {
    let secret = serde_json::from_str::<LocalOrRemoteSecret<TestSecretName>>(r#""secret-name""#)
        .expect("secret should deserialize");

    match secret {
        LocalOrRemoteSecret::Local(value) => assert_eq!(value.as_ref(), "secret-name"),
        LocalOrRemoteSecret::Remote(_) => panic!("deserialized value should be local"),
    }
}

#[test]
fn optional_local_or_remote_secret_deserializes_some_macro_env_var_as_local() {
    let secret =
        serde_json::from_str::<OptionalLocalOrRemoteSecret<TestSecretName>>(r#""secret-name""#)
            .expect("secret should deserialize");

    let Some(LocalOrRemoteSecret::Local(value)) = secret.0 else {
        panic!("deserialized value should be some local secret");
    };

    assert_eq!(value.as_ref(), "secret-name");
}

#[test]
fn optional_local_or_remote_secret_deserializes_null_as_none() {
    let secret = serde_json::from_str::<OptionalLocalOrRemoteSecret<TestSecretName>>("null")
        .expect("secret should deserialize");

    assert!(secret.0.is_none());
}

use std::sync::atomic::{AtomicUsize, Ordering};

static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

struct BackendEnvGuard {
    saved: Vec<(&'static str, Option<std::ffi::OsString>)>,
}

impl BackendEnvGuard {
    fn new() -> Self {
        let saved = ["SECRETS_BACKEND", "APP_SECRETS_JSON"]
            .into_iter()
            .map(|key| {
                let previous = std::env::var_os(key);
                unsafe { std::env::remove_var(key) };
                (key, previous)
            })
            .collect();
        Self { saved }
    }

    fn set_backend(&self, value: &str) {
        unsafe { std::env::set_var("SECRETS_BACKEND", value) };
    }
}

impl Drop for BackendEnvGuard {
    fn drop(&mut self) {
        for (key, previous) in self.saved.drain(..) {
            match previous {
                Some(value) => unsafe { std::env::set_var(key, value) },
                None => unsafe { std::env::remove_var(key) },
            }
        }
    }
}

struct RecordingSecretManager {
    calls: AtomicUsize,
}

impl SecretManager for RecordingSecretManager {
    type Err = NotImplemented;

    async fn get_secret_value<T: AsRef<str> + Send>(
        &self,
        secret_name: T,
    ) -> Result<Arc<str>, Self::Err> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Ok(Arc::from(format!("aws:{}", secret_name.as_ref())))
    }
}

#[tokio::test]
async fn configured_backend_not_environment_selects_literal_or_aws_lookup() {
    let _lock = ENV_LOCK.lock().expect("env lock poisoned");
    let env = BackendEnvGuard::new();
    let manager = RecordingSecretManager {
        calls: AtomicUsize::new(0),
    };

    env.set_backend("env");
    for environment in [
        Environment::Local,
        Environment::Develop,
        Environment::Production,
    ] {
        let secret = manager
            .get_maybe_secret_value(environment, "literal")
            .await
            .expect("env literal should resolve");
        assert!(matches!(secret, LocalOrRemoteSecret::Local("literal")));
    }
    assert_eq!(manager.calls.load(Ordering::SeqCst), 0);

    env.set_backend("aws");
    for environment in [Environment::Local, Environment::Production] {
        let secret = manager
            .get_maybe_secret_value(environment, "separate-secret-name")
            .await
            .expect("AWS name should resolve");
        assert!(matches!(&secret, LocalOrRemoteSecret::Remote(_)));
        assert_eq!(secret.as_ref(), "aws:separate-secret-name");
    }
    assert_eq!(manager.calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn missing_blank_and_unknown_backend_fail_without_aws_lookup() {
    let _lock = ENV_LOCK.lock().expect("env lock poisoned");
    let env = BackendEnvGuard::new();
    let manager = Arc::new(RecordingSecretManager {
        calls: AtomicUsize::new(0),
    });

    for value in [None, Some(""), Some("unknown")] {
        if let Some(value) = value {
            env.set_backend(value);
        }
        for environment in [
            Environment::Local,
            Environment::Develop,
            Environment::Production,
        ] {
            let manager = Arc::clone(&manager);
            let result = tokio::spawn(async move {
                manager.get_maybe_secret_value(environment, "literal").await
            }).await;
            assert!(result.is_err_and(|error| error.is_panic()));
        }
    }
    assert_eq!(manager.calls.load(Ordering::SeqCst), 0);
}
