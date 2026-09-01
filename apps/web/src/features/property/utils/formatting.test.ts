import { setLocale } from '@core/i18n';
import { afterEach, describe, expect, it } from 'vitest';
import { formatDate } from './formatting';

describe('property date formatting', () => {
  afterEach(() => setLocale('en'));

  it('reacts to English and Russian locale selection', () => {
    const date = new Date('2025-01-02T12:00:00.000Z');

    setLocale('en');
    const english = formatDate(date);
    setLocale('ru');
    const russian = formatDate(date);

    expect(english).toContain('Jan');
    expect(russian).toContain('янв.');
    expect(russian).not.toBe(english);
  });
});
