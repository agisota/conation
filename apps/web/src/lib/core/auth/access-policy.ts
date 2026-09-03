/**
 * Product feature-access policy for the Conation distribution.
 *
 * Subscription status remains available to billing/settings analytics, but it
 * is not an entitlement: every authenticated user receives product features.
 */
export const CONATION_ACCESS_POLICY = Object.freeze({
  paymentRequiredForFeatures: false,
  teamMemberLimit: null,
} as const);

/** Returns whether product features are available for a license state. */
export function hasConationFeatureAccess(
  _licenseStatus: string | null | undefined
): boolean {
  return !CONATION_ACCESS_POLICY.paymentRequiredForFeatures;
}

/** Returns whether upgrade/paywall UI should be presented. */
export function isConationPaywallEnabled(): boolean {
  return CONATION_ACCESS_POLICY.paymentRequiredForFeatures;
}
