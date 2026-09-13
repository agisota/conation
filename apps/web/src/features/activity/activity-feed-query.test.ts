import { describe, expect, it } from 'vitest';
import {
  eventLocalDate,
  filterActivityEvents,
  sortActivityEvents,
  toggleActivityCategory,
} from './activity-feed-query';

const created = {
  occurredAt: '2026-09-13T04:00:00.000Z',
  action: { __typename: 'GraphqlActivityCreated' },
};
const edited = {
  occurredAt: '2026-09-13T18:00:00.000Z',
  action: { __typename: 'GraphqlActivityEdited' },
};
const opened = {
  occurredAt: '2026-09-12T22:30:00.000Z',
  action: { __typename: 'GraphqlActivityOpened' },
};

describe('eventLocalDate', () => {
  it('buckets the same UTC instant onto different local dates by zone', () => {
    expect(eventLocalDate(opened.occurredAt, 'UTC')).toBe('2026-09-12');
    expect(eventLocalDate(opened.occurredAt, 'America/Havana')).toBe(
      '2026-09-12'
    );
    expect(eventLocalDate(opened.occurredAt, 'Europe/Moscow')).toBe(
      '2026-09-13'
    );
  });

  it('returns empty for an unparsable timestamp', () => {
    expect(eventLocalDate('not-a-date', 'UTC')).toBe('');
  });
});

describe('filterActivityEvents', () => {
  it('keeps every event when no day or category is selected', () => {
    expect(
      filterActivityEvents([created, edited, opened], {
        selectedDate: null,
        timeZone: 'UTC',
        categories: new Set(),
      })
    ).toEqual([created, edited, opened]);
  });

  it('keeps only the heatmap day in the viewer time zone', () => {
    expect(
      filterActivityEvents([created, edited, opened], {
        selectedDate: '2026-09-13',
        timeZone: 'UTC',
        categories: new Set(),
      }).map((event) => event.action.__typename)
    ).toEqual(['GraphqlActivityCreated', 'GraphqlActivityEdited']);

    expect(
      filterActivityEvents([created, edited, opened], {
        selectedDate: '2026-09-13',
        timeZone: 'Europe/Moscow',
        categories: new Set(),
      }).map((event) => event.action.__typename)
    ).toEqual([
      'GraphqlActivityCreated',
      'GraphqlActivityEdited',
      'GraphqlActivityOpened',
    ]);
  });

  it('intersects the selected day with category chips', () => {
    expect(
      filterActivityEvents([created, edited, opened], {
        selectedDate: '2026-09-13',
        timeZone: 'UTC',
        categories: new Set(['GraphqlActivityEdited']),
      })
    ).toEqual([edited]);
  });
});

describe('sortActivityEvents', () => {
  it('orders newest first by default and oldest on request', () => {
    const events = [opened, created, edited];
    expect(
      sortActivityEvents(events, 'newest').map((event) => event.occurredAt)
    ).toEqual([edited.occurredAt, created.occurredAt, opened.occurredAt]);
    expect(
      sortActivityEvents(events, 'oldest').map((event) => event.occurredAt)
    ).toEqual([opened.occurredAt, created.occurredAt, edited.occurredAt]);
  });
});

describe('toggleActivityCategory', () => {
  it('adds then removes the same category', () => {
    const added = toggleActivityCategory(new Set(), 'GraphqlActivityCreated');
    expect([...added]).toEqual(['GraphqlActivityCreated']);
    expect([
      ...toggleActivityCategory(added, 'GraphqlActivityCreated'),
    ]).toEqual([]);
  });
});
