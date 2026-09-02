import type { PlanTier } from '@app/features/paywall/plans';
import { t } from '@app/lib/i18n';
import { useHasPaidAccess } from '@core/auth';
import { PERMISSION_IDS } from '@core/constant/permissions';
import { usePermissions, useUserId } from '@core/context/user';
import CheckIcon from '@phosphor/check.svg';
import EnvelopeIcon from '@phosphor/envelope.svg';
import { useCurrentTeamQuery } from '@queries/team/teams';
import { stripeServiceClient } from '@service-stripe/client';
import { Button, Layer } from '@ui';
import { createMemo, For, Match, Show, Switch } from 'solid-js';
import { SettingsCard, SettingsPage, SettingsSection } from './primitives';

const BILLING_PLAN_FEATURES: Record<PlanTier, string[]> = {
  free: [
    'settings.billing.features.haiku',
    'settings.billing.features.mcp',
    'settings.billing.features.storage5Gb',
  ],
  premium: [
    'settings.billing.features.allAgents',
    'settings.billing.features.allModels',
    'settings.billing.features.noWatermark',
    'settings.billing.features.aiProjections',
    'settings.billing.features.multipleInboxes',
    'settings.billing.features.calls',
    'settings.billing.features.teams',
    'settings.billing.features.storage1Tb',
  ],
};

const PlanFeatures = (props: { tier: PlanTier }) => (
  <For each={BILLING_PLAN_FEATURES[props.tier]}>
    {(label) => (
      <li class="flex items-center gap-2">
        <CheckIcon class="size-3 text-success" />
        <span class="text-ink-muted text-xs">{t(label)}</span>
      </li>
    )}
  </For>
);

export const Billing = () => {
  const permissions = usePermissions();
  const hasPaid = useHasPaidAccess();

  const userId = useUserId();

  const team = useCurrentTeamQuery();

  const canManageSubscription = createMemo(() => {
    return permissions()?.includes(PERMISSION_IDS.WRITE_STRIPE_SUBSCRIPTION);
  });

  const userTeam = createMemo(() => {
    const currentTeam = team.data;
    const uid = userId();
    if (!currentTeam || !uid) return;

    return currentTeam.team;
  });

  const teamRole = createMemo(() => {
    const uid = userId();
    const team = userTeam();

    if (!team) return;

    return team.owner_id === uid ? 'owner' : 'member';
  });

  const handleManage = async () => {
    try {
      const url = await stripeServiceClient.createPortalSession();
      window.location.href = url;
    } catch (error) {
      console.error(error);
    }
  };

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
                  <h2 class="text-lg font-medium text-ink">Conation</h2>

                  <Layer depth={3}>
                    <span class="text-xs text-ink-muted px-1.5 py-0.25 border border-edge-muted rounded-md bg-active">
                      {t('settings.billing.current')}
                    </span>
                  </Layer>
                </div>
                <Switch>
                  <Match when={teamRole() === 'member'}>
                    <p class="text-ink-extra-muted text-xs">
                      {t('settings.billing.managedByOwner')}
                    </p>
                  </Match>
                  <Match
                    when={hasPaid() && teamRole() === 'owner' && team.data}
                  >
                    {(team) => (
                      <p class="text-ink-extra-muted text-xs">
                        {t('settings.billing.teamPrice', {
                          count: team().members.length,
                        })}
                      </p>
                    )}
                  </Match>
                </Switch>
              </div>

              <Show
                when={
                  canManageSubscription() &&
                  hasPaid() &&
                  (!teamRole() || teamRole() === 'owner')
                }
              >
                <Button
                  class="ml-auto rounded-full bg-active"
                  size="sm"
                  depth={2}
                  variant="outline"
                  onClick={handleManage}
                >
                  {t('settings.billing.actions.manage')}
                </Button>
              </Show>
            </header>
            <ul class="border-t border-t-edge-muted pt-4 flex flex-wrap gap-4 text-sm text-ink-muted">
              <PlanFeatures tier="premium" />
            </ul>
          </section>
        </SettingsCard>
      </SettingsSection>
    </SettingsPage>
  );
};
