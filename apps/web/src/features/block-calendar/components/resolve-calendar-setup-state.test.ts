import { describe, expect, it } from 'vitest';
import { UserProvider } from '@service-email/generated/schemas/userProvider';
import {
  type CalendarSetupLink,
  resolveCalendarSetupState,
} from './resolve-calendar-setup-state';

const loaded = { rangeSupported: true, loaded: true } as const;

function gmail(overrides: Partial<CalendarSetupLink> = {}): CalendarSetupLink {
  return {
    provider: UserProvider.GMAIL,
    is_sync_active: true,
    needs_calendar_permission: false,
    needs_reauth: false,
    calendar_disabled: false,
    ...overrides,
  };
}

function stalwart(): CalendarSetupLink {
  return {
    provider: UserProvider.STALWART,
    is_sync_active: true,
    needs_calendar_permission: false,
    needs_reauth: false,
  };
}

describe('resolveCalendarSetupState', () => {
  it('stays hidden until links and the supported range are ready', () => {
    expect(
      resolveCalendarSetupState([], { rangeSupported: false, loaded: true })
    ).toBeUndefined();
    expect(
      resolveCalendarSetupState([], { rangeSupported: true, loaded: false })
    ).toBeUndefined();
  });

  it('asks to connect Google when the user has no mailbox at all', () => {
    expect(resolveCalendarSetupState([], loaded)).toBe('connect');
  });

  it('does not nag Stalwart-only users to connect Google Calendar', () => {
    expect(resolveCalendarSetupState([stalwart()], loaded)).toBeUndefined();
  });

  it('still shows Gmail reauth when a Google grant has died', () => {
    expect(
      resolveCalendarSetupState(
        [stalwart(), gmail({ needs_reauth: true, is_sync_active: false })],
        loaded
      )
    ).toBe('reauth');
  });

  it('asks for calendar permission on a live Gmail mailbox', () => {
    expect(
      resolveCalendarSetupState(
        [gmail({ needs_calendar_permission: true })],
        loaded
      )
    ).toBe('permission');
  });

  it('treats a user-disabled calendar as disabled, not a missing upgrade', () => {
    expect(
      resolveCalendarSetupState(
        [gmail({ needs_calendar_permission: true, calendar_disabled: true })],
        loaded
      )
    ).toBe('disabled');
  });

  it('hides chrome when a Gmail calendar is already available', () => {
    expect(resolveCalendarSetupState([gmail()], loaded)).toBeUndefined();
  });
});
