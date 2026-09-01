import { openBulkEditModal } from '@app/features/entity/bulk-edit/BulkEditEntityModal';
import { t } from '@app/lib/i18n';
import { globalSplitManager } from '@app/signal/splitLayout';
import { globalRemoveFromSplitHistory } from '@components/app/split-layout/layoutUtils';
import { toast } from '@core/component/Toast/Toast';
import { createBulkDeleteDssItemsMutation, type EntityData } from '@entity';
import ArrowCounterClockwise from '@phosphor-icons/core/regular/arrow-counter-clockwise.svg?component-solid';
import type { SoupState } from '../create-soup-state';
import { restoreSoupFocus, trashEmails } from '../utils';

type MakeDeleteOptions = {
  userId: () => string | undefined;
};

export const makeDeleteAction = (options: MakeDeleteOptions) => {
  const { userId } = options;
  const bulkDelete = createBulkDeleteDssItemsMutation();

  /**
   * Delete reminders straight away, with no confirmation step.
   *
   * Unlike a document or a folder, a reminder holds nothing — deleting one
   * discards a note to self, so the modal cost more than it protected.
   *
   * Note this is genuinely unrecoverable: the reminders API has no undelete,
   * so unlike email (which trashes with an Undo toast) there is nothing to
   * offer here. Failures are surfaced by the mutation's own error handler,
   * which also rolls the row back into the list.
   */
  const deleteRemindersNow = async (reminders: EntityData[]) => {
    if (reminders.length === 0) return;
    try {
      await bulkDelete.mutateAsync(reminders);
      // Only after the delete lands: the mutation restores the rows on
      // failure, and a dropped split-history entry cannot be restored with
      // them.
      const splitManager = globalSplitManager();
      if (splitManager) {
        const ids = new Set(reminders.map(({ id }) => id));
        globalRemoveFromSplitHistory(splitManager, (entry) =>
          ids.has(entry.id)
        );
      }
      toast.success(
        t('soup.toast.remindersDeleted', { count: reminders.length })
      );
    } catch {
      // createBulkDeleteDssItemsMutation already toasts and restores the rows.
    }
  };

  const canExecute = (entity: EntityData): boolean => {
    if (entity.type === 'channel_message' || entity.type === 'channel_thread') {
      return false;
    }
    if (entity.type === 'email') {
      return true;
    }
    if (entity.type === 'channel') {
      return false;
    }
    // Reminders carry no owner id — they are private to their owner, and the
    // API only ever returns the caller's own — so the ownership check below
    // would reject every one of them.
    if (entity.type === 'reminder') {
      return true;
    }
    return entity.ownerId === userId();
  };

  const execute = async (entities: EntityData[]) => {
    const reminders = entities.filter((e) => e.type === 'reminder');
    const rest = entities.filter((e) => e.type !== 'reminder');
    void deleteRemindersNow(reminders);
    if (rest.length === 0) return;

    openBulkEditModal({
      view: 'delete',
      entities: rest,
      onFinish: () => {
        const splitManager = globalSplitManager();
        if (splitManager) {
          const entityIdSet = new Set(rest.map(({ id }) => id));
          globalRemoveFromSplitHistory(splitManager, (entry) =>
            entityIdSet.has(entry.id)
          );
        }
        toast.success(t('soup.toast.deleted', { count: rest.length }));
      },
    });
  };

  const executeWithSoup = async (entities: EntityData[], soup: SoupState) => {
    const currentIndex = soup.focus.index();
    const nextRow =
      soup.items.at(currentIndex + 1) ?? soup.items.at(currentIndex - 1);

    // Three lanes: emails trash immediately (with Undo), reminders delete
    // immediately (no Undo to give), everything else confirms first.
    const emailEntities = entities.filter((e) => e.type === 'email');
    const reminderEntities = entities.filter((e) => e.type === 'reminder');
    const nonEmailEntities = entities.filter(
      (e) => e.type !== 'email' && e.type !== 'reminder'
    );

    const advancePastDeleted = () => {
      soup.selection.clear();
      if (nextRow) soup.focus.set(nextRow.id);
      restoreSoupFocus(nextRow?.id);
    };

    const trashEmailEntities = () => {
      const handle = trashEmails(emailEntities.map((e) => e.id));

      const splitManager = globalSplitManager();
      if (splitManager) {
        const entityIdSet = new Set(emailEntities.map(({ id }) => id));
        globalRemoveFromSplitHistory(splitManager, (entry) =>
          entityIdSet.has(entry.id)
        );
      }

      soup.selection.clear();
      if (nextRow) {
        soup.focus.set(nextRow.id);
      }

      const toastId = toast.success(
        t('soup.toast.movedToTrash', { count: emailEntities.length }),
        {
          actions: [
            {
              label: t('soup.actions.undo'),
              icon: ArrowCounterClockwise,
              onClick: () => {
                if (toastId != null) toast.dismiss(toastId);
                handle.undo().then(
                  () => toast.success(t('soup.toast.restoredFromTrash')),
                  () => toast.failure(t('soup.toast.restoreFromTrashFailed'))
                );
              },
            },
          ],
          duration: 10_000,
        }
      );

      // Surface background API failures
      handle.done.catch(() => {
        toast.failure(t('soup.toast.moveToTrashFailed'));
      });

      restoreSoupFocus(nextRow?.id);
    };

    if (nonEmailEntities.length > 0) {
      // Handle non-email entities first via the bulk edit modal,
      // then trash emails in onFinish so nextRow/focus are still valid.
      openBulkEditModal({
        view: 'delete',
        entities: nonEmailEntities,
        onFinish: () => {
          const splitManager = globalSplitManager();
          if (splitManager) {
            const entityIdSet = new Set(nonEmailEntities.map(({ id }) => id));
            globalRemoveFromSplitHistory(splitManager, (entry) =>
              entityIdSet.has(entry.id)
            );
          }

          toast.success(
            t('soup.toast.deleted', { count: nonEmailEntities.length })
          );

          if (emailEntities.length > 0) {
            trashEmailEntities();
          } else {
            advancePastDeleted();
          }
        },
        onCancel: () => {
          const firstEntity = nonEmailEntities[0];
          if (firstEntity) {
            soup.focus.set(firstEntity.id);
          }
          restoreSoupFocus(firstEntity?.id);
        },
      });
    } else if (emailEntities.length > 0) {
      // Email-only selection: trash immediately
      trashEmailEntities();
    } else if (reminderEntities.length > 0) {
      // Reminders-only selection: no modal, so move focus on now rather than
      // waiting for a confirmation that never comes.
      advancePastDeleted();
    }

    // Reminders never gate on the modal, so they go regardless of what else
    // was selected — the confirmation covers only the entities it lists.
    void deleteRemindersNow(reminderEntities);
  };

  return { canExecute, execute, executeWithSoup };
};
