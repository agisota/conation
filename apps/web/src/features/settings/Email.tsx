import {
  TurnOffCalendarDialog,
  type TurnOffCalendarTarget,
} from '@app/features/calendar/components/TurnOffCalendarDialog';
import { useCalendarUiFlag } from '@app/features/calendar/hooks/use-calendar-ui-flag';
import { openAddInboxDialog } from '@app/features/inbox/AddInboxDialog';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { t } from '@app/lib/i18n';
import { toast } from '@core/component/Toast/Toast';
import {
  ENABLE_EMAIL_SIGNATURES_FLAG,
  ENABLE_EMAIL_SIGNATURES_OVERRIDE,
  ENABLE_INBOX_RESYNC,
  ENABLE_INBOX_SYNC_STATUS,
  ENABLE_MULTI_INBOX_OVERRIDE,
} from '@core/constant/featureFlags';
import { useEmail, useUserId } from '@core/context/user';
import {
  useAddInboxFlow,
  useEmailLinks,
  useEmailLinksStatus,
} from '@core/email-link';
import GmailIcon from '@icon/mcp-gmail.svg';
import ArrowsClockwiseIcon from '@phosphor-icons/core/regular/arrows-clockwise.svg?component-solid';
import CalendarSlashIcon from '@phosphor-icons/core/regular/calendar-slash.svg?component-solid';
import PlusIcon from '@phosphor-icons/core/regular/plus.svg?component-solid';
import SignatureIcon from '@phosphor-icons/core/regular/signature.svg?component-solid';
import XIcon from '@phosphor-icons/core/regular/x.svg?component-solid';
import {
  type BackfillProgress,
  estimateEtaSeconds,
  getBackfillProgress,
  useBackfillJobsQuery,
} from '@queries/email/backfill';
import { useRemoveInboxMutation } from '@queries/email/link';
import {
  type BackfillJob,
  BackfillJobStatus,
  type Link as EmailLink,
  SyncStatus,
  UserProvider,
} from '@service-email/generated/schemas';
import { Button, Dialog, Panel, Tooltip } from '@ui';
import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { match } from 'ts-pattern';
import { ConnectAction, StatusDot } from './integration-ui';
import { IntegrationRow, SettingsCard, SettingsRow } from './primitives';
import {
  clearSignatureState,
  isSignatureExpanded,
  SignatureSection,
  toggleSignatureExpanded,
} from './SignatureSection';

/**
 * Gmail integration as a single Connected-accounts card: a header row with the
 * connection state/action, and — once connected — a row per inbox plus add /
 * disconnect controls. All the inbox + backfill logic is unchanged; only the
 * surrounding chrome moved from a standalone panel to a shared card.
 */
