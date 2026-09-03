import { setLocale } from '@core/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatRelativeDay } from './dateParser';

const NOW = new Date('2025-06-14T14:15:00.000Z');

describe('date parser display formatting', () => {
  beforeEach(() => {
    process.env.TZ = 'UTC';
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    setLocale('en');
  });

  afterEach(() => {
    setLocale('en');
    vi.useRealTimers();
  });

  it('formats relative labels and suggested dates in English', () => {
    expect(formatRelativeDay(new Date('2025-06-15T12:00:00.000Z'))).toBe(
      'Tomorrow'
    );
    expect(formatRelativeDay(new Date('2025-06-12T12:00:00.000Z'))).toBe(
      '2 days ago'
    );
    expect(formatDate(new Date('2025-06-21T12:00:00.000Z'))).toContain('Jun');
  });

  it('reacts to the selected Russian locale', () => {
    setLocale('ru');

    expect(formatRelativeDay(new Date('2025-06-15T12:00:00.000Z'))).toBe(
      'Завтра'
    );
    expect(formatRelativeDay(new Date('2025-06-12T12:00:00.000Z'))).toBe(
      'Позавчера'
    );
    expect(formatDate(new Date('2025-06-21T12:00:00.000Z'))).toContain('июн.');
  });
});
