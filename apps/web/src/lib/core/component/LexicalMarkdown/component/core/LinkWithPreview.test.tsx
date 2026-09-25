import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import type { ParentProps } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';

const open = vi.hoisted(() => vi.fn());
vi.mock('@core/util/url', async (original) => ({
  ...(await original<typeof import('@core/util/url')>()),
  openExternalUrl: open,
}));
vi.mock('@core/signal/unfurl', () => ({
  useUnfurl: (url: string) => [() => ({ type: 'failure', url })],
}));
vi.mock('@core/component/ScopedPortal', () => ({
  ScopedPortal: (props: ParentProps) => props.children,
}));
vi.mock('@core/mobile/isTouchDevice', () => ({ isTouchDevice: () => true }));
vi.mock('@ui', () => ({
  cn: (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' '),
}));

import { LinkWithPreview } from './LinkWithPreview';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([
  ['https://x.com/example/status/123?ref=share', 'Open in X'],
  ['https://discord.com/channels/123/456/789', 'Open in Discord'],
  ['https://www.openstreetmap.org/#map=12/1/2', 'Open in Maps'],
])(
  'shows a touch-discoverable %s action and opens the original URL',
  (url, label) => {
    render(() => <LinkWithPreview url={url}>source link</LinkWithPreview>);

    const anchor = screen.getByRole('link', { name: 'source link' });
    expect(anchor.getAttribute('href')).toBe(url);
    const action = screen.getByRole('button', { name: label });
    expect(action.textContent).toBe(label);
    fireEvent.click(action);
    expect(open).toHaveBeenCalledWith(url);
  }
);

it('keeps ordinary social URLs usable without a trusted external action', () => {
  const url = 'https://x.com/example';
  render(() => <LinkWithPreview url={url}>profile</LinkWithPreview>);

  expect(
    screen.getByRole('link', { name: 'profile' }).getAttribute('href')
  ).toBe(url);
  expect(screen.queryByRole('button', { name: /open in/i })).toBeNull();
});

it.each(['https://x.com.evil.test/user/status/123', 'javascript:alert(1)'])(
  'does not provide a trusted action for %s',
  (url) => {
    render(() => <LinkWithPreview url={url}>untrusted link</LinkWithPreview>);

    expect(screen.queryByRole('button', { name: /open in/i })).toBeNull();
  }
);

it('keeps the destination action after pointer leave and activates it by keyboard', async () => {
  const user = userEvent.setup();
  const url = 'https://x.com/example/status/123';
  render(() => <LinkWithPreview url={url}>source link</LinkWithPreview>);
  fireEvent.mouseLeave(screen.getByRole('link', { name: 'source link' }));

  await user.tab();
  expect(screen.getByRole('link', { name: 'source link' })).toBe(
    document.activeElement
  );
  await user.tab();
  const action = screen.getByRole('button', { name: 'Open in X' });
  expect(action).toBe(document.activeElement);
  await user.keyboard('{Enter}');

  expect(open).toHaveBeenCalledWith(url);
});
