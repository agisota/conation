import { DEV_MODE_ENV } from '@core/constant/featureFlags';
import { t } from '@core/i18n';
import {
  getDeletedItems,
  invalidateDeletedItems,
  setDeletedItems,
} from '@queries/storage/deleted';
import type { ItemType } from '@service-storage/client';
import type { Item } from '@service-storage/generated/schemas/item';
import {
  createCallback,
  createSingletonRoot,
} from '@solid-primitives/rootless';
import { ToastType, toast } from '../Toast/Toast';
import {
  bulkCopy as bulkCopyOp,
  bulkDelete as bulkDeleteOp,
  bulkMoveToFolder as bulkMoveToFolderOp,
  bulkPermanentlyDelete as bulkPermanentlyDeleteOp,
  bulkRevertDelete as bulkRevertDeleteOp,
  copyItem as copyItemOp,
  deleteItem as deleteItemOp,
  getItemAccessLevel as getItemAccessLevelOp,
  moveToFolder as moveToFolderOp,
  permanentlyDelete as permanentlyDeleteOp,
  revertDelete as revertDeleteOp,
} from './itemOperations';

export const useItemOperations = createSingletonRoot(() => {
  const getItemAccessLevel = createCallback(
    (args: { itemType: ItemType; id: string }) => getItemAccessLevelOp(args)
  );

  const deleteItem = createCallback(
    async (args: { itemType: ItemType; id: string; itemName: string }) => {
      const success = await deleteItemOp(args);
      if (success) {
        toast.success(t('core.files.item.deleted', { name: args.itemName }));
      } else {
        toast.failure(t('core.files.item.deleteFailed'));
      }
      return success;
    }
  );

  const moveToFolder = createCallback(
    async (args: {
      itemType: ItemType;
      id: string;
      itemName: string;
      folderId: string;
      folderName: string;
    }) => {
      const success = await moveToFolderOp(args);
      if (success) {
        toast.success(
          t('core.files.item.moved', {
            name: args.itemName,
            folder: args.folderName,
          })
        );
      } else {
        toast.failure(t('core.files.item.moveFailed'));
      }
      return success;
    }
  );

  const bulkMoveToFolder = createCallback(
    async (items: Item[], folderId: string, folderName: string) => {
      const result = await toast.promise(bulkMoveToFolderOp(items, folderId), {
        loading: t('core.files.bulk.move.loading', { count: items.length }),
        success: ({ failedItems }) => {
          if (failedItems.length > 0) {
            return t('core.files.bulk.move.partialFailure', {
              count: failedItems.length,
            });
          }
          return t('core.files.bulk.move.success', {
            count: items.length,
            folder: folderName,
          });
        },
        error: (error) =>
          t('core.files.bulk.move.error', {
            reason: error.message || t('core.errors.unknown'),
          }),
        toastTypeDeterminer: (result) =>
          result.failedItems.length > 0 ? ToastType.FAILURE : ToastType.SUCCESS,
      });
      return result;
    }
  );

  const copyItem = createCallback(
    async (args: {
      itemType: Exclude<ItemType, 'project'>;
      id: string;
      name: string;
    }) => {
      const id = await copyItemOp(args);
      const success = id !== null;
      if (success) {
        toast.success(t('core.files.item.copied', { name: args.name }));
      } else {
        toast.failure(t('core.files.item.copyFailed'));
      }
      return id;
    }
  );
  const bulkDelete = createCallback(async (items: Item[]) => {
    const result = await toast.promise(bulkDeleteOp(items), {
      loading: t('core.files.bulk.delete.loading', { count: items.length }),
      success: ({ failedItems }) => {
        if (failedItems.length > 0) {
          return t('core.files.bulk.delete.partialFailure', {
            count: failedItems.length,
          });
        }
        return items.length === 5 && DEV_MODE_ENV
          ? 'PENTAKILL'
          : t('core.files.bulk.delete.success', { count: items.length });
      },
      error: (error) =>
        t('core.files.bulk.delete.error', {
          reason: error.message || t('core.errors.unknown'),
        }),
      toastTypeDeterminer: (result) =>
        result.failedItems.length > 0 ? ToastType.FAILURE : ToastType.SUCCESS,
    });
    return result;
  });

  const bulkCopy = createCallback(async (items: Item[]) => {
    const result = await toast.promise(bulkCopyOp(items), {
      loading: t('core.files.bulk.copy.loading', { count: items.length }),
      success: ({ failedItems }) => {
        if (failedItems.length > 0) {
          return t('core.files.bulk.copy.partialFailure', {
            count: failedItems.length,
          });
        }
        return t('core.files.bulk.copy.success', { count: items.length });
      },
      error: (error) =>
        t('core.files.bulk.copy.error', {
          reason: error.message || t('core.errors.unknown'),
        }),
      toastTypeDeterminer: (result) =>
        result.failedItems.length > 0 ? ToastType.FAILURE : ToastType.SUCCESS,
    });
    return result;
  });

  const revertDelete = createCallback(
    async (args: { itemType: ItemType; id: string; itemName: string }) => {
      const success = await revertDeleteOp(args);
      if (success) {
        toast.success(t('core.files.item.restored', { name: args.itemName }));
      } else {
        toast.failure(t('core.files.item.restoreFailed'));
      }
    }
  );

  const permanentlyDelete = createCallback(
    async (args: { itemType: ItemType; id: string; itemName: string }) => {
      const success = await permanentlyDeleteOp(args);
      if (success) {
        toast.success(t('core.files.item.deleted', { name: args.itemName }));
      } else {
        toast.failure(t('core.files.item.deleteFailed'));
      }
    }
  );

  const bulkPermanentlyDelete = createCallback(async (items: Item[]) => {
    const result = await toast.promise(bulkPermanentlyDeleteOp(items), {
      loading: t('core.files.bulk.delete.loading', { count: items.length }),
      success: ({ failedItems }) => {
        if (failedItems.length > 0) {
          return t('core.files.bulk.delete.partialFailure', {
            count: failedItems.length,
          });
        }
        return t('core.files.bulk.delete.success', { count: items.length });
      },
      error: (error) =>
        t('core.files.bulk.delete.error', {
          reason: error.message || t('core.errors.unknown'),
        }),
      toastTypeDeterminer: (result) =>
        result.failedItems.length > 0 ? ToastType.FAILURE : ToastType.SUCCESS,
    });

    // If items have failed to permanently delete, we can't just refetch resources, because items delete so slowly everything that had been successfully deleted will reappear.
    // So we need to undo our optimistic removal here.
    if (result.failedItems.length > 0) {
      await invalidateDeletedItems();
      const deletedItems = getDeletedItems();
      setDeletedItems(() => ({
        items: deletedItems.filter((item) => {
          return (
            result.failedItems.some(
              (failedItem) => failedItem.id === item.id
            ) || !items.some((argItem) => argItem.id === item.id)
          );
        }),
      }));
    }

    return result;
  });

  const bulkRevertDelete = createCallback(async (items: Item[]) => {
    const result = await toast.promise(bulkRevertDeleteOp(items), {
      loading: t('core.files.bulk.restore.loading', { count: items.length }),
      success: ({ failedItems }) => {
        if (failedItems.length > 0) {
          return t('core.files.bulk.restore.partialFailure', {
            count: failedItems.length,
          });
        }
        return t('core.files.bulk.restore.success', { count: items.length });
      },
      error: (error) =>
        t('core.files.bulk.restore.error', {
          reason: error.message || t('core.errors.unknown'),
        }),
      toastTypeDeterminer: (result) =>
        result.failedItems.length > 0 ? ToastType.FAILURE : ToastType.SUCCESS,
    });
    return result;
  });

  return {
    deleteItem,
    moveToFolder,
    copyItem,
    bulkDelete,
    bulkCopy,
    bulkMoveToFolder,
    getItemAccessLevel,
    revertDelete,
    permanentlyDelete,
    bulkPermanentlyDelete,
    bulkRevertDelete,
  };
});
