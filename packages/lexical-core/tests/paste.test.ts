import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from '@lexical/markdown';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  createEditor,
} from 'lexical';
import { describe, expect, it } from 'vitest';
import { SupportedNodeTypes } from '../node-list';
import {
  $convertPasteToText,
  $createPasteNode,
  $insertReferencedPaste,
  $isPasteNode,
} from '../nodes/PasteNode';
import { $isUnknownMentionNode } from '../nodes/UnknownMentionNode';
import { EXTERNAL_TRANSFORMERS, INTERNAL_TRANSFORMERS } from '../transformers';

function makeEditor() {
  return createEditor({
    nodes: SupportedNodeTypes,
    onError: console.error,
  });
}

describe('PasteNode - internal transformer round-trip', () => {
  it('serializes and deserializes pasted content', async () => {
    const editor = makeEditor();
    const content = 'line one\nline two\n  indented three';

    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          root.append($createPasteNode({ content }));
        },
        { onUpdate: () => resolve() }
      );
    });

    let markdown = '';
    editor.getEditorState().read(() => {
      markdown = $convertToMarkdownString(INTERNAL_TRANSFORMERS);
    });

    expect(markdown).toContain('<m-paste>');
    expect(markdown).toContain('</m-paste>');

    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          $convertFromMarkdownString(markdown, INTERNAL_TRANSFORMERS);
        },
        { onUpdate: () => resolve() }
      );
    });

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const node = root.getChildren().find($isPasteNode);
      expect(node).toBeDefined();
      expect(node?.getContent()).toBe(content);
      expect(node?.getOrigin()).toBe('pasted');
    });
  });

  it('round-trips a referenced origin', async () => {
    const editor = makeEditor();
    const content = 'quoted from the agent';

    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          root.append($createPasteNode({ content, origin: 'referenced' }));
        },
        { onUpdate: () => resolve() }
      );
    });

    let markdown = '';
    editor.getEditorState().read(() => {
      markdown = $convertToMarkdownString(INTERNAL_TRANSFORMERS);
    });

    expect(markdown).toContain('"origin":"referenced"');

    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          $convertFromMarkdownString(markdown, INTERNAL_TRANSFORMERS);
        },
        { onUpdate: () => resolve() }
      );
    });

    editor.getEditorState().read(() => {
      const node = $getRoot().getChildren().find($isPasteNode);
      expect(node?.getContent()).toBe(content);
      expect(node?.getOrigin()).toBe('referenced');
    });
  });

  it('defaults missing origin to pasted', async () => {
    const editor = makeEditor();
    const payload = JSON.stringify({ content: 'legacy paste' })
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e');

    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          $convertFromMarkdownString(
            `<m-paste>${payload}</m-paste>`,
            INTERNAL_TRANSFORMERS
          );
        },
        { onUpdate: () => resolve() }
      );
    });

    editor.getEditorState().read(() => {
      const node = $getRoot().getChildren().find($isPasteNode);
      expect(node?.getContent()).toBe('legacy paste');
      expect(node?.getOrigin()).toBe('pasted');
    });
  });

  it.each(['{"content":123}', '{"content":null}', 'null', '{}'])(
    'falls back safely for malformed payload %s',
    async (payload) => {
      const editor = makeEditor();
      await new Promise<void>((resolve) => {
        editor.update(
          () => {
            $getRoot().clear();
            $convertFromMarkdownString(
              `<m-paste>${payload}</m-paste>`,
              INTERNAL_TRANSFORMERS
            );
          },
          { onUpdate: () => resolve() }
        );
      });

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildren().some($isPasteNode)).toBe(false);
        const fallback = root
          .getChildren()
          .flatMap((child) =>
            $isParagraphNode(child) ? child.getChildren() : [child]
          )
          .find($isUnknownMentionNode);
        expect(fallback?.getName()).toBe('Unknown Paste');
        expect(() => root.getTextContent()).not.toThrow();
      });
    }
  );

  it('rejects non-string content at the node factory', () => {
    expect(() =>
      $createPasteNode({ content: 123 as unknown as string })
    ).toThrow(TypeError);
  });

  it.each([
    ['null content', { content: null, origin: 'referenced' }],
    ['missing content', { origin: 'referenced' }],
    ['numeric content', { content: 123, origin: 'referenced' }],
    [
      'numeric content with unknown origin',
      { content: 123, origin: 'future-origin' },
    ],
  ])('loads sibling content around a paste with %s', (_label, pasteData) => {
    const editor = makeEditor();
    const serializeParagraph = (text: string) => ({
      type: 'paragraph',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        {
          type: 'text',
          version: 1,
          text,
          format: 0,
          detail: 0,
          mode: 'normal',
          style: '',
        },
      ],
    });
    const state = editor.parseEditorState(
      JSON.stringify({
        root: {
          type: 'root',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          children: [
            serializeParagraph('before'),
            { type: 'paste', version: 1, ...pasteData },
            serializeParagraph('after'),
          ],
        },
      })
    );

    state.read(() => {
      const children = $getRoot().getChildren();
      expect(children).toHaveLength(3);
      expect($isParagraphNode(children[0])).toBe(true);
      expect($isParagraphNode(children[1])).toBe(true);
      expect($isParagraphNode(children[2])).toBe(true);
      if (
        !$isParagraphNode(children[0]) ||
        !$isParagraphNode(children[1]) ||
        !$isParagraphNode(children[2])
      ) {
        throw new Error('Expected paragraphs around malformed paste data');
      }

      expect(children[0].getTextContent()).toBe('before');
      const fallback = children[1].getChildren().find($isUnknownMentionNode);
      expect(fallback?.getName()).toBe('Unknown Paste');
      expect(children[1].getTextContent()).not.toContain('123');
      expect(children[2].getTextContent()).toBe('after');
      expect($getRoot().getChildren().some($isPasteNode)).toBe(false);
    });
  });

  it('defaults unknown serialized origins to the legacy pasted origin', () => {
    const editor = makeEditor();
    const state = editor.parseEditorState(
      JSON.stringify({
        root: {
          type: 'root',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          children: [
            {
              type: 'paste',
              version: 1,
              content: 'valid saved content',
              origin: 'future-origin',
            },
          ],
        },
      })
    );

    state.read(() => {
      const paste = $getRoot().getFirstChild();
      expect($isPasteNode(paste)).toBe(true);
      if ($isPasteNode(paste)) {
        expect(paste.getContent()).toBe('valid saved content');
        expect(paste.getOrigin()).toBe('pasted');
      }
    });
  });

  it('keeps XML-like content intact through a round-trip', async () => {
    const editor = makeEditor();
    const content = 'before <m-document-card>injected</m-document-card> after';

    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          root.append($createPasteNode({ content }));
        },
        { onUpdate: () => resolve() }
      );
    });

    let markdown = '';
    editor.getEditorState().read(() => {
      markdown = $convertToMarkdownString(INTERNAL_TRANSFORMERS);
    });

    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          $convertFromMarkdownString(markdown, INTERNAL_TRANSFORMERS);
        },
        { onUpdate: () => resolve() }
      );
    });

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const node = root.getChildren().find($isPasteNode);
      expect(node?.getContent()).toBe(content);
    });
  });
});

