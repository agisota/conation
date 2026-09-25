import { $createListItemNode, $createListNode } from '@lexical/list';
import {
  $createDocumentCardNode,
  $createDocumentMentionNode,
  $createUserMentionNode,
} from '@macro-inc/lexical-core';
import {
  NodeReplacements,
  SupportedNodeTypes,
} from '@macro-inc/lexical-core/node-list';
import { markdownToSerializedEditorStateWithIds } from '@macro-inc/lexical-core/utils/markdown-state';
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  createEditor,
  type LexicalEditor,
} from 'lexical';
import { describe, expect, it } from 'vitest';
import {
  DO_REPLACE_COMMAND,
  DO_REPLACE_ONCE_COMMAND,
  DO_SEARCH_COMMAND,
  findAndReplacePlugin,
  type NodekeyOffset,
} from './findAndReplacePlugin';

function createSearchEditor(): {
  editor: LexicalEditor;
  getListOffset: () => NodekeyOffset[];
} {
  const editor = createEditor({
    namespace: 'find-and-replace-plugin-test',
    nodes: [...SupportedNodeTypes, ...NodeReplacements],
    onError: (error) => {
      throw error;
    },
  });

  let listOffset: NodekeyOffset[] = [];
  findAndReplacePlugin({
    getListOffset: () => listOffset,
    setListOffset: (next) => {
      listOffset = next;
    },
  })(editor);

  return {
    editor,
    getListOffset: () => listOffset,
  };
}

describe('findAndReplacePlugin document mentions', () => {
  it('finds a substring in an inline task chip title', () => {
    const { editor, getListOffset } = createSearchEditor();
    let mentionKey = '';

    editor.update(
      () => {
        const mention = $createDocumentMentionNode({
          documentId: 'task-1',
          documentName: 'Fix login bug',
          blockName: 'task',
        });
        mentionKey = mention.getKey();
        const paragraph = $createParagraphNode();
        paragraph.append(
          $createTextNode('Please '),
          mention,
          $createTextNode(' today')
        );
        $getRoot().clear().append(paragraph);
      },
      { discrete: true }
    );

    editor.getEditorState().read(() => {
      editor.dispatchCommand(DO_SEARCH_COMMAND, 'login');
    });

    const offsets = getListOffset();
    expect(offsets.some((offset) => offset.key === mentionKey)).toBe(true);
    expect(offsets[0]?.offset.start).toBe(4);
    expect(offsets[0]?.offset.end).toBe(9);
  });

  it('still finds regular paragraph text next to a task chip', () => {
    const { editor, getListOffset } = createSearchEditor();
    let textKey = '';

    editor.update(
      () => {
        const mention = $createDocumentMentionNode({
          documentId: 'task-1',
          documentName: 'Fix login bug',
          blockName: 'task',
        });
        const text = $createTextNode('Please review today');
        textKey = text.getKey();
        const paragraph = $createParagraphNode();
        paragraph.append(text, mention);
        $getRoot().clear().append(paragraph);
      },
      { discrete: true }
    );

    editor.getEditorState().read(() => {
      editor.dispatchCommand(DO_SEARCH_COMMAND, 'review');
    });

    const offsets = getListOffset();
    expect(offsets.some((offset) => offset.key === textKey)).toBe(true);
    expect(offsets.every((offset) => offset.key === textKey)).toBe(true);
  });

  it('does not join text across an ignored mention', () => {
    const { editor, getListOffset } = createSearchEditor();
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createTextNode('alpha'),
              $createUserMentionNode({
                userId: 'user-1',
                email: 'wolf@macro.com',
                displayName: 'Wolf',
              }),
              $createTextNode('beta')
            )
          );
      },
      { discrete: true }
    );
    editor
      .getEditorState()
      .read(() => editor.dispatchCommand(DO_SEARCH_COMMAND, 'alphabeta'));
    expect(getListOffset()).toEqual([]);
  });

  it('does not match ignored user-mention display names', () => {
    const { editor, getListOffset } = createSearchEditor();

    editor.update(
      () => {
        const mention = $createUserMentionNode({
          userId: 'user-1',
          email: 'wolf@macro.com',
          displayName: 'Wolf UniqueHandle',
        });
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Hello '), mention);
        $getRoot().clear().append(paragraph);
      },
      { discrete: true }
    );

    editor.getEditorState().read(() => {
      editor.dispatchCommand(DO_SEARCH_COMMAND, 'UniqueHandle');
    });

    expect(getListOffset()).toEqual([]);
  });
});

