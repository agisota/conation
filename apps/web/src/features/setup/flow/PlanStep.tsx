import {
  PLAN_FEATURES,
  PLANS,
  type PlanTier,
} from '@app/features/paywall/plans';
import { formatNumber, t } from '@app/lib/i18n';
import ArrowRight from '@phosphor/arrow-right.svg';
import Check from '@phosphor/check.svg';
import { Button } from '@ui';
import { Index } from 'solid-js';

const featureLabel = (label: string) => {
  if (label === 'AI Tool Calls') return t('setup.plan.features.aiToolCalls');
  if (label === 'AI Agent') return t('setup.plan.features.aiAgent');
  if (label === 'Storage') return t('setup.plan.features.storage');
  return label;
};

const featureValue = (label: string, tier: PlanTier, fallback: string) => {
  if (label === 'AI Tool Calls' && tier === 'premium') {
    return t('setup.plan.values.unlimited');
  }
  if (label === 'AI Agent' && tier === 'premium') {
    return t('setup.plan.values.allModels');
  }
  return fallback;
};

const INCLUDED_PLAN = PLANS.find((plan) => plan.tier === 'premium')!;

/** Final setup step for the free Conation distribution.
 *
 * Legacy checkout callbacks remain in the component contract so upstream
 * callers do not need a breaking interface change, but this surface never
 * starts checkout: the previously premium feature set is included for every
 * user.
 */
export function PlanStep(props: {
  finishing: boolean;
  onFree: (planSkipped: boolean) => void;
  onStartCheckout: (tier: Exclude<PlanTier, 'free'>) => void;
  onPremiumPaid: () => void;
}) {
  return (
    <div class="flex flex-col gap-6">
      <section class="flex flex-col gap-4 rounded-xl border border-ink/40 p-5 ring-1 ring-ink/20">
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold text-ink">Conation</span>
          <span class="flex size-5 items-center justify-center rounded-full bg-ink text-surface">
            <Check class="size-3" />
          </span>
        </div>
        <div class="flex items-baseline gap-1">
          <span class="text-2xl font-semibold tracking-tight text-ink">
            {formatNumber(0, {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0,
            })}
          </span>
          <span class="text-xs text-ink-muted">{t('setup.plan.forever')}</span>
        </div>
        <ul class="flex flex-col gap-2">
          <Index each={PLAN_FEATURES}>
            {(feature) => (
              <li class="flex items-center justify-between gap-2 text-xs">
                <span class="text-ink-muted">
                  {featureLabel(feature().label)}
                </span>
                <span class="text-ink font-medium">
                  {featureValue(
                    feature().label,
                    INCLUDED_PLAN.tier,
                    feature().values[INCLUDED_PLAN.tier]
                  )}
                </span>
              </li>
            )}
          </Index>
        </ul>
      </section>

      <div class="flex flex-col gap-3">
        <Button
          variant="cta"
          size="xl"
          disabled={props.finishing}
          onClick={() => props.onFree(false)}
        >
          {props.finishing
            ? t('setup.plan.settingUp')
            : t('setup.actions.continue')}
          <ArrowRight class="size-5" />
        </Button>
      </div>
    </div>
  );
}
