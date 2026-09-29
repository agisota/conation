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

const LONG_TEXT = 'x'.repeat(1501);

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
  vi.stubGlobal('ClipboardEvent', Event);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function pasteEvent(text: string, html = '', lexical = ''): ClipboardEvent {
  const event = new Event('paste', { cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) =>
        type === 'text/plain'
          ? text
          : type === 'text/html'
            ? html
            : type === 'application/x-lexical-editor'
              ? lexical
              : '',
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

async function setCollapsedRange(editor: LexicalEditor) {
  await updateEditor(editor, () => {
    const paragraph = $createParagraphNode();
    $getRoot().append(paragraph);
    paragraph.select();
  });
}

function getPasteContents(editor: LexicalEditor): string[] {
  let contents: string[] = [];
  editor.getEditorState().read(() => {
    contents = $getRoot()
      .getChildren()
      .filter((node): node is PasteNode => node instanceof PasteNode)
      .map((node) => node.getContent());
  });
  return contents;
}

describe('large plain-text paste interception', () => {
  it.each(['no selection', 'node selection', 'non-collapsed range'])(
    'leaves a long paste unconsumed with %s',
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

      const event = pasteEvent(LONG_TEXT);
      expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(getPasteContents(editor)).toEqual([]);
      expect(
        editor.getEditorState().read(() => $getRoot().getTextContent())
      ).toBe('selected text');
    }
  );

  it('stores every character of a long plain-text paste at a collapsed range', async () => {
    const editor = setup();
    await setCollapsedRange(editor);
    const event = pasteEvent(LONG_TEXT);

    expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    await updateEditor(editor, () => {});
    expect(getPasteContents(editor)).toEqual([LONG_TEXT]);
  });

  it('leaves a paste exactly at the 1,500-character boundary to native handling', async () => {
    const editor = setup();
    await setCollapsedRange(editor);
    const event = pasteEvent('x'.repeat(1500));

    expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(getPasteContents(editor)).toEqual([]);
  });

  it.each([
    ['HTML', '<p>formatted</p>', ''],
    ['Lexical', '', '{"root":{"children":[]}}'],
  ])(
    'does not consume a rich %s clipboard with a long text fallback',
    async (_format, html, lexical) => {
      const editor = setup();
      await setCollapsedRange(editor);
      const event = pasteEvent(LONG_TEXT, html, lexical);

      expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(getPasteContents(editor)).toEqual([]);
    }
  );

  it('does not intercept long plain text when PasteNode is not registered', async () => {
    const editor = setup(false);
    await setCollapsedRange(editor);
    const event = pasteEvent(LONG_TEXT);

    expect(editor.dispatchCommand(PASTE_COMMAND, event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
