import { setLocale, t } from '@app/lib/i18n';
import { format } from 'date-fns';
import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type CreateCalendarEventFormControllerOptions,
  createCalendarEventFormController,
} from './create-calendar-event-form-controller';
import {
  defaultEditorInitialValues,
  type EventEditorInitialValues,
  type SelectedEventEditorGuest,
} from './event-form-model';

const DATETIME_VALUE = "yyyy-MM-dd'T'HH:mm";
const HOUR_MS = 60 * 60 * 1000;

/** A timed range offset from now, in hours, running for one hour. */
function timedRange(startHoursFromNow: number) {
  const start = new Date(Date.now() + startHoursFromNow * HOUR_MS);
  return {
    start: format(start, DATETIME_VALUE),
    end: format(new Date(start.getTime() + HOUR_MS), DATETIME_VALUE),
  };
}

function guest(email: string): SelectedEventEditorGuest {
  return {
    kind: 'custom',
    id: `conation|${email}`,
    data: { id: `conation|${email}`, email, invalid: false },
  };
}

const disposers: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  setLocale('en');
});

/**
 * Builds a controller outside any batch, so later edits reach its memos the way
 * a user's edits do.
 */
function controllerFor(
  initialValue: Partial<EventEditorInitialValues>,
  options?: Pick<CreateCalendarEventFormControllerOptions, 'isEdit'>
) {
  return createRoot((dispose) => {
    disposers.push(dispose);
    return createCalendarEventFormController({
      initialValue: { ...defaultEditorInitialValues(), ...initialValue },
      calendarOptions: () => [
        { id: 'calendar-1', label: 'Calendar', color: '#000000' },
      ],
      guestOptions: () => [],
      ...options,
    });
  });
}

describe('pastEventWarning', () => {
  it('warns when a new event with guests already ended', () => {
    const controller = controllerFor({
      ...timedRange(-3),
      title: 'Retro',
      guests: 'guest@example.com',
    });
    expect(controller.pastEventWarning()).toBe(
      t('calendar.event.form.pastEventGuestsWarning')
    );
  });

  it('warns once a guest is added to a past event', () => {
    const controller = controllerFor(timedRange(-3));
    expect(controller.pastEventWarning()).toBeUndefined();

    controller.setSelectedGuests([guest('guest@example.com')]);
    expect(controller.pastEventWarning()).toBe(
      t('calendar.event.form.pastEventGuestsWarning')
    );
  });

  it('stays quiet for an upcoming event with guests', () => {
    const controller = controllerFor({
      ...timedRange(3),
      guests: 'guest@example.com',
    });
    expect(controller.pastEventWarning()).toBeUndefined();
  });

  it('stays quiet for a past event nobody is invited to', () => {
    expect(controllerFor(timedRange(-3)).pastEventWarning()).toBeUndefined();
  });

  it('stays quiet while the event is still running', () => {
    const controller = controllerFor({
      start: format(new Date(Date.now() - HOUR_MS / 2), DATETIME_VALUE),
      end: format(new Date(Date.now() + HOUR_MS), DATETIME_VALUE),
      guests: 'guest@example.com',
    });
    expect(controller.pastEventWarning()).toBeUndefined();
  });

  it('stays quiet when a finished event is edited without re-inviting', () => {
    const controller = controllerFor(
      { ...timedRange(-3), guests: 'guest@example.com' },
      { isEdit: true }
    );
    controller.setField('title', 'Retro notes');
    expect(controller.pastEventWarning()).toBeUndefined();
  });

  it('warns when a guest joins a finished event that is being edited', () => {
    const controller = controllerFor(
      { ...timedRange(-3), guests: 'guest@example.com' },
      { isEdit: true }
    );
    controller.setSelectedGuests([
      guest('guest@example.com'),
      guest('late@example.com'),
    ]);
    expect(controller.pastEventWarning()).toBe(
      t('calendar.event.form.pastEventGuestsWarning')
    );
  });

  it('warns when an event with guests is moved into the past', () => {
    const controller = controllerFor(
      { ...timedRange(3), guests: 'guest@example.com' },
      { isEdit: true }
    );
    const past = timedRange(-3);
    controller.setStart(past.start);
    controller.setField('end', past.end);
    expect(controller.pastEventWarning()).toBe(
      t('calendar.event.form.pastEventGuestsWarning')
    );
  });

  it('warns for an all-day event on a day that has passed', () => {
    const yesterday = format(new Date(Date.now() - 24 * HOUR_MS), 'yyyy-MM-dd');
    const today = format(new Date(), 'yyyy-MM-dd');
    const past = controllerFor({
      allDay: true,
      start: yesterday,
      end: yesterday,
      guests: 'guest@example.com',
    });
    expect(past.pastEventWarning()).toBe(
      t('calendar.event.form.pastEventGuestsWarning')
    );

    const ongoing = controllerFor({
      allDay: true,
      start: today,
      end: today,
      guests: 'guest@example.com',
    });
    expect(ongoing.pastEventWarning()).toBeUndefined();
  });

  it('updates warning copy when the locale changes without recreating the controller', () => {
    const controller = controllerFor({
      ...timedRange(-3),
      title: 'Retro',
      guests: 'guest@example.com',
    });

    setLocale('en');
    const englishWarning = controller.pastEventWarning();
    setLocale('ru');

    expect(controller.pastEventWarning()).toBe(
      t('calendar.event.form.pastEventGuestsWarning')
    );
    expect(controller.pastEventWarning()).not.toBe(englishWarning);
  });
});
