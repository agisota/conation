/// Decides which chat models an authenticated user may use.
///
/// Pure domain logic with no I/O, so it can be called directly (e.g. from DCS
/// to validate a requested model).
pub trait ModelAccessService: Send + Sync + 'static {
    /// The default model. The legacy plan-state argument is compatibility-only.
    fn best_model(&self, legacy_plan_state: bool) -> &'static str;

    /// Whether the caller may use `model_id`. The legacy plan-state argument
    /// is compatibility-only in Conation's universal model catalog.
    fn has_access(&self, legacy_plan_state: bool, model_id: &str) -> bool;
}
