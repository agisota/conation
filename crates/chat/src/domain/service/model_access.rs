use crate::domain::models::model_access::{CHAT_MODELS, PAID_DEFAULT_MODEL};
use crate::domain::ports::ModelAccessService;

/// Conation model access: every authenticated user may use every model.
#[derive(Debug, Default, Clone, Copy)]
pub struct ModelAccessServiceImpl;

impl ModelAccessService for ModelAccessServiceImpl {
    fn best_model(&self, _professional: bool) -> &'static str {
        PAID_DEFAULT_MODEL
    }

    fn has_access(&self, _professional: bool, model_id: &str) -> bool {
        CHAT_MODELS.contains(&model_id)
    }
}

#[cfg(test)]
mod test;