export function EmailCard() {
  const email = useEmail();
  const userId = useUserId();
  const multiInboxFlag = useFeatureFlag('enable-multi-inbox', {
    enabledOverride: ENABLE_MULTI_INBOX_OVERRIDE,
  });

  const { query: emailLinksQuery, resyncInbox } = useEmailLinks();
  const emailActive = useEmailLinksStatus();
  const startAddInbox = useAddInboxFlow();

  const backfillJobsQuery = useBackfillJobsQuery();
  const latestBackfillByLinkId = createMemo(() => {
    const latest = new Map<string, BackfillJob>();
    for (const job of backfillJobsQuery.data?.jobs ?? []) {
      if (job.link_id && !latest.has(job.link_id)) {
        latest.set(job.link_id, job);
      }
    }
    return latest;
  });
  const hasCompletedBackfill = (linkId: string): boolean =>
    latestBackfillByLinkId().get(linkId)?.status === BackfillJobStatus.Complete;

  const removeInboxMutation = useRemoveInboxMutation({
    onSuccess: (_data, linkId) => {
      clearSignatureState(linkId);
      toast.success(t('settings.email.toast.removed'));
    },
    onError: () => toast.failure(t('settings.email.toast.removeFailed')),
  });
  const [removeTarget, setRemoveTarget] = createSignal<{
    id: string;
    email: string;
    isOwn: boolean;
  } | null>(null);
  const [turnOffCalendarTarget, setTurnOffCalendarTarget] =
    createSignal<TurnOffCalendarTarget | null>(null);
  const [resyncingIds, setResyncingIds] = createSignal<ReadonlySet<string>>(
    new Set()
  );
  const [isEmailActionPending, setIsEmailActionPending] = createSignal(false);

  const inboxes = createMemo(() => {
    const links = emailLinksQuery.data?.links ?? [];
    const uid = userId();
    const primary = links.find(
      (link) => link.is_primary && link.macro_id === uid
    );
    const others = links.filter((link) => link !== primary);
    return { primary, others };
  });

  const onConnectEmail = async () => {
    if (isEmailActionPending()) return;
    setIsEmailActionPending(true);
    try {
      await startAddInbox();
    } finally {
      setIsEmailActionPending(false);
    }
  };

  const handleResyncInbox = async (linkId: string) => {
    setResyncingIds((prev) => new Set(prev).add(linkId));
    await resyncInbox(linkId).match(
      (res) => {
        toast.success(
          res.already_in_progress
            ? t('settings.email.toast.syncInProgress')
            : t('settings.email.toast.resyncStarted')
        );
      },
      () => toast.failure(t('settings.email.toast.resyncFailed'))
    );
    setResyncingIds((prev) => {
      const next = new Set(prev);
      next.delete(linkId);
      return next;
    });
  };

  const handleRemoveInbox = () => {
    const target = removeTarget();
    if (!target) return;
    setRemoveTarget(null);
    removeInboxMutation.mutate(target.id);
  };

  return (
    <>
      <SettingsCard>
        <IntegrationRow
          icon={<GmailIcon />}
          title={t('settings.email.gmail.title')}
          description={t('settings.email.gmail.description')}
          status={
            <Show when={emailActive()}>
              <StatusDot
                state="connected"
                label={t('settings.email.status.connected')}
              />
            </Show>
          }
        >
          <Show when={!emailActive()}>
            <ConnectAction
              label={t('settings.email.actions.connect')}
              onClick={onConnectEmail}
              disabled={isEmailActionPending()}
            />
          </Show>
        </IntegrationRow>
        <Show when={emailActive()}>
          <Show when={inboxes().primary}>
            {(primary) => (
              <InboxRow
                link={primary()}
                isPrimary
                isOwn={primary().macro_id === userId()}
                hasCompletedBackfill={hasCompletedBackfill(primary().id)}
                resyncing={resyncingIds().has(primary().id)}
                onResync={() => handleResyncInbox(primary().id)}
                onReconnect={() => void startAddInbox()}
                onEnableCalendar={() =>
                  void startAddInbox({ scopes: 'calendar' })
                }
                onRemove={() =>
                  setRemoveTarget({
                    id: primary().id,
                    email: primary().email_address,
                    isOwn: primary().macro_id === userId(),
                  })
                }
                onTurnOffCalendar={() =>
                  setTurnOffCalendarTarget({
                    linkId: primary().id,
                    emailAddress: primary().email_address,
                  })
                }
              />
            )}
          </Show>
          <Show when={!inboxes().primary && email()}>
            <DisabledPrimaryRow
              email={email() ?? ''}
              onEnable={onConnectEmail}
            />
          </Show>
          <For each={inboxes().others}>
            {(link) => (
              <InboxRow
                link={link}
                isPrimary={false}
                isOwn={link.macro_id === userId()}
                hasCompletedBackfill={hasCompletedBackfill(link.id)}
                resyncing={resyncingIds().has(link.id)}
                onResync={() => handleResyncInbox(link.id)}
                onReconnect={() => void startAddInbox()}
                onEnableCalendar={() =>
                  void startAddInbox({ scopes: 'calendar' })
                }
                onRemove={() =>
                  setRemoveTarget({
                    id: link.id,
                    email: link.email_address,
                    isOwn: link.macro_id === userId(),
                  })
                }
                onTurnOffCalendar={() =>
                  setTurnOffCalendarTarget({
                    linkId: link.id,
                    emailAddress: link.email_address,
                  })
                }
              />
            )}
          </For>
          <Show when={multiInboxFlag().enabled}>
            <SettingsRow
              label={t('settings.email.addInbox.label')}
              description={t('settings.email.addInbox.description')}
            >
              <Tooltip label={t('settings.email.actions.addInbox')}>
                <Button
                  variant="outline"
                  size="icon-sm"
                  depth={3}
                  aria-label={t('settings.email.actions.addInbox')}
                  onClick={openAddInboxDialog}
                >
                  <PlusIcon class="size-4" />
                </Button>
              </Tooltip>
            </SettingsRow>
          </Show>
        </Show>
      </SettingsCard>
      <TurnOffCalendarDialog
        target={turnOffCalendarTarget()}
        onClose={() => setTurnOffCalendarTarget(null)}
      />
      <Dialog
        open={removeTarget() !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        position="center"
        class="w-120"
      >
        <Panel depth={2} class="rounded-xl">
          <Panel.Header class="px-6">
            <Dialog.Title class="text-ink text-sm font-semibold">
              {t('settings.email.removeDialog.title')}
            </Dialog.Title>
          </Panel.Header>
          <Panel.Body class="p-6 font-sans flex flex-col gap-3">
            <Dialog.Description class="text-ink-muted text-sm/tight font-normal">
              <Show
                when={removeTarget()?.isOwn}
                fallback={t('settings.email.removeDialog.sharedDescription', {
                  email: removeTarget()?.email ?? '',
                })}
              >
                {t('settings.email.removeDialog.ownDescription', {
                  email: removeTarget()?.email ?? '',
                })}
              </Show>
            </Dialog.Description>
            <div class="pt-3 justify-end items-center gap-3 inline-flex">
              <Button
                variant="outline"
                depth={3}
                onClick={() => setRemoveTarget(null)}
              >
                {t('common.cancel')}
              </Button>
              <Button variant="danger" depth={3} onClick={handleRemoveInbox}>
                {t('common.remove')}
              </Button>
            </div>
          </Panel.Body>
        </Panel>
      </Dialog>
    </>
  );
}

function syncStatusLabel(status: SyncStatus): string {
  return match(status)
    .with(SyncStatus.SYNCING, () => t('settings.email.sync.status.syncing'))
    .with(SyncStatus.UP_TO_DATE, () => t('settings.email.sync.status.upToDate'))
    .with(SyncStatus.ERROR, () => t('settings.email.sync.status.error'))
    .with(SyncStatus.NEEDS_REAUTH, () =>
      t('settings.email.sync.status.needsReauth')
    )
    .with(SyncStatus.INACTIVE, () => t('settings.email.sync.status.disabled'))
    .exhaustive();
}

function formatEta(seconds: number): string {
  if (seconds < 60) {
    return t('settings.email.sync.eta.seconds', {
      count: Math.max(1, Math.ceil(seconds)),
    });
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return t('settings.email.sync.eta.minutes', { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0
    ? t('settings.email.sync.eta.hoursMinutes', {
        hours,
        minutes: remMinutes,
      })
    : t('settings.email.sync.eta.hours', { count: hours });
}

function BackfillProgressBar(props: { progress: BackfillProgress }) {
  const percent = () => {
    if (props.progress.total <= 0) return 0;
    if (props.progress.completed >= props.progress.total) return 100;
    return Math.floor((props.progress.completed / props.progress.total) * 100);
  };
  const etaLabel = createMemo(() => {
    const seconds = estimateEtaSeconds(props.progress);
    return seconds === undefined ? undefined : formatEta(seconds);
  });
  return (
    <div class="flex w-60 flex-col gap-2">
      <span class="flex items-center gap-1.5 text-xs text-ink-muted">
        <ArrowsClockwiseIcon class="size-3 shrink-0 animate-spin" />
        {t('settings.email.sync.backfilling')}
      </span>
      <div class="flex items-center gap-6 whitespace-nowrap text-xs text-ink-muted">
        <span>
          {t('settings.email.sync.progress', {
            completed: props.progress.completed,
            total: props.progress.total,
          })}
        </span>
        <Show when={etaLabel()}>{(label) => <span>{label()}</span>}</Show>
      </div>
      <div class="h-1 w-full overflow-hidden rounded-full bg-edge-muted">
        <div
          class="h-full rounded-full bg-ink transition-[width] duration-300"
          style={{ width: `${percent()}%` }}
        />
      </div>
    </div>
  );
}

function Chip(props: { label: string }) {
  return (
    <span class="shrink-0 rounded bg-edge-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
      {props.label}
    </span>
  );
}

function DisabledPrimaryRow(props: { email: string; onEnable: () => void }) {
  return (
    <div class="bg-surface flex items-center justify-between gap-3 h-15.25 px-6">
      <div class="min-w-0 flex flex-col gap-0.5">
        <div class="flex items-center gap-2 min-w-0">
          <span class="ph-no-capture text-sm truncate text-ink-muted">
            {props.email}
          </span>
          <Chip label={t('settings.email.inbox.primary')} />
          <Chip label={t('settings.email.status.disabled')} />
        </div>
        <span class="text-xs text-ink-muted">
          {t('settings.email.sync.disabled')}
        </span>
      </div>
      <Button variant="outline" size="sm" depth={3} onClick={props.onEnable}>
        {t('settings.email.actions.enable')}
      </Button>
    </div>
  );
}

function InboxRow(props: {
  link: EmailLink;
  isPrimary: boolean;
  isOwn: boolean;
  hasCompletedBackfill: boolean;
  resyncing: boolean;
  onResync: () => void;
  onReconnect: () => void;
  onEnableCalendar: () => void;
  onRemove: () => void;
  onTurnOffCalendar: () => void;
}) {
  const emailSignaturesFlag = useFeatureFlag(ENABLE_EMAIL_SIGNATURES_FLAG, {
    enabledOverride: ENABLE_EMAIL_SIGNATURES_OVERRIDE,
  });
  const calendarUiEnabled = useCalendarUiFlag();
  const showSignature = () => isSignatureExpanded(props.link.id);
  const signatureSectionId = `signature-section-${props.link.id}`;
  return (
    <div class="bg-surface flex flex-col">
      <div class="flex items-center justify-between gap-3 min-h-15.25 py-2 px-6">
        <div class="min-w-0 flex flex-col gap-0.5">
          <div class="flex items-center gap-2 min-w-0">
            <span class="ph-no-capture text-sm truncate">
              {props.link.email_address}
            </span>
            <Show when={props.isPrimary}>
              <Chip label={t('settings.email.inbox.primary')} />
            </Show>
            <Show when={!props.isPrimary && !props.isOwn}>
              <Chip label={t('settings.email.inbox.shared')} />
            </Show>
          </div>
          <Show when={ENABLE_INBOX_SYNC_STATUS}>
            <Switch
              fallback={
                <Show when={props.link.sync_status !== SyncStatus.UP_TO_DATE}>
                  <span
                    class="flex items-center gap-1 text-xs"
                    classList={{
                      'text-failure':
                        props.link.sync_status === SyncStatus.ERROR ||
                        props.link.sync_status === SyncStatus.NEEDS_REAUTH,
                      'text-ink-muted':
                        props.link.sync_status !== SyncStatus.ERROR &&
                        props.link.sync_status !== SyncStatus.NEEDS_REAUTH,
                    }}
                  >
                    <Show when={props.link.sync_status === SyncStatus.SYNCING}>
                      <ArrowsClockwiseIcon class="size-3 animate-spin" />
                    </Show>
                    {syncStatusLabel(props.link.sync_status)}
                  </span>
                </Show>
              }
            >
              <Match when={getBackfillProgress(props.link.id)}>
                {(progress) => <BackfillProgressBar progress={progress()} />}
              </Match>
              <Match
                when={
                  props.link.sync_status === SyncStatus.UP_TO_DATE &&
                  props.hasCompletedBackfill
                }
              >
                <span class="text-xs text-ink-muted">
                  {t('settings.email.sync.initialComplete')}
                </span>
              </Match>
            </Switch>
          </Show>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Show when={emailSignaturesFlag().enabled && props.isOwn}>
            <Tooltip label={t('settings.email.signature.edit')}>
              <Button
                variant="outline"
                size="icon-sm"
                depth={3}
                onClick={() => toggleSignatureExpanded(props.link.id)}
                aria-label={t('settings.email.signature.editFor', {
                  email: props.link.email_address,
                })}
                aria-expanded={showSignature()}
                aria-controls={signatureSectionId}
              >
                <SignatureIcon class="size-4" />
              </Button>
            </Tooltip>
          </Show>
          <Show
            when={
              ENABLE_INBOX_SYNC_STATUS &&
              props.link.provider === UserProvider.GMAIL &&
              props.link.sync_status === SyncStatus.NEEDS_REAUTH
            }
          >
            <Button
              variant="accent"
              size="sm"
              depth={3}
              onClick={props.onReconnect}
              aria-label={t('settings.email.actions.reconnectFor', {
                email: props.link.email_address,
              })}
            >
              {t('settings.email.actions.reconnect')}
            </Button>
          </Show>
          <Show
            when={
              calendarUiEnabled() &&
              props.link.provider === UserProvider.GMAIL &&
              props.link.needs_calendar_permission
            }
          >
            <Button
              variant="accent"
              size="sm"
              depth={3}
              onClick={props.onEnableCalendar}
              aria-label={t('settings.email.actions.enableCalendarFor', {
                email: props.link.email_address,
              })}
            >
              {t('settings.email.actions.enableCalendar')}
            </Button>
          </Show>
          <Show
            when={
              calendarUiEnabled() &&
              props.isOwn &&
              props.link.provider === UserProvider.GMAIL &&
              (!props.link.needs_calendar_permission ||
                props.link.has_calendar_data)
            }
          >
            <Tooltip label={t('settings.email.actions.turnOffCalendar')}>
              <Button
                variant="outline"
                size="icon-sm"
                depth={3}
                onClick={props.onTurnOffCalendar}
                aria-label={t('settings.email.actions.turnOffCalendarFor', {
                  email: props.link.email_address,
                })}
              >
                <CalendarSlashIcon class="size-4" />
              </Button>
            </Tooltip>
          </Show>
          <Show when={ENABLE_INBOX_RESYNC}>
            <Tooltip label={t('settings.email.actions.forceSync')}>
              <Button
                variant="outline"
                size="icon-sm"
                depth={3}
                disabled={
                  props.resyncing ||
                  (ENABLE_INBOX_SYNC_STATUS &&
                    props.link.sync_status === SyncStatus.SYNCING)
                }
                onClick={props.onResync}
                aria-label={t('settings.email.actions.forceSyncFor', {
                  email: props.link.email_address,
                })}
              >
                <ArrowsClockwiseIcon class="size-4" />
              </Button>
            </Tooltip>
          </Show>
          <Tooltip label={t('settings.email.actions.removeInbox')}>
            <Button
              variant="outline"
              size="icon-sm"
              depth={3}
              onClick={props.onRemove}
              aria-label={t('settings.email.actions.removeFor', {
                email: props.link.email_address,
              })}
            >
              <XIcon class="size-4" />
            </Button>
          </Tooltip>
        </div>
      </div>
      <Show
        when={emailSignaturesFlag().enabled && props.isOwn && showSignature()}
      >
        <div id={signatureSectionId} class="px-6 pb-4">
          <SignatureSection link={props.link} />
        </div>
      </Show>
    </div>
  );
}
