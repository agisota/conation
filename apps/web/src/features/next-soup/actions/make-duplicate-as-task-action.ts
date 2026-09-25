import { createLexicalWrapper } from '@core/component/LexicalMarkdown/context/LexicalWrapperContext';
import {
  editorStateAsMarkdown,
  initializeEditorWithState,
} from '@core/component/LexicalMarkdown/utils';
import { toast } from '@core/component/Toast/Toast';
import { createTask } from '@core/util/create';
import type { EntityData } from '@entity';
import { syncServiceClient } from '@service-sync/client';
import type { EntityActionListState } from './entity-action-context';

export const makeDuplicateAsTaskAction = () => {
  const canExecute = (entity: EntityData): boolean => {
    if (entity.type !== 'document') return false;
    if (entity.fileType !== 'md') return false;
    if (entity.subType?.type !== 'note') return false;
    return true;
  };

  const execute = async (entities: EntityData[]) => {
    const entity = entities[0];
    if (entities.length !== 1 || !entity || !canExecute(entity)) return;

    const rawState = await syncServiceClient.getRaw({
      documentId: entity.id,
    });

    const { editor } = createLexicalWrapper({
      type: 'markdown',
      namespace: 'duplicate-as-task-extractor',
      isInteractable: () => false,
    });

    try {
      editor.parseEditorState(rawState);
    } catch {
      toast.failure('Failed to read document content');
      return;
    }

    initializeEditorWithState(editor, rawState);
    const markdownContent = editorStateAsMarkdown(editor, 'internal');

    const taskId = await createTask({
      title: entity.name,
      content: markdownContent,
      source: 'duplicate-as-task',
    });

    if (!taskId) {
      toast.failure('Failed to create task');
      return;
    }

    toast.success('Created task');
  };

  const executeWithSoup = async (
    entities: EntityData[],
    soup: EntityActionListState
  ) => {
    await execute(entities);
    soup.selection.clear();
  };

  return { canExecute, execute, executeWithSoup };
};
