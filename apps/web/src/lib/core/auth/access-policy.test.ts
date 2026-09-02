import { describe, expect, it } from 'vitest';
import {
  CONATION_ACCESS_POLICY,
  hasConationFeatureAccess,
  isConationPaywallEnabled,
} from './access-policy';

describe('Conation feature access policy', () => {
  it.each([undefined, null, 'inactive', 'past_due', 'canceled', 'expired'])(
    'grants features for non-paying license state %s',
    (status) => {
      expect(hasConationFeatureAccess(status)).toBe(true);
    }
  );

  it('keeps payment UI and team limits disabled', () => {
    expect(isConationPaywallEnabled()).toBe(false);
    expect(CONATION_ACCESS_POLICY.teamMemberLimit).toBeNull();
  });
});
