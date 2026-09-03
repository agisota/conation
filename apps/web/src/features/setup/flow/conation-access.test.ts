import en from '@app/lib/i18n/locales/en.json';
import ru from '@app/lib/i18n/locales/ru.json';
import { describe, expect, it } from 'vitest';
import { getEmailConnectSlotKinds } from './emailConnectSlots';

describe('Conation included access onboarding', () => {
  it('keeps another Gmail connection available after the first two inboxes', () => {
    expect(getEmailConnectSlotKinds(0)).toEqual(['primary', 'secondary']);
    expect(getEmailConnectSlotKinds(2)).toEqual(['another']);
    expect(getEmailConnectSlotKinds(12)).toEqual(['another']);
  });

  it('does not present a paid plan choice or a referral cash reward', () => {
    expect(en['setup.plan.title']).toBe('Included access');
    expect(ru['setup.plan.title']).toBe('Доступ включён');
    expect(en['setup.plan.subtitle']).toContain('no plan selection or payment');
    expect(ru['setup.plan.subtitle']).toContain(
      'выбирать тариф и платить не нужно'
    );

    expect(en['invitations.referral.description']).not.toMatch(
      /\$100|credits/i
    );
    expect(ru['invitations.referral.description']).not.toMatch(
      /100\s+доллар|на баланс/i
    );
  });
});
