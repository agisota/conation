/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@core/util/platform', () => ({ isTauri: () => false }));

import {
  buildInviteLinkUrl,
  clearPendingInviteToken,
  formatTimeLeft,
  getPendingInviteToken,
  isPlausibleInviteToken,
  PENDING_INVITE_TOKEN_STORAGE_KEY,
  savePendingInviteToken,
} from './invite-link';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';

beforeEach(() => {
  localStorage.clear();
});

describe('isPlausibleInviteToken', () => {
  it('accepts generated tokens and rejects anything else', () => {
    expect(isPlausibleInviteToken(TOKEN)).toBe(true);
    expect(isPlausibleInviteToken('short')).toBe(false);
    expect(isPlausibleInviteToken('has spaces in it and is long')).toBe(false);
    expect(isPlausibleInviteToken(undefined)).toBe(false);
    expect(isPlausibleInviteToken(['a'])).toBe(false);
  });
});

describe('buildInviteLinkUrl', () => {
  it('points at the web app welcome page with the token encoded', () => {
    expect(buildInviteLinkUrl('a b', 'https://macro.com')).toBe(
      'https://macro.com/app/invite?token=a%20b'
    );
  });

  it('uses the local dev server origin when running on localhost', () => {
    // jsdom's default origin is http://localhost:3000.
    expect(buildInviteLinkUrl(TOKEN)).toBe(
      `${window.location.origin}/app/invite?token=${TOKEN}`
    );
  });
});

describe('pending token storage', () => {
  it('round-trips a token and clears it', () => {
    savePendingInviteToken(TOKEN);
    expect(localStorage.getItem(PENDING_INVITE_TOKEN_STORAGE_KEY)).toBe(TOKEN);
    expect(getPendingInviteToken()).toBe(TOKEN);

    clearPendingInviteToken();
    expect(getPendingInviteToken()).toBeUndefined();
  });

  it('ignores a corrupted stored value', () => {
    localStorage.setItem(PENDING_INVITE_TOKEN_STORAGE_KEY, 'nope');
    expect(getPendingInviteToken()).toBeUndefined();
  });
});

describe('formatTimeLeft', () => {
  const now = Date.parse('2026-09-15T12:00:00Z');

  it('distinguishes expiry and the hour-to-minute boundary', () => {
    const expired = formatTimeLeft('2026-09-15T11:59:59Z', now);
    const underHour = formatTimeLeft('2026-09-15T12:59:59Z', now);
    const oneHour = formatTimeLeft('2026-09-15T13:00:00Z', now);

    expect(expired).not.toMatch(/\d/);
    expect(underHour).toMatch(/59 мин/);
    expect(oneHour).toMatch(/1 ч/);
  });
});
