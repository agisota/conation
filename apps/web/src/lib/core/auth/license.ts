import { useLicenseStatus } from '@core/context/user';
import { createMemo } from 'solid-js';
import { hasConationFeatureAccess } from './access-policy';

export { hasConationFeatureAccess } from './access-policy';

/** Feature entitlement for the Conation distribution. */
export function useHasFeatureAccess() {
  const licenseStatus = useLicenseStatus();
  return createMemo((): boolean => hasConationFeatureAccess(licenseStatus()));
}

/** Whether the account has a paid/trial subscription record.
 *
 * Use this only for billing presentation and analytics. Product gates must use
 * [`useHasFeatureAccess`] instead.
 */
export function useHasPaidAccess() {
  const licenseStatus = useLicenseStatus();
  return createMemo((): boolean => {
    const status = licenseStatus();
    return status === 'trialing' || status === 'active';
  });
}
