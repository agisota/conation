/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '@app/lib/i18n';
import { UserTooltip } from './UserTooltip';

const mocks = vi.hoisted(() => ({
  crmFlagEnabled: true,
  teamCrmEnabled: true as boolean | null,
  contact: { id: 'contact-1' } as { id: string } | null | undefined,
  openWithSplit: vi.fn(),
  onClose: vi.fn(),
  mutateAsync: vi.fn(),
  joinChannelCall: vi.fn(),
}));

vi.mock('@app/lib/analytics/posthog', () => ({
  useFeatureFlag: () => () => ({
    enabled: mocks.crmFlagEnabled,
    payload: undefined,
  }),
}));

vi.mock('@components/app/split-layout/layout', () => ({
  useSplitLayout: () => ({
    openWithSplit: mocks.openWithSplit,
    popoverSplit: vi.fn(),
  }),
}));

vi.mock('@core/component/Toast/Toast', () => ({
  toast: { failure: vi.fn(), success: vi.fn() },
}));

vi.mock('@core/context/user', () => ({
  useUserId: () => () => 'conation|current@example.com',
}));

vi.mock('@core/user', () => ({
  useIsConnectedSecondaryInbox: () => () => false,
}));

vi.mock('@queries/channel/get-or-create-dm', () => ({
  useGetOrCreateDirectMessageMutation: () => ({
    mutateAsync: mocks.mutateAsync,
  }),
}));

vi.mock('@channel/Call/join-channel-call', () => ({
  joinChannelCall: (...args: unknown[]) => mocks.joinChannelCall(...args),
  canStartUserCall: () => true,
}));

vi.mock('@queries/crm/contacts', () => ({
  useCrmContactByEmailQuery: () => ({
    get data() {
      return mocks.contact;
    },
  }),
}));

vi.mock('@queries/team/teams', () => ({
  useCurrentTeamQuery: () => ({
    get data() {
      if (mocks.teamCrmEnabled === null) return null;
      return { team: { crm_enabled: mocks.teamCrmEnabled } };
    },
  }),
}));

vi.mock('@ui', () => ({
  cn: (...classes: Array<string | undefined>) =>
    classes.filter(Boolean).join(' '),
  Surface: (props: { children: JSX.Element; class?: string }) => (
    <div class={props.class}>{props.children}</div>
  ),
}));

vi.mock('./UserIcon', () => ({
  UserIcon: () => <div data-testid="user-icon" />,
}));

beforeEach(() => {
  setLocale('en');
  mocks.crmFlagEnabled = true;
  mocks.teamCrmEnabled = true;
  mocks.mutateAsync.mockReset();
  mocks.joinChannelCall.mockReset();
  mocks.mutateAsync.mockResolvedValue({ channel_id: 'dm-1' });
  mocks.joinChannelCall.mockResolvedValue(undefined);
  mocks.contact = { id: 'contact-1' };
  mocks.openWithSplit.mockReset();
  mocks.onClose.mockReset();
});

describe('UserTooltip direct message action', () => {
  it('offers a DM for another person', () => {
    render(() => (
      <UserTooltip
        displayName="Jane Doe"
        email="jane.doe@example.com"
        id="macro|jane.doe@example.com"
      />
    ));

    expect(screen.getByRole('button', { name: 'DM' })).toBeTruthy();
  });

  it('offers no DM for an agent, which is mentioned rather than messaged', () => {
    render(() => (
      <UserTooltip
        displayName="Cursor"
        email="Cursor"
        id="bot|00000000-0000-0000-0000-00000000c5c5"
      />
    ));

    expect(screen.queryByRole('button', { name: 'DM' })).toBeNull();
    // The rest of the card is untouched: an agent still hovers like a person.
    expect(screen.getByText('Cursor')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Assign task' })).toBeTruthy();
  });
});

describe('UserTooltip CRM contact action', () => {
  it('opens the CRM contact resolved for the hovered email', async () => {
    const user = userEvent.setup({ skipHover: true });
    render(() => (
      <UserTooltip
        displayName="Jane Doe"
        email="jane.doe@example.com"
        id="conation|jane.doe@example.com"
        onClose={mocks.onClose}
      />
    ));

    await user.click(
      await screen.findByRole('button', { name: 'Open contact' })
    );

    expect(mocks.openWithSplit).toHaveBeenCalledWith(
      { type: 'contact', id: 'contact-1' },
      { preferNewSplit: false, reopen: 'latest' }
    );
    expect(mocks.onClose).toHaveBeenCalledOnce();
  });

  it('hides the contact action when the CRM feature flag is off', () => {
    mocks.crmFlagEnabled = false;

    render(() => (
      <UserTooltip displayName="Jane Doe" email="jane.doe@example.com" />
    ));

    expect(screen.queryByRole('button', { name: 'Open contact' })).toBeNull();
  });

  it('hides the contact action when CRM is disabled for the team', () => {
    mocks.teamCrmEnabled = false;

    render(() => (
      <UserTooltip displayName="Jane Doe" email="jane.doe@example.com" />
    ));

    expect(screen.queryByRole('button', { name: 'Open contact' })).toBeNull();
  });

  it('hides the contact action when the user has no team', () => {
    mocks.teamCrmEnabled = null;

    render(() => (
      <UserTooltip displayName="Jane Doe" email="jane.doe@example.com" />
    ));

    expect(screen.queryByRole('button', { name: 'Open contact' })).toBeNull();
  });

  it('hides the contact action when no CRM contact exists', () => {
    mocks.contact = null;

    render(() => (
      <UserTooltip displayName="Jane Doe" email="jane.doe@example.com" />
    ));

    expect(screen.queryByRole('button', { name: 'Open contact' })).toBeNull();
  });

  it('keeps the rest of the tooltip visible while the contact is loading', () => {
    mocks.contact = undefined;

    render(() => (
      <UserTooltip
        displayName="Jane Doe"
        email="jane.doe@example.com"
        id="conation|jane.doe@example.com"
      />
    ));

    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy email' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open contact' })).toBeNull();
  });
});

describe('UserTooltip call action', () => {
  it('opens a DM room then joins the LiveKit call', async () => {
    const user = userEvent.setup({ skipHover: true });
    render(() => (
      <UserTooltip
        displayName="Jane Doe"
        email="jane.doe@example.com"
        id="conation|jane.doe@example.com"
        onClose={mocks.onClose}
      />
    ));

    await user.click(await screen.findByRole('button', { name: 'Call' }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      recipient_id: 'conation|jane.doe@example.com',
    });
    expect(mocks.joinChannelCall).toHaveBeenCalledWith('dm-1');
    expect(mocks.onClose).toHaveBeenCalledOnce();
  });

  it('shows Message and Call on the current user tooltip', () => {
    render(() => (
      <UserTooltip
        displayName="Me"
        email="current@example.com"
        id="conation|current@example.com"
      />
    ));

    expect(screen.getByRole('button', { name: 'Message' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Call' })).toBeTruthy();
  });
});
