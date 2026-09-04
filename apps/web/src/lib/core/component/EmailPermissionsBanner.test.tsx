/**
 * @vitest-environment jsdom
 */

import { setLocale } from '@app/lib/i18n';
import { UserProvider } from '@service-email/generated/schemas/userProvider';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailPermissionsBanner } from './EmailPermissionsBanner';

const mocks = vi.hoisted(() => ({
  addInbox: vi.fn(),
  useEmailLinksQuery: vi.fn(),
}));

vi.mock('@core/email-link', () => ({
  useAddInboxFlow: () => mocks.addInbox,
}));

vi.mock('@queries/email/link', () => ({
  useEmailLinksQuery: mocks.useEmailLinksQuery,
}));

vi.mock('@ui', () => ({
  Button: (props: {
    children?: unknown;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={props.onClick}>
      {props.children}
    </button>
  ),
}));

describe('EmailPermissionsBanner', () => {
  beforeEach(() => {
    setLocale('en');
    mocks.addInbox.mockReset();
    mocks.useEmailLinksQuery.mockReset();
  });

  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('prompts Connect Gmail when no mailbox is linked', () => {
    mocks.useEmailLinksQuery.mockReturnValue({ data: { links: [] } });

    render(() => <EmailPermissionsBanner />);

    expect(screen.getByText('No email account connected')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Connect Gmail' })
    ).toBeTruthy();
  });

  it('does not demand Connect Gmail when a Stalwart mailbox is linked', () => {
    mocks.useEmailLinksQuery.mockReturnValue({
      data: {
        links: [
          {
            id: 'stalwart-1',
            email_address: 'you@conation.dev',
            provider: UserProvider.STALWART,
          },
        ],
      },
    });

    render(() => <EmailPermissionsBanner />);

    expect(screen.queryByText('No email account connected')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Connect Gmail' })
    ).toBeNull();
  });
});
