import { openBulkEditModal } from '@app/features/entity/bulk-edit/BulkEditEntityModal';
import { BulkDeleteFailure } from '@app/features/entity/queries/bulk-delete-result';
import { globalSplitManager } from '@app/signal/splitLayout';
import { globalRemoveFromSplitHistory } from '@components/app/split-layout/layoutUtils';
import { toast } from '@core/component/Toast/Toast';
import {
  createBulkDeleteDssItemsMutation,
  type EntityData,
  isEmailEntity,
} from '@entity';
import ArrowCounterClockwise from '@phosphor-icons/core/regular/arrow-counter-clockwise.svg?component-solid';
import type { SoupRow } from '../create-soup-state';
import { restoreSoupFocus, trashEmails } from '../utils';
import type {
  EntityActionListState,
  EntityActionNavigationHandler,
} from './entity-action-context';

type MakeDeleteOptions = {
  userId: () => string | undefined;
  onDeleted?: (entities: EntityData[]) => void;
};

/** Cleanup follows confirmed outcomes, not whether the dialog eventually closes. */
function createDeletionCleanup() {
  const deletedIds = new Set<string>();
  return {
    deletedIds,
    confirm: (entities: EntityData[]) => {
      const newlyDeleted = entities.filter((entity) => {
        if (deletedIds.has(entity.id)) return false;
        deletedIds.add(entity.id);
        return true;
      });
      if (newlyDeleted.length === 0) return newlyDeleted;
      const splitManager = globalSplitManager();
      if (splitManager) {
        const ids = new Set(newlyDeleted.map((entity) => entity.id));
        globalRemoveFromSplitHistory(splitManager, (entry) =>
          ids.has(entry.id)
        );
      }
      return newlyDeleted;
    },
  };
}

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
  const deleteRemindersNow = async (
    reminders: EntityData[],
    onConfirmed?: (deleted: EntityData[]) => void
  ) => {
    if (reminders.length === 0) return;
    try {
      let deleted = reminders;
      try {
        await bulkDelete.mutateAsync(reminders);
      } catch (error) {
        if (
          !(error instanceof BulkDeleteFailure) ||
          error.deletedEntities.length === 0
        )
          throw error;
        deleted = error.deletedEntities;
      }
      // Only after the delete lands: the mutation restores the rows on
      // failure, and a dropped split-history entry cannot be restored with
      // them.
      const splitManager = globalSplitManager();
      if (splitManager) {
        const ids = new Set(deleted.map(({ id }) => id));
        globalRemoveFromSplitHistory(splitManager, (entry) =>
          ids.has(entry.id)
        );
      }
      if (deleted.length === reminders.length) {
        toast.success(
          reminders.length > 1
            ? `Deleted ${reminders.length} reminders`
            : 'Reminder deleted'
        );
      }
      options.onDeleted?.(deleted);
      onConfirmed?.(deleted);
    } catch {
      // The mutation already reports failure and restores the failed rows.
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

    const cleanup = createDeletionCleanup();
    openBulkEditModal({
      view: 'delete',
      entities: rest,
      onPartialDelete: (deleted) => {
        const confirmed = cleanup.confirm(deleted);
        if (confirmed.length > 0) options.onDeleted?.(confirmed);
      },
      onFinish: () => {
        const confirmed = cleanup.confirm(rest);
        toast.success(
          rest.length > 1 ? `Deleted ${rest.length} items` : 'Deleted'
        );
        if (confirmed.length > 0) options.onDeleted?.(confirmed);
      },
    });
  };

  const executeWithSoup = async (
    entities: EntityData[],
    soup: EntityActionListState,
    onNavigate?: EntityActionNavigationHandler
  ) => {
    const currentIndex = soup.focus.index();
    const nextRow =
      soup.items.at(currentIndex + 1) ?? soup.items.at(currentIndex - 1);
    const isFocusableRow = (row: SoupRow | undefined): row is SoupRow =>
      row !== undefined &&
      !row.getIsGrouped() &&
      !row.getIsLoadMore() &&
      (!row.group || row.group.isExpanded());
    const captureAnchor = (row: SoupRow | undefined) =>
      isFocusableRow(row)
        ? { rowId: row.id, entityId: row.original.id }
        : undefined;
    const requestedIds = new Set(entities.map((entity) => entity.id));
    const initialFocusedId = soup.focus.id();
    const anchorNavigation = {
      wrapNavigation: false,
      skipGroupHeaders: true,
      skipLoadMore: true,
      skip: (row: SoupRow) => requestedIds.has(row.original.id),
    };
    // Capture identities while the focused row still exists. The immediate
    // neighbour can belong to the selected block, so also remember the first
    // non-target row on either side. Do not retain mutable row-store proxies.
    const focusAnchors = [
      captureAnchor(nextRow),
      captureAnchor(soup.navigate.peekOffset(1, anchorNavigation)?.row),
      captureAnchor(soup.navigate.peekOffset(-1, anchorNavigation)?.row),
    ];

    // Three lanes: emails trash immediately (with Undo), reminders delete
    // immediately (no Undo to give), everything else confirms first.
    const emailEntities = entities.filter(isEmailEntity);
    const reminderEntities = entities.filter((e) => e.type === 'reminder');
    const nonEmailEntities = entities.filter(
      (e) => e.type !== 'email' && e.type !== 'reminder'
    );

    const cleanup = createDeletionCleanup();
    let remainingEntities: EntityData[] = nonEmailEntities;
    let hadPartialDeletion = false;
    let confirmedReminderIds = new Set<string>();
    const nextSurvivingRow = (
      alsoRemoved: string[] = [],
      excludeRequested = true
    ) => {
      const reminderIds = new Set(reminderEntities.map(({ id }) => id));
      const pendingRequestedIds = new Set(
        [...requestedIds].filter((id) => !reminderIds.has(id))
      );
      const removed = new Set([
        ...cleanup.deletedIds,
        ...alsoRemoved,
        ...(excludeRequested ? pendingRequestedIds : []),
      ]);
      const survives = (row: SoupRow | undefined): row is SoupRow =>
        isFocusableRow(row) && !removed.has(row.original.id);
      for (const anchor of focusAnchors) {
        if (!anchor || removed.has(anchor.entityId)) continue;
        const keyed = soup.items.get(anchor.rowId);
        const live =
          keyed?.original.id === anchor.entityId
            ? keyed
            : soup.items.get(anchor.entityId);
        if (survives(live) && live.original.id === anchor.entityId) return live;
      }
      // A concurrent refresh can remove both neighbours. Search around the
      // captured position, not the now-missing focus (peekOffset would start
      // from the first/last row). The index is bounded by the current list.
      const count = soup.items.count();
      if (count === 0) return undefined;
      const start = Math.min(Math.max(currentIndex, 0), count - 1);
      for (let index = start; index < count; index += 1) {
        const row = soup.items.at(index);
        if (survives(row)) return row;
      }
      for (let index = start - 1; index >= 0; index -= 1) {
        const row = soup.items.at(index);
        if (survives(row)) return row;
      }
      return undefined;
    };
    const advancePastDeleted = (alsoRemoved: string[] = []) => {
      soup.selection.clear();
      const next = nextSurvivingRow(alsoRemoved);
      soup.focus.set(next?.id);
      restoreSoupFocus(next?.id);
      onNavigate?.({ actionId: 'delete', entity: next?.original });
    };

    const trashEmailEntities = () => {
      const handle = trashEmails(
        emailEntities.map((e) => ({ id: e.id, linkId: e.linkId }))
      );

      const splitManager = globalSplitManager();
      if (splitManager) {
        const entityIdSet = new Set(emailEntities.map(({ id }) => id));
        globalRemoveFromSplitHistory(splitManager, (entry) =>
          entityIdSet.has(entry.id)
        );
      }

      soup.selection.clear();
      const next = nextSurvivingRow(emailEntities.map((entity) => entity.id));
      if (next || hadPartialDeletion) {
        soup.focus.set(next?.id);
      }

      const toastId = toast.success(
        emailEntities.length > 1
          ? `Moved ${emailEntities.length} items to Trash`
          : 'Moved to Trash',
        {
          actions: [
            {
              label: 'Undo',
              icon: ArrowCounterClockwise,
              onClick: () => {
                if (toastId != null) toast.dismiss(toastId);
                handle.undo().then(
                  () => toast.success('Restored from Trash'),
                  () => toast.failure('Failed to restore from Trash')
                );
              },
            },
          ],
          duration: 10_000,
        }
      );

      // Navigation reflects confirmed server state, not the optimistic removal.
      void handle.done.then(
        () => {
          const confirmedNext = nextSurvivingRow(
            emailEntities.map(({ id }) => id)
          );
          soup.focus.set(confirmedNext?.id);
          restoreSoupFocus(confirmedNext?.id);
          onNavigate?.({ actionId: 'delete', entity: confirmedNext?.original });
        },
        () => {
          toast.failure('Failed to move to Trash');
          // The modal-confirmed entities remain deleted even if the independent
          // email lane fails; do not leave their preview in place.
          const confirmedNonEmail = nonEmailEntities.filter((entity) =>
            cleanup.deletedIds.has(entity.id)
          );
          if (confirmedNonEmail.length > 0) {
            soup.selection.clear();
            // The email lane failed, so those requested emails remain valid
            // survivors; exclude only the documents confirmed deleted.
            const confirmedIds = confirmedNonEmail.map(({ id }) => id);
            const confirmedNext = nextSurvivingRow(confirmedIds, false);
            soup.focus.set(confirmedNext?.id);
            restoreSoupFocus(confirmedNext?.id);
            onNavigate?.({
              actionId: 'delete',
              entity: confirmedNext?.original,
            });
          }
        }
      );

      restoreSoupFocus(next?.id);
    };

    if (nonEmailEntities.length > 0) {
      // Handle non-email entities first via the bulk edit modal,
      // then trash emails in onFinish so nextRow/focus are still valid.
      openBulkEditModal({
        view: 'delete',
        entities: nonEmailEntities,
        onPartialDelete: (deleted, remaining) => {
          hadPartialDeletion = true;
          remainingEntities = remaining;
          soup.selection.clear();
          cleanup.confirm(deleted);
        },
        onFinish: () => {
          cleanup.confirm(nonEmailEntities);
          toast.success(
            nonEmailEntities.length > 1
              ? `Deleted ${nonEmailEntities.length} items`
              : 'Deleted'
          );

          if (emailEntities.length > 0) {
            trashEmailEntities();
          } else {
            advancePastDeleted();
          }
        },
        onCancel: () => {
          // Cancellation only reconciles entities the server confirmed deleted.
          // A still-live focused entity was not deleted and must retain its preview.
          if (
            (hadPartialDeletion || cleanup.deletedIds.size > 0) &&
            initialFocusedId &&
            soup.focus.id() === initialFocusedId &&
            cleanup.deletedIds.has(initialFocusedId)
          ) {
            const confirmedIds = [...cleanup.deletedIds];
            const survivor = nextSurvivingRow(confirmedIds, false);
            soup.focus.set(survivor?.id);
            restoreSoupFocus(survivor?.id);
            onNavigate?.({ actionId: 'delete', entity: survivor?.original });
            return;
          }
          if (!hadPartialDeletion && confirmedReminderIds.size === 0) {
            const firstRemaining = remainingEntities.find((entity) =>
              soup.items.get(entity.id)
            );
            if (firstRemaining) {
              soup.focus.set(firstRemaining.id);
              restoreSoupFocus(firstRemaining.id);
            }
          }
        },
      });
    } else if (emailEntities.length > 0) {
      // Email-only selection: trash immediately
      trashEmailEntities();
    }

    // Reminders never gate on the modal, so they go regardless of what else
    // was selected — the confirmation covers only the entities it lists.
    void deleteRemindersNow(reminderEntities, (deleted) => {
      const confirmed = cleanup.confirm(deleted);
      confirmedReminderIds = new Set([
        ...confirmedReminderIds,
        ...confirmed.map(({ id }) => id),
      ]);
      // Reminder deletion is independent of modal confirmation. Reconcile it
      // immediately only when the item previewed at invocation was deleted;
      // later document/email completion will account for these IDs via cleanup.
      if (
        confirmed.some(
          ({ id }) => id === initialFocusedId || id === soup.focus.id()
        )
      ) {
        soup.selection.clear();
        // Keep other requested lanes out of the preview until their outcome is
        // known; otherwise the modal lane can later delete the preview we just opened.
        // The modal lane is still pending here. Its items remain valid
        // preview candidates until confirmation; if it is cancelled, keep the
        // surviving pending item visible instead of closing Home prematurely.
        const next = nextSurvivingRow([], false);
        soup.focus.set(next?.id);
        restoreSoupFocus(next?.id);
        onNavigate?.({ actionId: 'delete', entity: next?.original });
      }
    });
  };

  return { canExecute, execute, executeWithSoup };
};
