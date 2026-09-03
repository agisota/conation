import { openBulkEditModal } from '@app/features/entity/bulk-edit/BulkEditEntityModal';
import { t } from '@app/lib/i18n';
import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import type { SoupState } from '../create-soup-state';
import { restoreSoupFocus } from '../utils';

export const makeMoveToProjectAction = () => {
  const canExecute = (entity: EntityData): boolean => {
    return (
      entity.type !== 'channel' &&
      entity.type !== 'channel_message' &&
      entity.type !== 'channel_thread' &&
      entity.type !== 'foreign' &&
      // Reminders are private to their owner and live outside the folder tree.
      entity.type !== 'reminder'
    );
  };

  const execute = async (entities: EntityData[]) => {
    openBulkEditModal({
      view: 'moveToProject',
      entities,
      onFinish: () => {
        toast.success(
          t('soup.toast.movedToFolder', { count: entities.length })
        );
      },
      onError: () => toast.failure(t('soup.toast.moveToFolderFailed')),
    });
  };

  const executeWithSoup = async (entities: EntityData[], soup: SoupState) => {
    const currentIndex = soup.focus.index();
    const nextRow =
      soup.items.at(currentIndex + 1) ?? soup.items.at(currentIndex - 1);

    openBulkEditModal({
      view: 'moveToProject',
      entities,
      onFinish: () => {
        soup.selection.clear();
        if (nextRow) {
          soup.focus.set(nextRow.id);
        }
        toast.success(
          t('soup.toast.movedToFolder', { count: entities.length })
        );
        restoreSoupFocus(nextRow?.id);
      },
      onError: () => toast.failure(t('soup.toast.moveToFolderFailed')),
      onCancel: () => {
        const firstEntity = entities[0];
        if (firstEntity) {
          soup.focus.set(firstEntity.id);
        }
        restoreSoupFocus(firstEntity?.id);
      },
    });
  };

  return { canExecute, execute, executeWithSoup };
};
