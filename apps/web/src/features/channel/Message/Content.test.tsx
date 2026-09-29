import type { MessageData } from '@core/messages/types';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import type { ParentProps } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { Content } from './Content';
import { MessageProvider } from './context';

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
vi.mock('@ui', async (original) => ({
  ...(await original<typeof import('@ui')>()),
  cn: (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' '),
}));
vi.mock('./highlightOverlay', () => ({
  createSearchHighlightOverlay: () => undefined,
}));
vi.mock('@service-connection/websocket', () => ({
  ws: { send() {}, addEventListener() {}, removeEventListener() {} },
  state: () => 'closed',
  createConnectionBlockWebsocketEffect() {},
  createConnectionWebsocketEffect() {},
  parseWebsocketPayload: () => undefined,
}));
vi.mock('@service-storage/websocket', () => ({
  storageWS: { send() {}, addEventListener() {}, removeEventListener() {} },
  createWebSocketJob: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('renders an external conversation action from persisted channel Markdown', async () => {
  const url = 'https://discord.com/channels/123/456/789?from=message';
  const message = {
    id: 'message-1',
    content: `See [discussion](${url})`,
  } as MessageData;
  render(() => (
    <MessageProvider value={() => message}>
      <Content />
    </MessageProvider>
  ));

  fireEvent.click(
    await screen.findByRole('button', { name: 'Open in Discord' })
  );
  await waitFor(() => expect(open).toHaveBeenCalledWith(url));
});
