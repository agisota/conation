//! Product-wide feature access policy.
//!
//! Billing records remain part of the compatibility surface, but Conation's
//! product features are not conditional on a subscription. Keeping that
//! decision here prevents individual services from accidentally reintroducing
//! a payment gate while preserving Stripe data and webhook processing.

#[cfg(test)]
mod test;

/// Access policy used by Conation services.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ConationAccessPolicy {
    payment_required_for_features: bool,
    team_member_limit: Option<i32>,
    sync_subscription_seats: bool,
}

impl ConationAccessPolicy {
    /// Whether a user may use professional product features.
    ///
    /// `has_paid_entitlement` is accepted so callers can keep reading legacy
    /// subscription data. In the Conation policy it never restricts access.
    pub const fn grants_professional_features(self, has_paid_entitlement: bool) -> bool {
        !self.payment_required_for_features || has_paid_entitlement
    }

    /// Whether product access should execute Stripe payment checks.
    pub const fn requires_payment_for_features(self) -> bool {
        self.payment_required_for_features
    }

    /// Maximum number of team members, or `None` when membership is unlimited.
    pub const fn team_member_limit(self) -> Option<i32> {
        self.team_member_limit
    }

    /// Whether membership changes should mutate Stripe subscription seat counts.
    pub const fn sync_subscription_seats(self) -> bool {
        self.sync_subscription_seats
    }
}

/// Conation is free by default: subscriptions are retained as metadata and
/// compatibility state, not as feature-access credentials.
pub const CONATION_ACCESS_POLICY: ConationAccessPolicy = ConationAccessPolicy {
    payment_required_for_features: false,
    team_member_limit: None,
    sync_subscription_seats: false,
};
