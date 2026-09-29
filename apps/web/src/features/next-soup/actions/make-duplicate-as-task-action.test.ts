import type { EntityData } from '@entity';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRaw: vi.fn(),
  createTask: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
  initialize: vi.fn(),
  parseEditorState: vi.fn(),
  markdown: vi.fn(() => 'converted markdown'),
}));

vi.mock(
  '@core/component/LexicalMarkdown/context/LexicalWrapperContext',
  () => ({
    createLexicalWrapper: () => ({
      editor: { parseEditorState: mocks.parseEditorState },
    }),
  })
);
vi.mock('@core/component/LexicalMarkdown/utils', () => ({
  editorStateAsMarkdown: mocks.markdown,
  initializeEditorWithState: mocks.initialize,
}));
vi.mock('@core/component/Toast/Toast', () => ({
  toast: { success: mocks.success, failure: mocks.failure },
}));
vi.mock('@core/util/create', () => ({ createTask: mocks.createTask }));
vi.mock('@service-sync/client', () => ({
  syncServiceClient: { getRaw: mocks.getRaw },
}));

import { makeDuplicateAsTaskAction } from './make-duplicate-as-task-action';

const document: EntityData = {
  type: 'document',
  id: 'doc-1',
  ownerId: 'user-1',
  name: 'Source title',
  updatedAt: new Date(),
  fileType: 'md',
  subType: null,
} as unknown as EntityData;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.parseEditorState.mockReturnValue({});
  mocks.getRaw.mockResolvedValue({
    root: { children: [{ type: 'paragraph' }] },
  });
  mocks.createTask.mockResolvedValue('task-1');
});

describe('makeDuplicateAsTaskAction', () => {
  it('converts the raw document state and creates a task', async () => {
    const action = makeDuplicateAsTaskAction();
    await action.execute([document]);

    expect(mocks.getRaw).toHaveBeenCalledExactlyOnceWith({
      documentId: 'doc-1',
    });
    expect(mocks.initialize).toHaveBeenCalledOnce();
    expect(mocks.createTask).toHaveBeenCalledExactlyOnceWith({
      title: 'Source title',
      content: 'converted markdown',
      source: 'duplicate-as-task',
    });
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith('Created task');
  });

  it('clears selection once after execution', async () => {
    const clear = vi.fn();
    await makeDuplicateAsTaskAction().executeWithSoup([document], {
      selection: { clear },
    } as never);
    expect(clear).toHaveBeenCalledOnce();
  });

  it('keeps the source selected when task creation returns no task', async () => {
    const clear = vi.fn();
    mocks.createTask.mockResolvedValue(undefined);
    await makeDuplicateAsTaskAction().executeWithSoup([document], {
      selection: { clear },
    } as never);
    expect(clear).not.toHaveBeenCalled();
    expect(mocks.failure).toHaveBeenCalledExactlyOnceWith(
      'Failed to create task'
    );
  });

  it('keeps the source selected when its editor state cannot be parsed', async () => {
    const clear = vi.fn();
    mocks.parseEditorState.mockImplementation(() => {
      throw new Error('invalid state');
    });
    await makeDuplicateAsTaskAction().executeWithSoup([document], {
      selection: { clear },
    } as never);
    expect(clear).not.toHaveBeenCalled();
    expect(mocks.failure).toHaveBeenCalledExactlyOnceWith(
      'Failed to read document content'
    );
  });

  it('does not fetch/create when the selection is ineligible or stale', async () => {
    const action = makeDuplicateAsTaskAction();
    const task = { ...document, subType: { type: 'task' as const } };
    const snippet = { ...document, subType: { type: 'snippet' as const } };
    const skill = { ...document, subType: { type: 'skill' as const } };
    for (const ineligible of [task, snippet, skill]) {
      expect(action.canExecute(ineligible as EntityData)).toBe(false);
      await action.execute([ineligible as EntityData]);
    }
    await action.execute([]);
    expect(mocks.getRaw).not.toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('does not create a task for an empty selection', async () => {
    const action = makeDuplicateAsTaskAction();
    expect(
      action.canExecute({ ...document, fileType: 'pdf' as const } as EntityData)
    ).toBe(false);
    await action.execute([]);
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('does not create a task when populated source state is invalid', async () => {
    mocks.parseEditorState.mockImplementation(() => {
      throw new Error('invalid state');
    });

    await makeDuplicateAsTaskAction().execute([document]);

    expect(mocks.createTask).not.toHaveBeenCalled();
    expect(mocks.failure).toHaveBeenCalledExactlyOnceWith(
      'Failed to read document content'
    );
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('does not report success when task creation fails', async () => {
    mocks.createTask.mockResolvedValue(undefined);
    await makeDuplicateAsTaskAction().execute([document]);
    expect(mocks.failure).toHaveBeenCalledExactlyOnceWith(
      'Failed to create task'
    );
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('does not report success when reading source content fails', async () => {
    mocks.getRaw.mockRejectedValue(new Error('offline'));
    await expect(
      makeDuplicateAsTaskAction().execute([document])
    ).rejects.toThrow('offline');
    expect(mocks.createTask).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
