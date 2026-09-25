/**
 * @vitest-environment jsdom
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// StaticMarkdown pulls in utils.ts and its plugin barrel; keep the real-time
// transports inert while exercising the production preview and viewer UI.
vi.mock('@service-storage/websocket', () => ({
  storageWS: { reconnectIfDisconnected: vi.fn() },
  createWebSocketJob: vi.fn(),
}));
vi.mock('@service-connection/websocket', () => ({
  ws: { addEventListener: vi.fn(), send: vi.fn() },
  state: () => 'closed',
  createConnectionBlockWebsocketEffect: vi.fn(),
  createConnectionWebsocketEffect: vi.fn(),
}));

const pasteNodeMocks = vi.hoisted(() => ({
  convertToText: vi.fn(),
  copyText: vi.fn(),
  deleteNode: vi.fn(),
  editable: true,
  selectNode: vi.fn(),
}));

vi.mock('./paste/usePasteNode', () => ({
  usePasteNode: () => ({
    origin: () => 'pasted',
    isEditable: () => pasteNodeMocks.editable,
    isSelectedAsNode: () => false,
    convertToText: pasteNodeMocks.convertToText,
    copyText: pasteNodeMocks.copyText,
    deleteNode: pasteNodeMocks.deleteNode,
    selectNode: pasteNodeMocks.selectNode,
  }),
}));

vi.mock('./paste/PasteActionsMenu', () => ({
  PasteActionsMenu: (props: { onConvertToText: () => void }) => (
    <button
      type="button"
      aria-label="Convert to text"
      onClick={props.onConvertToText}
    >
      Convert to text
    </button>
  ),
}));

import { PasteNode } from './PasteNode';

let motionStyles: HTMLStyleElement;

beforeEach(() => {
  window.innerWidth = 1024;
  window.dispatchEvent(new Event('resize'));
  motionStyles = document.createElement('style');
  motionStyles.textContent =
    '* { transition-duration: 0s; animation-name: none; } [data-corvu-drawer-content], [data-corvu-drawer-overlay] { transition-duration: 0s; animation-name: none; }';
  document.head.append(motionStyles);
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  motionStyles.remove();
  window.innerWidth = 1024;
  window.dispatchEvent(new Event('resize'));
  pasteNodeMocks.editable = true;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function renderPreview(origin: 'pasted' | 'referenced' = 'pasted') {
  return render(() => (
    <PasteNode content="full passage" origin={origin} key="test" theme={{}} />
  ));
}

function setViewportWidth(width: number) {
  window.innerWidth = width;
  window.dispatchEvent(new Event('resize'));
}

describe('PasteNode preview interaction', () => {
  it.each(['Enter', ' '])(
    'opens the production viewer with %s and cancels the key default',
    async (key) => {
      renderPreview();
      const control = screen.getByRole('button', { name: 'Open pasted text' });
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      });

      control.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(control.tabIndex).toBe(0);
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('full passage')).toBeTruthy();
      expect(pasteNodeMocks.selectNode).toHaveBeenCalledOnce();
    }
  );

  it('opens on pointer activation and isolates the separate action menu', async () => {
    renderPreview();
    const control = screen.getByRole('button', { name: 'Open pasted text' });
    const menu = screen.getByRole('button', { name: 'Convert to text' });

    menu.click();
    expect(pasteNodeMocks.convertToText).toHaveBeenCalledOnce();
    expect(pasteNodeMocks.selectNode).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    control.click();
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(pasteNodeMocks.selectNode).toHaveBeenCalledOnce();
  });

  it('dismisses the desktop dialog with Escape and an outside click', async () => {
    renderPreview();
    screen.getByRole('button', { name: 'Open pasted text' }).click();
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    screen.getByRole('button', { name: 'Open pasted text' }).click();
    await screen.findByRole('dialog');
    // Kobalte attaches its document-level outside-pointer listener on a
    // zero-delay timer after the dialog mounts.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const overlay = document.querySelector('.scrim-glass');
    expect(overlay).toBeTruthy();
    fireEvent.pointerDown(overlay!, { button: 0 });
    fireEvent.pointerUp(overlay!, { button: 0 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('uses the production mobile drawer and dismisses it by Escape or outside tap', async () => {
    setViewportWidth(390);
    renderPreview();
    screen.getByRole('button', { name: 'Open pasted text' }).click();
    const dialog = await screen.findByRole('dialog', { name: 'Pasted text' });
    expect(dialog.hasAttribute('data-corvu-drawer-content')).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    screen.getByRole('button', { name: 'Open pasted text' }).click();
    await screen.findByRole('dialog', { name: 'Pasted text' });
    const overlay = document.querySelector('[data-corvu-drawer-overlay]');
    expect(overlay).toBeTruthy();
    fireEvent.pointerDown(overlay!, { button: 0 });
    fireEvent.pointerUp(overlay!, { button: 0 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps a static pasted preview keyboard-accessible without edit actions', async () => {
    pasteNodeMocks.editable = false;
    renderPreview();
    const control = screen.getByRole('button', { name: 'Open pasted text' });
    expect(
      screen.queryByRole('button', { name: 'Convert to text' })
    ).toBeNull();
    control.focus();
    fireEvent.keyDown(control, { key: 'Enter' });
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('preserves referenced-origin rendering and opens its full text viewer', async () => {
    renderPreview('referenced');
    const reference = screen.getByRole('button', {
      name: 'Replying to: full passage',
    });
    expect(reference.hasAttribute('data-referenced-text')).toBe(true);
    reference.click();
    expect(await screen.findByText('Referenced text')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(pasteNodeMocks.selectNode).toHaveBeenCalledOnce();
  });
});
