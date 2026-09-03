use axum::http::StatusCode;
use roles_and_permissions::domain::model::SubscriptionStatus;
use stripe_webhook::EventType;

use super::{
    PaymentEventOutcome, configured_stripe_webhook_secret, is_active_subscription_except_current,
};

#[test]
fn missing_webhook_secret_returns_service_unavailable() {
    let response = configured_stripe_webhook_secret(None).unwrap_err();

    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[test]
fn invoice_payment_failed_maps_to_revoke_outcome() {
    let outcome = PaymentEventOutcome::from_event_type(&EventType::InvoicePaymentFailed)
        .expect("invoice payment failure should map to an outcome");

    assert_eq!(outcome, PaymentEventOutcome::RevokePremiumAccess);
    assert_eq!(
        outcome.personal_subscription_status(),
        SubscriptionStatus::PastDue
    );
    assert_eq!(outcome.team_subscription_status(), "past_due");
    assert!(outcome.is_revoke());
}

#[test]
fn invoice_payment_success_events_map_to_restore_outcome() {
    let success_event_types = [EventType::InvoicePaymentSucceeded, EventType::InvoicePaid];

    for event_type in success_event_types {
        let outcome = PaymentEventOutcome::from_event_type(&event_type)
            .expect("invoice payment success should map to an outcome");

        assert_eq!(outcome, PaymentEventOutcome::RestorePremiumAccess);
        assert_eq!(
            outcome.personal_subscription_status(),
            SubscriptionStatus::Active
        );
        assert_eq!(outcome.team_subscription_status(), "active");
        assert!(!outcome.is_revoke());
    }
}

#[test]
fn non_invoice_payment_events_do_not_map_to_payment_outcomes() {
    let non_payment_event_types = [
        EventType::CustomerSubscriptionCreated,
        EventType::CustomerSubscriptionUpdated,
        EventType::CustomerSubscriptionDeleted,
        EventType::CustomerSubscriptionPaused,
    ];

    for event_type in non_payment_event_types {
        assert_eq!(PaymentEventOutcome::from_event_type(&event_type), None);
    }
}

#[test]
fn invoice_payment_active_subscription_check_excludes_current_subscription() {
    let current_subscription_id = "sub_failed";

    assert!(!is_active_subscription_except_current(
        current_subscription_id,
        &stripe::SubscriptionStatus::Active,
        current_subscription_id,
    ));
    assert!(is_active_subscription_except_current(
        "sub_active",
        &stripe::SubscriptionStatus::Active,
        current_subscription_id,
    ));
    assert!(is_active_subscription_except_current(
        "sub_trialing",
        &stripe::SubscriptionStatus::Trialing,
        current_subscription_id,
    ));
    assert!(!is_active_subscription_except_current(
        "sub_past_due",
        &stripe::SubscriptionStatus::PastDue,
        current_subscription_id,
    ));
}
