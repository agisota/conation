import { setLocale } from '@core/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeDate } from './time';

const NOW = new Date('2025-06-14T14:15:00.000Z');

describe('formatRelativeDate', () => {
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

  it('formats relative dates in English', () => {
    expect(formatRelativeDate(NOW)).toBe('Today');
    expect(formatRelativeDate('2025-06-12T15:30:00.000Z')).toBe('Thursday');
    expect(formatRelativeDate('2025-05-05T12:00:00.000Z')).toBe('May 5');
  });

  it('reacts to the selected Russian locale', () => {
    setLocale('ru');

    expect(formatRelativeDate(NOW)).toBe('Сегодня');
    expect(formatRelativeDate('2025-06-12T15:30:00.000Z')).toBe('четверг');
    expect(formatRelativeDate('2025-05-05T12:00:00.000Z')).toBe('5 мая');
  });
});
