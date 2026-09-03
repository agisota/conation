import type { EventEditorInitialValues } from '@app/features/calendar/components/composer/event-form-model';
import type { CalendarEvent } from '@app/features/calendar/types';
import { t } from '@app/lib/i18n';
import { useSplitLayout } from '@components/app/split-layout/layout';
import { confirmDialog } from '@ui';
import { getOwner } from 'solid-js';

/** Values and lifecycle callbacks used to open an event composer. */
export interface OpenEventComposerOptions {
  event?: CalendarEvent;
  initialValues?: EventEditorInitialValues;
  onCalendarChange?: (calendarId: string, color: string) => void;
  onClose?: () => void;
}

/** Opens an event composer with confirmation before discarding changes. */
export function useOpenEventComposer() {
  const { popoverSplit } = useSplitLayout();
  const owner = getOwner();

  return (options: OpenEventComposerOptions = {}) => {
    let eventSaved = false;
    let formDirty = false;
    let closeConfirmationPending = false;

    return popoverSplit(
      {
        type: 'component',
        id: 'calendar-event-compose',
        params: {
          event: options.event,
          initialValues: options.initialValues,
          onCalendarChange: options.onCalendarChange,
          onDirtyChange: (dirty: boolean) => {
            formDirty = dirty;
          },
          onSaveSuccess: () => {
            eventSaved = true;
          },
        },
      },
      {
        onClose: async (close) => {
          if (closeConfirmationPending) return;

          if (!eventSaved && formDirty) {
            closeConfirmationPending = true;
            try {
              const confirmed = await confirmDialog(
                {
                  title: t('calendar.event.discardDialog.title'),
                  body: t('calendar.event.discardDialog.description'),
                  confirmLabel: t('calendar.event.discardDialog.confirm'),
                  cancelLabel: t('calendar.event.discardDialog.cancel'),
                  tone: 'danger',
                },
                { owner }
              );
              if (!confirmed) return;
            } finally {
              closeConfirmationPending = false;
            }
          }

          options.onClose?.();
          close();
        },
      }
    );
  };
}
