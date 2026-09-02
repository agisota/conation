import { describe, expect, it } from 'vitest';
import { PaywallKey, usePaywallState } from './PaywallState';

describe('Conation paywall state', () => {
  it('does not open for legacy payment-limit errors', () => {
    const paywall = usePaywallState();
    paywall.hidePaywall();

    paywall.showPaywall(PaywallKey.TEAMS);

    expect(paywall.paywallOpen()).toBe(false);
    expect(paywall.paywallKey()).toBeNull();
  });
});
