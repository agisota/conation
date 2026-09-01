import { t } from '@app/lib/i18n';
import { globalSplitManager } from '@app/signal/splitLayout';
import { toast } from '@core/component/Toast/Toast';
import {
  type NotificationSource,
  openNotificationFromId,
  pendingNotificationNavigationId,
  setPendingNotificationNavigationId,
} from '@notifications';
import { createEffect, on } from 'solid-js';

export function usePendingNotificationNavigationEffect(
  notificationSource: NotificationSource
) {
  createEffect(
    on(
      [pendingNotificationNavigationId, globalSplitManager],
      ([notificationId, layoutManager]) => {
        if (!notificationId) return;
        if (!layoutManager) return;

        setPendingNotificationNavigationId(undefined);

        void openNotificationFromId(
          notificationId,
          layoutManager,
          notificationSource
        ).match(
          () => {},
          () => {
            toast.failure(t('notifications.feedback.openFailed'));
          }
        );
      }
    )
  );
}
