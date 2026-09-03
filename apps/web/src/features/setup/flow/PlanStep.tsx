import { t } from '@app/lib/i18n';
import ArrowRight from '@phosphor/arrow-right.svg';
import Check from '@phosphor/check.svg';
import { Button } from '@ui';
import { For } from 'solid-js';

const INCLUDED_FEATURES = [
  'setup.plan.features.aiToolCalls',
  'setup.plan.features.aiAgent',
  'setup.plan.features.storage',
] as const;

/** Final setup step for the free Conation distribution.
 *
 * The Conation distribution has one included-access path. This component
 * deliberately owns no checkout callback or pricing tier.
 */
export function PlanStep(props: {
  finishing: boolean;
  onContinue: () => void;
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
        <p class="text-xs text-ink-muted">{t('setup.plan.forever')}</p>
        <ul class="flex flex-col gap-2">
          <For each={INCLUDED_FEATURES}>
            {(feature) => (
              <li class="flex items-center gap-2 text-xs text-ink-muted">
                <Check class="size-3 text-success" />
                {t(feature)}
              </li>
            )}
          </For>
        </ul>
      </section>

      <div class="flex flex-col gap-3">
        <Button
          variant="cta"
          size="xl"
          disabled={props.finishing}
          onClick={props.onContinue}
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
