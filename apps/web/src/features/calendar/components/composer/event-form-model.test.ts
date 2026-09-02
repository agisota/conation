import { describe, expect, it } from 'vitest';
import {
  defaultEditorInitialValues,
  type EventEditorInitialValues,
  eventHasEnded,
  initialGuestOptions,
} from './event-form-model';

const NOW = new Date('2026-08-25T12:00:00');

function values(
  overrides: Partial<EventEditorInitialValues>
): EventEditorInitialValues {
  return { ...defaultEditorInitialValues(NOW), ...overrides };
}

describe('eventHasEnded', () => {
  it('treats a finished timed range as past', () => {
    expect(
      eventHasEnded(
        values({ start: '2026-08-25T09:00', end: '2026-08-25T10:00' }),
        NOW
      )
    ).toBe(true);
  });

  it('does not flag a range that is still running', () => {
    expect(
      eventHasEnded(
        values({ start: '2026-08-25T11:30', end: '2026-08-25T12:30' }),
        NOW
      )
    ).toBe(false);
  });

  it('does not flag a range that has not started', () => {
    expect(
      eventHasEnded(
        values({ start: '2026-08-26T09:00', end: '2026-08-26T10:00' }),
        NOW
      )
    ).toBe(false);
  });

  it('keeps an all-day event current until its last day is over', () => {
    const today = values({
      allDay: true,
      start: '2026-08-25',
      end: '2026-08-25',
    });
    expect(eventHasEnded(today, NOW)).toBe(false);
    expect(eventHasEnded({ ...today, end: '2026-08-24' }, NOW)).toBe(true);
  });

  it('reports nothing while the range is unparseable', () => {
    expect(eventHasEnded(values({ start: '', end: '' }), NOW)).toBe(false);
    expect(
      eventHasEnded(values({ allDay: true, start: '', end: '' }), NOW)
    ).toBe(false);
  });
});

describe('initialGuestOptions', () => {
  it('uses the canonical Conation user-id namespace for typed guest emails', () => {
    const [guest] = initialGuestOptions('person@example.com', []);

    expect(guest).toMatchObject({
      kind: 'custom',
      id: 'conation|person@example.com',
      data: {
        id: 'conation|person@example.com',
        email: 'person@example.com',
        invalid: false,
      },
    });
  });

  it('does not manufacture a user id for malformed guest input', () => {
    const [guest] = initialGuestOptions('not-an-email', []);

    expect(guest).toMatchObject({
      kind: 'custom',
      id: 'not-an-email',
      data: { invalid: true },
    });
  });
});