function searchMarkdown(markdown: string, query: string) {
  const { editor, getListOffset } = createSearchEditor();
  editor.setEditorState(
    editor.parseEditorState(markdownToSerializedEditorStateWithIds(markdown))
  );
  return editor.getEditorState().read(() => {
    editor.dispatchCommand(DO_SEARCH_COMMAND, query);
    return getListOffset().map((item) => ({
      text: $getNodeByKey(item.key)
        ?.getTextContent()
        .slice(item.offset.start, item.offset.end),
      isReplace: item.offset.isReplace,
      pairKey: item.pairKey,
    }));
  });
}

describe('findAndReplacePlugin multi-line blocks', () => {
  const markdown = [
    'Intro paragraph.',
    '',
    '```graphql',
    'type Calendar { id: ID!',
    '',
    '  isPrimary: Boolean! }',
    '```',
    '',
    '- **Fan-out:** a change is logged for every user.',
  ].join('\n');

  it('finds text inside a code block', () => {
    expect(searchMarkdown(markdown, 'isprimary')).toEqual([
      { text: 'isPrimary', isReplace: true, pairKey: 1 },
    ]);
  });

  it('finds text after a code block', () => {
    expect(searchMarkdown(markdown, 'fan-out')).toEqual([
      { text: 'Fan-out', isReplace: true, pairKey: 1 },
    ]);
    expect(searchMarkdown(markdown, 'every user')).toEqual([
      { text: 'every user', isReplace: true, pairKey: 1 },
    ]);
  });

  it('numbers every match in document order', () => {
    const matches = searchMarkdown(markdown, 'i');
    expect(matches.map((match) => match.text)).toEqual(
      matches.map(() => expect.stringMatching(/^i$/i))
    );
    expect(matches.map((match) => match.pairKey)).toEqual(
      matches.map((_, index) => index + 1)
    );
    expect(matches).toHaveLength(6);
  });

  it('splits a match across formatted text nodes', () => {
    expect(searchMarkdown('Say **hel**lo there', 'hello')).toEqual([
      { text: 'hel', isReplace: true, pairKey: 1 },
      { text: 'lo', isReplace: false, pairKey: 1 },
    ]);
  });

  it('does not match across block boundaries, even with a newline query', () => {
    expect(searchMarkdown('first\n\nsecond', 'firstsecond')).toEqual([]);
    expect(searchMarkdown('first\n\nsecond', 'first\nsecond')).toEqual([]);
    expect(searchMarkdown('first\n\nsecond', '\n')).toEqual([]);
    expect(searchMarkdown('first\n\nsecond', 'second')).toEqual([
      { text: 'second', isReplace: true, pairKey: 1 },
    ]);
  });

  it('allows newlines that belong to the code node itself', () => {
    expect(searchMarkdown(markdown, 'ID!\n\n  isPrimary')).toEqual([
      { text: 'ID!\n\n  isPrimary', isReplace: true, pairKey: 1 },
    ]);
  });
});