describe('PasteNode - external transformer', () => {
  it('exports raw text to external markdown', async () => {
    const editor = makeEditor();
    const content = 'plain pasted text';

    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          root.append($createPasteNode({ content }));
        },
        { onUpdate: () => resolve() }
      );
    });

    let markdown = '';
    editor.getEditorState().read(() => {
      markdown = $convertToMarkdownString(EXTERNAL_TRANSFORMERS);
    });

    expect(markdown).toContain(content);
    expect(markdown).not.toContain('<m-paste>');
  });
});

describe('PasteNode - convert to text', () => {
  async function convertPaste(content: string) {
    const editor = makeEditor();

    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          root.append($createPasteNode({ content }));
        },
        { onUpdate: () => resolve() }
      );
    });

    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          const node = root.getChildren().find($isPasteNode);
          if (node) $convertPasteToText(node);
        },
        { onUpdate: () => resolve() }
      );
    });

    return editor;
  }

  it('converts a paste node into in-document text', async () => {
    const editor = await convertPaste('first line\nsecond line');

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildren().some($isPasteNode)).toBe(false);
      expect(root.getTextContent()).toContain('first line');
      expect(root.getTextContent()).toContain('second line');
    });
  });

  it('parses the content as markdown, just like a normal paste', async () => {
    const content = '# Heading\n\n- one\n- two';
    const editor = await convertPaste(content);

    let markdown = '';
    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildren().some($isPasteNode)).toBe(false);
      // The heading marker and list markers should be parsed into structural
      // nodes rather than left as literal text.
      const types = root.getChildren().map((node) => node.getType());
      expect(types).toContain('heading');
      markdown = $convertToMarkdownString(INTERNAL_TRANSFORMERS);
    });

    // Round-tripping the resulting nodes back to markdown reproduces the
    // original markdown, confirming it was parsed (not inserted as raw text).
    expect(markdown).not.toContain('<m-paste>');
    expect(markdown).toContain('# Heading');
    expect(markdown).toContain('- one');
    expect(markdown).toContain('- two');
  });
});

describe('PasteNode - insert referenced', () => {
  it('inserts a referenced chip above an existing draft', async () => {
    const editor = makeEditor();

    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          const draft = $createParagraphNode();
          draft.append($createTextNode('what about this?'));
          root.append(draft);
          $insertReferencedPaste('the quoted line');
        },
        { onUpdate: () => resolve() }
      );
    });

    editor.getEditorState().read(() => {
      const children = $getRoot().getChildren();
      const chip = children[0];
      expect($isPasteNode(chip)).toBe(true);
      if (!$isPasteNode(chip)) return;
      expect(chip.getOrigin()).toBe('referenced');
      expect(chip.getContent()).toBe('the quoted line');
      expect(children[1]?.getTextContent()).toBe('what about this?');
    });
  });

  it('ignores whitespace-only content', async () => {
    const editor = makeEditor();

    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          $insertReferencedPaste('   \n');
        },
        { onUpdate: () => resolve() }
      );
    });

    editor.getEditorState().read(() => {
      expect($getRoot().getChildren().some($isPasteNode)).toBe(false);
    });
  });
});
