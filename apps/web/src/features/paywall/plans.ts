import { t } from '@app/lib/i18n';

export type PlanTier = 'free' | 'premium';
export type Plan = {
  tier: PlanTier;
  name: string;
  price: number;
  highlighted: boolean;
};
/** Tiers that correspond to real Stripe products. Excludes 'free'. */
export type PaidPlanTier = Exclude<PlanTier, 'free'>;

export const PLANS = [
  {
    tier: 'free' as const,
    get name() {
      return t('shell.paywall.plan.free');
    },
    price: 0,
    highlighted: false,
  },
  {
    tier: 'premium' as const,
    get name() {
      return t('shell.paywall.plan.premium');
    },
    price: 40,
    highlighted: true,
  },
] as const satisfies Plan[];

interface PlanFeature {
  label: string;
  values: Record<PlanTier, string>;
}

export const PLAN_FEATURES: PlanFeature[] = [
  {
    get label() {
      return t('shell.paywall.plan.aiToolCalls');
    },
    values: {
      free: '—',
      get premium() {
        return t('shell.paywall.plan.unlimited');
      },
    },
  },
  {
    get label() {
      return t('shell.paywall.plan.aiAgent');
    },
    values: {
      free: 'Haiku',
      get premium() {
        return t('shell.paywall.features.allModels');
      },
    },
  },
  {
    get label() {
      return t('shell.paywall.plan.storage');
    },
    values: {
      free: '5 GB',
      premium: '1 TB',
    },
  },
];
