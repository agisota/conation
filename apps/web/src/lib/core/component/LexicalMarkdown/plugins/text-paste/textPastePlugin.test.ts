import { createHeadlessEditor } from '@lexical/headless';
import { PasteNode } from '@macro-inc/lexical-core/nodes/PasteNode';
import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setSelection,
  type LexicalEditor,
  PASTE_COMMAND,
  ParagraphNode,
  TextNode,
} from 'lexical';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { textPastePlugin } from './textPastePlugin';

// utils.ts imports the plugin barrel, whose leaves open storage and connection
// gateway sockets on import. Keep those infrastructure transports inert here.
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

const LARGE_TEXT = 'x'.repeat(1501);

function setup(withPasteNode = true) {
  const editor = createHeadlessEditor({
    nodes: withPasteNode
      ? [ParagraphNode, TextNode, PasteNode]
      : [ParagraphNode, TextNode],
    onError: (error) => {
      throw error;
    },
  });
  textPastePlugin()(editor);
  return editor;
}

beforeAll(() => {
  // JSDOM lacks ClipboardEvent; an Event with clipboardData exercises the real
  // command path's event type guard without requiring browser-only APIs.
  vi.stubGlobal('ClipboardEvent', Event);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function pasteEvent(text: string, html = '', lexical = ''): ClipboardEvent {
  const event = new Event('paste', { cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => {
        switch (type) {
          case 'text/plain':
            return text;
          case 'text/html':
            return html;
          case 'application/x-lexical-editor':
            return lexical;
          default:
            return '';
        }
      },
    },
  });
  vi.spyOn(event, 'preventDefault');
  return event;
}

function updateEditor(editor: LexicalEditor, callback: () => void) {
  return new Promise<void>((resolve) => {
    editor.update(
      () => {
        callback();
        resolve();
      },
      { discrete: true }
    );
  });
}

async function selectCollapsedRange(editor: LexicalEditor) {
  await updateEditor(editor, () => {
    const paragraph = $createParagraphNode();
    $getRoot().append(paragraph);
    paragraph.select();
  });
}

function pasteNodes(editor: LexicalEditor) {
  let nodes: PasteNode[] = [];
  editor.getEditorState().read(() => {
    nodes = $getRoot()
      .getChildren()
      .filter((node): node is PasteNode => node instanceof PasteNode);
  });
  return nodes;
}

describe('textPastePlugin large-paste selection fencing', () => {
  it.each(['no selection', 'node selection', 'non-collapsed range'])(
    'does not consume a large paste with %s',
    async (selectionKind) => {
      const editor = setup();
      await updateEditor(editor, () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('selected text'));
        $getRoot().append(paragraph);
        if (selectionKind === 'node selection') {
          const selection = $createNodeSelection();
          selection.add(paragraph.getKey());
          $setSelection(selection);
        } else if (selectionKind === 'non-collapsed range') {
          paragraph.select(0, 1);
        } else {
          $setSelection(null);
        }
      });

      const event = pasteEvent(LARGE_TEXT);
      expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(pasteNodes(editor)).toHaveLength(0);
      expect(
        editor.getEditorState().read(() => $getRoot().getTextContent())
      ).toBe('selected text');
    }
  );

  it('handles long plain text only for a collapsed range and preserves every character', async () => {
    const editor = setup();
    await selectCollapsedRange(editor);
    const event = pasteEvent(LARGE_TEXT);

    expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    await updateEditor(editor, () => {});
    expect(pasteNodes(editor)).toHaveLength(1);
    expect(pasteNodes(editor)[0].getTextContent()).toBe(LARGE_TEXT);
  });

  it('leaves text at the 1500-character threshold to native paste handling', async () => {
    const editor = setup();
    await selectCollapsedRange(editor);
    const event = pasteEvent('x'.repeat(1500));

    expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(pasteNodes(editor)).toHaveLength(0);
  });

  it.each([
    ['HTML', '<p>rich text</p>', ''],
    ['Lexical', '', '{"root":{"children":[]}}'],
  ])(
    'does not intercept a rich %s clipboard with a long plain-text fallback',
    async (_format, html, lexical) => {
      const editor = setup();
      await selectCollapsedRange(editor);
      const event = pasteEvent(LARGE_TEXT, html, lexical);

      expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(pasteNodes(editor)).toHaveLength(0);
    }
  );

  it('does not intercept long text when PasteNode is not registered', async () => {
    const editor = setup(false);
    await selectCollapsedRange(editor);
    const event = pasteEvent(LARGE_TEXT);

    expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(pasteNodes(editor)).toHaveLength(0);
  });

  it('creates a separate node for each eligible repeated paste', async () => {
    const editor = setup();
    await selectCollapsedRange(editor);

    for (let index = 0; index < 2; index++) {
      const event = pasteEvent(LARGE_TEXT);
      expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      await updateEditor(editor, () => {});
    }

    expect(pasteNodes(editor)).toHaveLength(2);
  });
});
