use super::*;
use crate::domain::models::model_access::{CHAT_MODELS, FREE_MODEL, PAID_DEFAULT_MODEL};

const DEFAULT: &str = "rox/gemini-2.5-flash";

#[test]
fn every_user_gets_the_same_default_and_all_models() {
    let svc = ModelAccessServiceImpl;
    for former_paid_state in [false, true] {
        assert_eq!(svc.best_model(former_paid_state), DEFAULT);
        for model in CHAT_MODELS {
            assert!(svc.has_access(former_paid_state, model));
        }
    }
    assert_eq!(FREE_MODEL, PAID_DEFAULT_MODEL);
    assert!(!svc.has_access(false, "unknown/not-in-catalog"));
}
