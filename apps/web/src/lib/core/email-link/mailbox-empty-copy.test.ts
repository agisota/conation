import { describe, expect, it } from 'vitest';
import { UserProvider } from '@service-email/generated/schemas/userProvider';
import { hasStalwartMailbox } from './mailbox-empty-copy';

describe('hasStalwartMailbox', () => {
  it('is false when there are no links', () => {
    expect(hasStalwartMailbox(undefined)).toBe(false);
    expect(hasStalwartMailbox([])).toBe(false);
  });

  it('is true when any link is STALWART', () => {
    expect(
      hasStalwartMailbox([
        { provider: UserProvider.GMAIL },
        { provider: UserProvider.STALWART },
      ])
    ).toBe(true);
  });

  it('is false for Gmail-only links', () => {
    expect(hasStalwartMailbox([{ provider: UserProvider.GMAIL }])).toBe(false);
  });
});