describe('findAndReplacePlugin nested blocks', () => {
  it('keeps document cards between text blocks unsearchable', () => {
    const { editor, getListOffset } = createSearchEditor();
    let beforeKey = '';
    let afterKey = '';
    editor.update(
      () => {
        const before = $createTextNode('alpha');
        const after = $createTextNode('beta');
        beforeKey = before.getKey();
        afterKey = after.getKey();
        const first = $createParagraphNode();
        first.append(before);
        const second = $createParagraphNode();
        second.append(after);
        $getRoot()
          .clear()
          .append(
            first,
            $createDocumentCardNode({
              documentId: 'doc-1',
              documentName: 'Card title',
              blockName: 'document',
            }),
            second
          );
      },
      { discrete: true }
    );

    const search = (query: string) =>
      editor.getEditorState().read(() => {
        editor.dispatchCommand(DO_SEARCH_COMMAND, query);
        return getListOffset();
      });
    expect(search('alphabeta')).toEqual([]);
    expect(search('alpha').map(({ key }) => key)).toEqual([beforeKey]);
    expect(search('beta').map(({ key }) => key)).toEqual([afterKey]);
  });

  it('separates a block card from adjacent inline text in a nested parent', () => {
    const { editor, getListOffset } = createSearchEditor();
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createListNode('bullet').append(
              $createListItemNode().append(
                $createTextNode('alpha'),
                $createDocumentCardNode({
                  documentId: 'doc-1',
                  documentName: 'Card title',
                  blockName: 'document',
                }),
                $createTextNode('beta')
              )
            )
          );
      },
      { discrete: true }
    );
    const search = (query: string) =>
      editor.getEditorState().read(() => {
        editor.dispatchCommand(DO_SEARCH_COMMAND, query);
        return getListOffset();
      });
    expect(search('alphaCard title')).toEqual([]);
    expect(search('Card titlebeta')).toEqual([]);
    expect(search('alpha\nCard title')).toEqual([]);
    editor.update(
      () =>
        editor.dispatchCommand(DO_REPLACE_COMMAND, {
          nodeKeyOffsetList: getListOffset(),
          replaceString: 'changed',
        }),
      { discrete: true }
    );
    expect(search('alpha').length).toBe(1);
    expect(search('beta').length).toBe(1);
    expect(search('Card title')).toHaveLength(1);
    expect(search('beta')).toHaveLength(1);
  });

  it('replaces real matches and leaves false boundaries untouched', () => {
    const { editor, getListOffset } = createSearchEditor();
    let left!: ReturnType<typeof $createTextNode>;
    let right!: ReturnType<typeof $createTextNode>;
    editor.update(
      () => {
        left = $createTextNode('alpha');
        right = $createTextNode('beta');
        const first = $createParagraphNode();
        first.append(left);
        const second = $createParagraphNode();
        second.append(right);
        $getRoot().clear().append(first, second);
      },
      { discrete: true }
    );

    editor
      .getEditorState()
      .read(() => editor.dispatchCommand(DO_SEARCH_COMMAND, 'alphabeta'));
    expect(getListOffset()).toEqual([]);
    editor.update(
      () =>
        editor.dispatchCommand(DO_REPLACE_ONCE_COMMAND, {
          nodeKeyOffsetList: getListOffset(),
          replaceString: 'changed',
        }),
      { discrete: true }
    );
    editor.update(
      () =>
        editor.dispatchCommand(DO_REPLACE_COMMAND, {
          nodeKeyOffsetList: getListOffset(),
          replaceString: 'changed',
        }),
      { discrete: true }
    );
    expect(
      editor
        .getEditorState()
        .read(() => [left.getTextContent(), right.getTextContent()])
    ).toEqual(['alpha', 'beta']);

    editor
      .getEditorState()
      .read(() => editor.dispatchCommand(DO_SEARCH_COMMAND, 'alpha'));
    editor.update(
      () =>
        editor.dispatchCommand(DO_REPLACE_ONCE_COMMAND, {
          nodeKeyOffsetList: getListOffset(),
          replaceString: 'omega',
        }),
      { discrete: true }
    );
    expect(
      editor
        .getEditorState()
        .read(() => [left.getTextContent(), right.getTextContent()])
    ).toEqual(['omega', 'beta']);
  });

  it('replaces a formatted match and all later matches after multiline code', () => {
    const { editor, getListOffset } = createSearchEditor();
    editor.setEditorState(
      editor.parseEditorState(
        markdownToSerializedEditorStateWithIds(
          '````\nfirst\nsecond\n````\n\n**hel**lo hello hello'
        )
      )
    );
    const search = (query: string) =>
      editor.getEditorState().read(() => {
        editor.dispatchCommand(DO_SEARCH_COMMAND, query);
        return getListOffset();
      });
    const firstOffsets = search('hello');
    expect(
      firstOffsets.map(({ pairKey, offset }) => [pairKey, offset.isReplace])
    ).toEqual([
      [1, true],
      [1, false],
      [2, true],
      [3, true],
    ]);
    editor.update(
      () =>
        editor.dispatchCommand(DO_REPLACE_ONCE_COMMAND, {
          nodeKeyOffsetList: firstOffsets.filter(
            ({ pairKey }) => pairKey === 1
          ),
          replaceString: 'goodbye',
        }),
      { discrete: true }
    );
    expect(search('hello')).toHaveLength(2);
    expect(search('goodbye')).toHaveLength(1);
    editor.update(
      () =>
        editor.dispatchCommand(DO_REPLACE_COMMAND, {
          nodeKeyOffsetList: search('hello'),
          replaceString: 'farewell',
        }),
      { discrete: true }
    );
    expect(search('hello')).toEqual([]);
    expect(search('farewell')).toHaveLength(2);
    expect(search('goodbye')).toHaveLength(1);
  });

  it('separates inline text from a block nested after it', () => {
    const { editor, getListOffset } = createSearchEditor();

    editor.update(
      () => {
        const parent = $createListItemNode();
        parent.append(
          $createTextNode('parent'),
          $createListNode('bullet').append(
            $createListItemNode().append($createTextNode('child'))
          )
        );
        $getRoot().clear().append($createListNode('bullet').append(parent));
      },
      { discrete: true }
    );

    editor.getEditorState().read(() => {
      editor.dispatchCommand(DO_SEARCH_COMMAND, 'parentchild');
    });
    expect(getListOffset()).toEqual([]);

    editor.getEditorState().read(() => {
      editor.dispatchCommand(DO_SEARCH_COMMAND, 'child');
    });
    expect(getListOffset()).toHaveLength(1);
  });
});
