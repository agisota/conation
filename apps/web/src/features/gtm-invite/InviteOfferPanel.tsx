import { PLAN_FEATURES, PLANS } from '@app/features/paywall/plans';
import { SkipButton } from '@app/features/setup/flow/shared';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import ArrowRight from '@phosphor/arrow-right.svg';
import Check from '@phosphor/check.svg';
import type { GtmInviteOffer } from '@service-auth/generated/schemas/gtmInviteOffer';
import { Button } from '@ui';
import { Index, onMount } from 'solid-js';
import { formatFreeMonths } from './core/invite-link';

const PREMIUM = PLANS[1];
const FEATURE_LABELS: Record<string, string> = {
  'AI Tool Calls': 'Запросы к ИИ',
  'AI Agent': 'ИИ-агент',
  Storage: 'Хранилище',
};
const FEATURE_VALUES: Record<string, string> = {
  Unlimited: 'Без ограничений',
  'All models': 'Все модели',
};

/**
 * Replaces the free/paid plan picker for an account that signed up through a
 * GTM invite link: Premium's first month is free, checkout still collects a
 * card, and the promotion is applied server-side when the session is created.
 */
export function InviteOfferPanel(props: {
  offer: GtmInviteOffer;
  finishing: boolean;
  onStartCheckout: () => void;
  onContinueFree: () => void;
}) {
  const analytics = useAnalytics();

  onMount(() => {
    analytics.track('gtm_invite_offer_viewed', {
      link_id: props.offer.linkId,
      promo_code: props.offer.promoCode,
    });
  });

  const freeMonths = () => props.offer.freeMonths;
  const freePeriod = () =>
    freeMonths() === 1 ? 'первый месяц' : `первые ${freeMonths()} мес.`;

  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent/5 p-4">
        <div class="flex items-center justify-between gap-3">
          <span class="text-[15px] font-semibold text-ink">{PREMIUM.name}</span>
          <span class="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-contrast">
            {formatFreeMonths(freeMonths())}
          </span>
        </div>
        <div class="flex flex-col gap-1">
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-semibold tracking-tight text-ink">
              $0
            </span>
            <span class="text-[15px] text-ink-muted">за {freePeriod()}</span>
          </div>
          <span class="text-[15px] text-ink-muted">
            затем ${PREMIUM.price} за пользователя в месяц
          </span>
        </div>
        <ul class="flex flex-col gap-2">
          <Index each={PLAN_FEATURES}>
            {(feature) => (
              <li class="flex items-center justify-between gap-2 text-[15px]">
                <span class="flex items-center gap-1.5 text-ink-muted">
                  <Check class="size-3 text-accent" />
                  {FEATURE_LABELS[feature().label] ?? feature().label}
                </span>
                <span class="font-medium text-ink">
                  {FEATURE_VALUES[feature().values.premium] ??
                    feature().values.premium}
                </span>
              </li>
            )}
          </Index>
        </ul>
      </div>

      <p class="text-[15px] leading-relaxed text-ink-muted">
        Для оплаты потребуется добавить карту. Подписка продолжится после
        периода бесплатно, но до этого момента списаний не будет. Вы можете
        отменить её в любое время до окончания пробного периода.
      </p>

      <div class="flex flex-col gap-3">
        <Button
          variant="cta"
          size="xl"
          disabled={props.finishing}
          onClick={() => props.onStartCheckout()}
        >
          {props.finishing ? 'Переход к оплате…' : 'Активировать бесплатно'}
          <ArrowRight class="size-5" />
        </Button>
        <SkipButton
          label="Продолжить с бесплатным планом"
          disabled={props.finishing}
          onClick={() => props.onContinueFree()}
        />
      </div>
    </div>
  );
}
