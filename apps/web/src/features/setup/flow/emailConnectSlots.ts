/**
 * Inbox connection choices shown during onboarding.
 *
 * The first visit explains the primary and secondary mailbox paths. Once an
 * inbox exists, keep offering another connection regardless of how many are
 * already linked: Conation does not use the onboarding UI as an entitlement
 * gate.
 */
export type EmailConnectSlotKind = 'primary' | 'secondary' | 'another';

export function getEmailConnectSlotKinds(
  connectedInboxCount: number
): readonly EmailConnectSlotKind[] {
  return connectedInboxCount <= 0 ? ['primary', 'secondary'] : ['another'];
}
