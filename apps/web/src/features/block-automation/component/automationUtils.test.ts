import { setLocale } from '@app/lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyDraft,
  describeSchedule,
  formatDateTime,
  weekdayLabel,
} from './automationUtils';

vi.mock('@core/component/AI/constant', () => ({
  DEFAULT_MODEL: 'test-model',
}));
vi.mock('@core/constant/allBlocks', () => ({
  blockNameToDefaultFile: () => 'Untitled automation',
}));

describe('localized automation schedule copy', () => {
  afterEach(() => setLocale('en'));

  it('uses the selected locale for schedule labels, weekdays, and time', () => {
    const draft = {
      ...createEmptyDraft(),
      time: '09:00',
      daysOfWeek: ['2', '3', '4', '5', '6'],
    };

    setLocale('ru');
    const time = new Intl.DateTimeFormat('ru-RU', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(2026, 0, 1, 9, 0));

    expect(describeSchedule(draft, 'Europe/Berlin')).toBe(
      `По будням, ${time} (Europe/Berlin)`
    );
    expect(weekdayLabel('2')).toBe(
      new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(
        new Date(2026, 0, 5)
      )
    );
  });

  it('updates existing date formatting after a runtime locale switch', () => {
    const value = '2026-09-01T13:05:00.000Z';

    setLocale('en');
    const english = formatDateTime(value);
    setLocale('ru');
    const russian = formatDateTime(value);

    expect(english).not.toBe(russian);
    expect(russian).toContain('2026');
  });
});
