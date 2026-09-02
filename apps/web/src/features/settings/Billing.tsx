import { t } from '@app/lib/i18n';
import CheckIcon from '@phosphor/check.svg';
import EnvelopeIcon from '@phosphor/envelope.svg';
import { Layer } from '@ui';
import { For } from 'solid-js';
import { SettingsCard, SettingsPage, SettingsSection } from './primitives';

const INCLUDED_FEATURES = [
  'settings.billing.access.features.workspace',
  'settings.billing.access.features.collaboration',
  'settings.billing.access.features.ai',
  'settings.billing.access.features.integrations',
] as const;

const IncludedFeatures = () => (
  <For each={INCLUDED_FEATURES}>
    {(label) => (
      <li class="flex items-center gap-2">
        <CheckIcon class="size-3 text-success" />
        <span class="text-ink-muted text-xs">{t(label)}</span>
      </li>
    )}
  </For>
);

/**
 * Stable settings route retained from the former billing page. Conation has no
 * product purchase flow; this page explains free access without a Stripe action.
 */
export const Billing = () => {
  return (
    <SettingsPage
      title={t('settings.billing.title')}
      description={
        <>
          {t('settings.billing.support.prefix')}{' '}
          <a
            class="text-link hover:text-link-hover visited:text-link-visited inline-flex items-center"
            href="mailto:pythia@conation.dev"
          >
            {t('settings.billing.support.action')}
            <EnvelopeIcon class="size-4 inline mx-1" />
          </a>
        </>
      }
    >
      <SettingsSection>
        <SettingsCard>
          <section class="flex flex-col gap-4 p-4">
            <header class="flex items-center gap-2">
              <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2">
                  <h2 class="text-lg font-medium text-ink">
                    {t('settings.billing.access.title')}
                  </h2>

                  <Layer depth={3}>
                    <span class="text-xs text-ink-muted px-1.5 py-0.25 border border-edge-muted rounded-md bg-active">
                      {t('settings.billing.current')}
                    </span>
                  </Layer>
                </div>
                <p class="text-ink-extra-muted text-xs">
                  {t('settings.billing.access.description')}
                </p>
              </div>
            </header>
            <ul class="border-t border-t-edge-muted pt-4 flex flex-wrap gap-4 text-sm text-ink-muted">
              <IncludedFeatures />
            </ul>
          </section>
        </SettingsCard>
      </SettingsSection>
    </SettingsPage>
  );
};
