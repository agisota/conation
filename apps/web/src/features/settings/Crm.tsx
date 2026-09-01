/** CRM settings tab: team admins enable or disable the CRM here. */

import { t } from '@app/lib/i18n';
import { toast } from '@core/component/Toast/Toast';
import { SERVER_HOSTS } from '@core/constant/servers';
import { throwOnErr } from '@core/util/result';
import SpinnerIcon from '@phosphor/spinner.svg';
import XIcon from '@phosphor/x.svg';
import {
  invalidateUserTeams,
  useCurrentTeamQuery,
  useIsTeamAdmin,
} from '@queries/team/teams';
import { fetchWithAuth } from '@service-auth/fetch';
import type { PatchTeamCrmSettingsRequest } from '@service-auth/generated/schemas/patchTeamCrmSettingsRequest';
import type { PatchTeamCrmSettingsResponse } from '@service-auth/generated/schemas/patchTeamCrmSettingsResponse';
import { useMutation } from '@tanstack/solid-query';
import { Button, Dialog, Panel, Tooltip } from '@ui';
import { createSignal, type JSX, Show, Suspense } from 'solid-js';
import {
  SettingsCard,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from './primitives';

const authHost = SERVER_HOSTS['auth-service'];

/* ------------------------------------------------------------------ */
/* Shared bits                                                        */
/* ------------------------------------------------------------------ */

/** Confirm dialog matching the Team tab's destructive-action dialogs. */
function ConfirmDialog(props: {
  open: boolean;
  title: string;
  confirmLabel: string;
  pending?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children: JSX.Element;
}) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <Panel depth={2} class="max-h-[75vh] text-ink rounded-xl">
        <Panel.Header class="px-2 gap-1">
          <Dialog.CloseButton as={Button} variant="ghost" size="icon-sm">
            <XIcon />
          </Dialog.CloseButton>
          <Dialog.Title as="span" class="text-sm font-medium p-0 m-0">
            {props.title}
          </Dialog.Title>
        </Panel.Header>
        <Panel.Body class="p-3 flex flex-col gap-3">
          {props.children}
          <div class="flex justify-end gap-1 pt-2">
            <Button
              variant="ghost"
              class="rounded-xs"
              disabled={props.pending}
              onClick={props.onClose}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              class="rounded-xs"
              disabled={props.pending || props.confirmDisabled}
              onClick={props.onConfirm}
            >
              <Show when={props.pending} fallback={props.confirmLabel}>
                <SpinnerIcon class="size-4 animate-spin" />
              </Show>
            </Button>
          </div>
        </Panel.Body>
      </Panel>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* CRM enablement                                                     */
/* ------------------------------------------------------------------ */

/**
 * PATCH /team/crm on the auth service. The generated orval client
 * (`patchTeamCrmSettings`) issues a bare relative `fetch` with no auth, so we
 * go through `fetchWithAuth` against the auth host like `authServiceClient`.
 */
function usePatchTeamCrmSettingsMutation() {
  return useMutation(() => ({
    mutationFn: async (req: PatchTeamCrmSettingsRequest) =>
      await throwOnErr(() =>
        fetchWithAuth<PatchTeamCrmSettingsResponse>(`${authHost}/team/crm`, {
          method: 'PATCH',
          body: JSON.stringify(req),
        })
      ),
    onSuccess: (data: PatchTeamCrmSettingsResponse) => {
      invalidateUserTeams();
      toast.success(
        data.enabled
          ? t('settings.crm.toast.enabled')
          : t('settings.crm.toast.disabled')
      );
    },
    onError: (error: Error) => {
      console.error('Failed to update CRM settings', error);
      toast.failure(t('settings.crm.toast.updateFailed'));
    },
  }));
}

const disableCrmPhrase = () => t('settings.crm.disable.confirmPhrase');

function CrmEnablementSection() {
  const isTeamAdmin = useIsTeamAdmin();
  const teamQuery = useCurrentTeamQuery();
  const patchCrmMutation = usePatchTeamCrmSettingsMutation();

  // The mutation invalidates the team query on success, which refetches
  // the authoritative flag.
  const crmEnabled = () => teamQuery.data?.team.crm_enabled ?? false;
  const [showEnableModal, setShowEnableModal] = createSignal(false);
  const [enableChoice, setEnableChoice] = createSignal<'backfill' | 'fresh'>();
  const [showDisableModal, setShowDisableModal] = createSignal(false);
  const [disableConfirmation, setDisableConfirmation] = createSignal('');

  const handleToggle = (next: boolean) => {
    if (!isTeamAdmin() || patchCrmMutation.isPending) return;
    if (next) {
      // Enabling asks whether to backfill from existing email history.
      setShowEnableModal(true);
    } else {
      // Disabling purges the team's CRM data — force a typed confirmation.
      setDisableConfirmation('');
      setShowDisableModal(true);
    }
  };

  const handleEnable = (backfill: boolean) => {
    setEnableChoice(backfill ? 'backfill' : 'fresh');
    patchCrmMutation.mutate(
      { enabled: true, backfill },
      {
        onSuccess: () => setShowEnableModal(false),
        onSettled: () => setEnableChoice(undefined),
      }
    );
  };

  const handleDisable = () => {
    patchCrmMutation.mutate(
      { enabled: false, backfill: false },
      {
        onSuccess: () => setShowDisableModal(false),
      }
    );
  };

  return (
    <SettingsSection title={t('settings.crm.general.title')}>
      <SettingsCard>
        <SettingsRow
          label={
            crmEnabled()
              ? t('settings.crm.actions.disable')
              : t('settings.crm.actions.enable')
          }
          description={t('settings.crm.toggleDescription', {
            state: crmEnabled() ? 'off' : 'on',
          })}
          hideDescriptionOnMobile
        >
          <Show
            when={isTeamAdmin()}
            fallback={
              <Tooltip label={t('settings.crm.adminOnly.tooltip')}>
                <span>
                  <Button
                    variant="outline"
                    size="sm"
                    class="rounded-xs"
                    disabled
                  >
                    {t('settings.crm.adminOnly.action')}
                  </Button>
                </span>
              </Tooltip>
            }
          >
            <div class="flex items-center gap-2">
              <Show when={patchCrmMutation.isPending}>
                <SpinnerIcon class="size-4 animate-spin text-ink-muted" />
              </Show>
              <Button
                variant={crmEnabled() ? 'danger' : 'accent'}
                size="sm"
                class="rounded-xs"
                disabled={patchCrmMutation.isPending}
                onClick={() => handleToggle(!crmEnabled())}
              >
                {crmEnabled()
                  ? t('settings.crm.actions.disable')
                  : t('settings.crm.actions.enable')}
              </Button>
            </div>
          </Show>
        </SettingsRow>
      </SettingsCard>

      <Dialog
        open={showEnableModal()}
        onOpenChange={(open) => !open && setShowEnableModal(false)}
      >
        <Panel depth={2} class="max-h-[75vh] text-ink rounded-xl">
          <Panel.Header class="px-2 gap-1">
            <Dialog.CloseButton as={Button} variant="ghost" size="icon-sm">
              <XIcon />
            </Dialog.CloseButton>
            <Dialog.Title as="span" class="text-sm font-medium p-0 m-0">
              {t('settings.crm.enable.title')}
            </Dialog.Title>
          </Panel.Header>
          <Panel.Body class="p-3 flex flex-col gap-3">
            <p>{t('settings.crm.enable.description')}</p>
            <div class="flex justify-end gap-1 pt-2">
              <Button
                variant="ghost"
                class="rounded-xs"
                disabled={patchCrmMutation.isPending}
                onClick={() => setShowEnableModal(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="outline"
                class="rounded-xs"
                disabled={patchCrmMutation.isPending}
                onClick={() => handleEnable(false)}
              >
                <Show
                  when={
                    enableChoice() === 'fresh' && patchCrmMutation.isPending
                  }
                  fallback={t('settings.crm.enable.startFresh')}
                >
                  <SpinnerIcon class="size-4 animate-spin" />
                </Show>
              </Button>
              <Button
                variant="accent"
                class="rounded-xs"
                disabled={patchCrmMutation.isPending}
                onClick={() => handleEnable(true)}
              >
                <Show
                  when={
                    enableChoice() === 'backfill' && patchCrmMutation.isPending
                  }
                  fallback={t('settings.crm.enable.backfill')}
                >
                  <SpinnerIcon class="size-4 animate-spin" />
                </Show>
              </Button>
            </div>
          </Panel.Body>
        </Panel>
      </Dialog>

      <ConfirmDialog
        open={showDisableModal()}
        title={t('settings.crm.disable.title')}
        confirmLabel={t('settings.crm.actions.disable')}
        pending={patchCrmMutation.isPending}
        confirmDisabled={disableConfirmation() !== disableCrmPhrase()}
        onConfirm={handleDisable}
        onClose={() => setShowDisableModal(false)}
      >
        <p>{t('settings.crm.disable.description')}</p>
        <p class="text-sm text-ink-muted">
          {t('settings.crm.disable.confirmPrompt', {
            phrase: disableCrmPhrase(),
          })}
        </p>
        <input
          type="text"
          value={disableConfirmation()}
          onInput={(e) => setDisableConfirmation(e.currentTarget.value)}
          placeholder={disableCrmPhrase()}
          class="settings-input w-full"
        />
      </ConfirmDialog>
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

function NoTeamState() {
  return (
    <SettingsPage title={t('settings.crm.title')}>
      <SettingsSection>
        <SettingsCard>
          <div class="px-6 py-8 text-center text-sm text-ink-muted">
            {t('settings.crm.noTeam')}
          </div>
        </SettingsCard>
      </SettingsSection>
    </SettingsPage>
  );
}

function CrmContent() {
  const teamQuery = useCurrentTeamQuery();

  return (
    <Show when={teamQuery.data} fallback={<NoTeamState />}>
      <SettingsPage
        title={t('settings.crm.title')}
        description={t('settings.crm.description')}
      >
        <CrmEnablementSection />
      </SettingsPage>
    </Show>
  );
}

export function Crm() {
  return (
    <Suspense
      fallback={<div class="animate-pulse bg-skeleton rounded h-4 w-32 m-6" />}
    >
      <CrmContent />
    </Suspense>
  );
}
