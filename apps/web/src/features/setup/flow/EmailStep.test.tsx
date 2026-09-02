/**
 * @vitest-environment jsdom
 */

import { setLocale } from '@app/lib/i18n';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailStep } from './EmailStep';

const mocks = vi.hoisted(() => ({
  addInbox: vi.fn(),
  invalidateEmailLinks: vi.fn(),
  track: vi.fn(),
  useEmailLinksQuery: vi.fn(),
}));

vi.mock('@app/lib/analytics/analytics-context', () => ({
  useAnalytics: () => ({ track: mocks.track }),
}));

vi.mock('@core/context/user', () => ({
  useUserId: () => () => 'conation|me@example.com',
}));

vi.mock('@core/email-link', () => ({
  useAddInboxFlow: () => mocks.addInbox,
}));

vi.mock('@queries/email/link', () => ({
  invalidateEmailLinks: mocks.invalidateEmailLinks,
  useEmailLinksQuery: mocks.useEmailLinksQuery,
}));

vi.mock('@ui', () => ({
  Button: (props: {
    children?: unknown;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  ),
  Layer: (props: { children?: unknown }) => <>{props.children}</>,
  cn: (...classes: Array<string | false | undefined>) =>
    classes.filter(Boolean).join(' '),
}));

describe('EmailStep', () => {
  beforeEach(() => {
    setLocale('en');
    mocks.addInbox.mockReset();
    mocks.addInbox.mockResolvedValue(undefined);
    mocks.invalidateEmailLinks.mockReset();
    mocks.track.mockReset();
    mocks.useEmailLinksQuery.mockReturnValue({
      data: {
        links: [
          {
            id: 'inbox-1',
            email_address: 'first@example.com',
            is_primary: true,
            macro_id: 'conation|me@example.com',
          },
          {
            id: 'inbox-2',
            email_address: 'second@example.com',
            is_primary: false,
            macro_id: 'conation|me@example.com',
          },
        ],
      },
    });
  });

  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('keeps add-another-inbox available after two links and starts the flow', async () => {
    render(() => (
      <EmailStep onContinue={() => undefined} onSkip={() => undefined} />
    ));

    const button = screen.getByRole('button', {
      name: /Connect another email/,
    });
    await fireEvent.click(button);

    expect(mocks.addInbox).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith(
      'onboarding_v4_email_connect_clicked',
      { slot: 'Connect another email' }
    );
  });
});
