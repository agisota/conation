import { UserProvider } from '@service-email/generated/schemas/userProvider';

export type CalendarSetupState = 'connect' | 'permission' | 'reauth' | 'disabled';

export type CalendarSetupLink = {
  provider: string;
  is_sync_active: boolean;
  needs_calendar_permission: boolean;
  needs_reauth: boolean;
  calendar_disabled?: boolean;
};

/**
 * Google Calendar setup chrome is Gmail-only. A Stalwart mailbox is not a
 * missing Google grant — do not overlay "Connect a Google account" on it.
 */
export function resolveCalendarSetupState(
  links: readonly CalendarSetupLink[],
  options: { rangeSupported: boolean; loaded: boolean }
): CalendarSetupState | undefined {
  if (!options.rangeSupported || !options.loaded) return undefined;

  const gmailLinks = links.filter((link) => link.provider === UserProvider.GMAIL);
  if (gmailLinks.length === 0) {
    const hasNonGmailMailbox = links.some(
      (link) => link.provider !== UserProvider.GMAIL
    );
    return hasNonGmailMailbox ? undefined : 'connect';
  }

  const hasAvailableCalendar = gmailLinks.some(
    (link) =>
      link.is_sync_active &&
      !link.needs_calendar_permission &&
      !link.needs_reauth
  );
  if (hasAvailableCalendar) return undefined;
  if (gmailLinks.some((link) => link.needs_reauth)) return 'reauth';
  if (gmailLinks.some((link) => link.needs_calendar_permission)) {
    return gmailLinks.every(
      (link) => !link.needs_calendar_permission || link.calendar_disabled
    )
      ? 'disabled'
      : 'permission';
  }

  return 'connect';
}
