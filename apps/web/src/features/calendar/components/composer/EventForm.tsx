import { t } from '@app/lib/i18n';
import SpinnerIcon from '@phosphor/spinner.svg';
import type { CalendarUpdateScope } from '@service-email/client';
import { Button, cn, Layer } from '@ui';
import {
  createEffect,
  createSignal,
  createUniqueId,
  For,
  Show,
} from 'solid-js';
import type { CalendarEventFormController } from './create-calendar-event-form-controller';
import { EventDateTimeRangeFields } from './EventDateTimeRangeFields';
import {
  EventComposerCalendarPill,
  EventComposerConferencePill,
  EventComposerGuestsPill,
  EventComposerLocationPill,
  EventComposerRecurrencePill,
  EventComposerRemindersPill,
} from './EventPropertyPills';
import type {
  EventEditorDisabledFields,
  EventEditorSubmitValues,
} from './event-form-model';
import { RecurrenceBuilder } from './RecurrenceBuilder';

export interface EventFormProps {
  controller: CalendarEventFormController;
  isEdit?: boolean;
  disabledFields?: EventEditorDisabledFields;
  showRecurringEditNotice?: boolean;
  /** Disable interaction without presenting the form as an in-flight save. */
  disabled?: boolean;
  pending: boolean;
  class?: string;
  /**
   * Hides the built-in Cancel/submit footer so a host can render its own
   * controls (e.g. the channel input's event face). Submission then goes
   * through the controller's `submitValues` or the form's Enter handling.
   */
  hideFooter?: boolean;
  /** Overrides the title autofocus; defaults to autofocusing on create. */
  autofocusTitle?: boolean;
  /** Observes the title input, e.g. to refocus when a host face activates. */
  titleInputRef?: (el: HTMLInputElement) => void;
  onCalendarChange?: (calendarId: string, color: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** Discards the form. Unused when the footer is hidden. */
  onCancel?: () => void;
  onSubmit: (
    values: EventEditorSubmitValues,
    scope?: CalendarUpdateScope
  ) => void;
}

/** Whether edits to a recurring event patch one occurrence or the whole series. */
const RECURRING_EDIT_SCOPE_OPTIONS = [
  {
    scope: 'this_event',
    labelKey: 'calendar.event.form.recurringEditThisEvent',
  },
  { scope: 'all', labelKey: 'calendar.event.form.recurringEditAllEvents' },
] as const satisfies readonly {
  scope: CalendarUpdateScope;
  labelKey: string;
}[];

/** Create/edit event form laid out like the standalone task composer. */
export function EventForm(props: EventFormProps) {
  const formId = createUniqueId();

  const dateRangeErrorId = `event-composer-date-range-error-${formId}`;
  const pastEventWarningId = `event-composer-past-event-warning-${formId}`;

  const controller = props.controller;
  const state = controller.state;
  const isEdit = () => props.isEdit ?? false;
  const formIsDisabled = () => props.pending || props.disabled === true;

  // Recurring edits default to the whole series, matching the long-standing
  // behavior; "this event" writes a single-occurrence exception.
  const [editScope, setEditScope] = createSignal<CalendarUpdateScope>('all');

  // An invalid range already speaks for itself; only one line shows at a time.
  const pastEventWarning = () =>
    controller.dateRangeError() ? undefined : controller.pastEventWarning();
  const dateRangeDescribedBy = () => {
    if (controller.dateRangeError()) return dateRangeErrorId;
    return pastEventWarning() ? pastEventWarningId : undefined;
  };

  const fieldIsReadOnly = (field: keyof EventEditorDisabledFields) =>
    props.disabledFields?.[field] === true;
  const fieldIsDisabled = (field: keyof EventEditorDisabledFields) =>
    formIsDisabled() || fieldIsReadOnly(field);

  createEffect(() => {
    const option = controller.selectedCalendarOption();
    if (option) props.onCalendarChange?.(option.id, option.color);
  });
  createEffect(() => props.onDirtyChange?.(controller.isDirty()));

  const submit = () => {
    const values = controller.submitValues();
    if (!values || formIsDisabled()) return;
    props.onSubmit(
      values,
      props.showRecurringEditNotice ? editScope() : undefined
    );
  };

  return (
    <form
      class={cn(
        'flex min-h-0 flex-1 flex-col gap-4 text-sm text-ink-muted [&_:disabled]:cursor-not-allowed',
        props.class
      )}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto scrollbar-hidden">
        <div class="flex min-w-0 flex-col gap-6 text-sm text-ink-muted">
          <div class="flex min-w-0 flex-col gap-1">
            <div class="flex min-w-0 flex-col gap-1">
              <EventDateTimeRangeFields
                start={state().start}
                end={state().end}
                allDay={state().allDay}
                onStartChange={controller.setStart}
                onEndChange={(end) => controller.setField('end', end)}
                onAllDayChange={controller.setAllDay}
                startDisabled={fieldIsDisabled('start')}
                endDisabled={fieldIsDisabled('end')}
                allDayDisabled={fieldIsDisabled('allDay')}
                invalid={controller.dateRangeError() !== undefined}
                describedBy={dateRangeDescribedBy()}
              />
              <Show when={controller.dateRangeError()}>
                {(error) => (
                  <p
                    id={dateRangeErrorId}
                    role="alert"
                    class="text-xs text-failure"
                  >
                    {error()}
                  </p>
                )}
              </Show>
              <Show when={pastEventWarning()}>
                {(warning) => (
                  <p
                    id={pastEventWarningId}
                    role="status"
                    class="text-xs text-warning"
                  >
                    {warning()}
                  </p>
                )}
              </Show>
            </div>

            <input
              ref={props.titleInputRef}
              type="text"
              value={state().title}
              onInput={(event) =>
                controller.setField('title', event.currentTarget.value)
              }
              placeholder={t('calendar.event.new')}
              aria-label={t('calendar.event.form.title.label')}
              autofocus={props.autofocusTitle ?? !isEdit()}
              disabled={fieldIsDisabled('title')}
              class="h-9 w-full bg-transparent px-2 text-lg font-semibold leading-snug text-ink outline-none placeholder:text-ink-placeholder"
            />

            <div class="h-12">
              <textarea
                value={state().description}
                onInput={(event) =>
                  controller.setField(
                    'description',
                    event.currentTarget.value.replaceAll(/[\r\n]+/g, ' ')
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault();
                }}
                placeholder={t('calendar.event.form.description.placeholder')}
                aria-label={t('calendar.event.form.description.label')}
                rows={1}
                wrap="off"
                disabled={fieldIsDisabled('description')}
                class="h-full w-full resize-none overflow-x-auto bg-transparent px-2 text-sm text-ink outline-none placeholder:text-ink-placeholder"
              />
            </div>
          </div>

          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <EventComposerCalendarPill
              options={controller.calendarOptions()}
              value={controller.selectedCalendarOption()}
              onChange={(calendarId) =>
                controller.setField('calendarId', calendarId)
              }
              disabled={formIsDisabled()}
              readOnly={fieldIsReadOnly('calendar')}
            />
            <EventComposerRecurrencePill
              options={controller.recurrenceOptions()}
              value={controller.selectedRecurrenceOption()}
              onChange={controller.changeRecurrenceChoice}
              disabled={formIsDisabled()}
              // A single occurrence has no recurrence rule of its own, so the
              // recurrence cannot be edited while the scope is one event.
              readOnly={
                fieldIsReadOnly('recurrence') || editScope() === 'this_event'
              }
            />
            <EventComposerGuestsPill
              options={controller.guestOptions}
              selected={controller.selectedGuests()}
              onChange={controller.setSelectedGuests}
              disabled={formIsDisabled()}
              readOnly={fieldIsReadOnly('guests')}
            />
            <EventComposerConferencePill
              value={state().conference}
              canKeepExisting={
                controller.initialConferenceChoice() === 'existing'
              }
              onChange={(conference) =>
                controller.setField('conference', conference)
              }
              disabled={fieldIsDisabled('conference')}
            />
            <EventComposerLocationPill
              value={state().location}
              onChange={(location) => controller.setField('location', location)}
              disabled={fieldIsDisabled('location')}
            />
            <EventComposerRemindersPill
              minutes={controller.reminderMinutes()}
              usedSlots={
                controller.reminderMinutes().length +
                controller.preservedReminderCount()
              }
              canAdd={controller.canAddReminder()}
              onChange={controller.setReminderMinutes}
              disabled={fieldIsDisabled('reminders')}
            />
          </div>
        </div>

        <Show when={controller.recurrenceChoice() === 'custom'}>
          <Layer depth={3}>
            <div class="rounded-xl bg-surface p-4 text-ink">
              <RecurrenceBuilder
                value={controller.customConfig()}
                start={controller.startForRecurrence()}
                allDay={state().allDay}
                disabled={fieldIsDisabled('recurrence')}
                onChange={controller.setCustomConfig}
              />
            </div>
          </Layer>
        </Show>
      </div>

      <div
        class={cn(
          'flex shrink-0 items-center justify-end gap-3',
          props.hideFooter && 'hidden'
        )}
      >
        <Show when={props.showRecurringEditNotice}>
          <div
            role="radiogroup"
            aria-label={t('calendar.event.form.recurringEditScope')}
            class="mr-auto flex items-center gap-3 text-xs text-ink-muted"
          >
            <For each={RECURRING_EDIT_SCOPE_OPTIONS}>
              {(option) => (
                <label class="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="event-edit-scope"
                    checked={editScope() === option.scope}
                    onChange={() => setEditScope(option.scope)}
                    disabled={formIsDisabled()}
                  />
                  {t(option.labelKey)}
                </label>
              )}
            </For>
          </div>
        </Show>
        <Button
          type="button"
          variant="ghost"
          class="rounded-lg"
          disabled={formIsDisabled()}
          onClick={() => props.onCancel?.()}
        >
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          variant={controller.canSave() ? 'accent' : 'ghost'}
          depth={3}
          class="rounded-lg border-0"
          disabled={!controller.canSave() || formIsDisabled()}
          aria-label={
            isEdit() ? t('common.save') : t('calendar.event.form.create')
          }
        >
          <Show
            when={props.pending}
            fallback={
              isEdit() ? t('common.save') : t('calendar.event.form.create')
            }
          >
            <SpinnerIcon class="size-4 animate-spin" />
          </Show>
        </Button>
      </div>
    </form>
  );
}
