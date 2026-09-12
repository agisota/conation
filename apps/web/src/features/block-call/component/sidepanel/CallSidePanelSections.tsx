import { EntityActivitySectionConditional } from '@app/features/activity/EntityActivitySection';
import { EntityPropertiesSection } from '@app/features/property/side-panel/properties';
import { t } from '@app/lib/i18n';
import { useCallContextOptional } from '@channel/Call/CallContext';
import { SidePanel } from '@components/app/side-panel';
import { useBlockId } from '@core/block';
import { EntityReferencesSection } from '@core/component/EntityReferencesSection';
import { UserIcon } from '@core/component/UserIcon';
import { getDisplayName, tryMacroId } from '@core/user';
import { type DateValue, formatDate } from '@core/util/date';
import ClockIcon from '@phosphor/clock.svg';
import {
  useSetCallRecordShareWithTeamMutation,
  useToggleShareWithTeamMutation,
} from '@queries/call/call';
import type { CallRecord } from '@service-storage/generated/schemas/callRecord';
import { cn, InlineCheckbox } from '@ui';
import { type Accessor, Show } from 'solid-js';
import { formatCallDuration } from '../../utils';

interface CallSidePanelSectionsProps {
  record: Accessor<CallRecord>;
}

export function CallSidePanelSections(props: CallSidePanelSectionsProps) {
  const blockId = useBlockId();

  return (
    <>
      <SidePanel.Section
        id="details"
        title={t('common.details')}
        defaultOpen
        order={10}
      >
        <DetailsSectionContent record={props.record} />
      </SidePanel.Section>
      <SidePanel.Section
        id="properties"
        title={t('common.properties')}
        defaultOpen
        order={15}
      >
        <PropertiesSectionContent record={props.record} />
      </SidePanel.Section>
      <SidePanel.Section
        id="sharing"
        title={t('call.sidePanel.sharing')}
        order={20}
      >
        <SharingSectionContent record={props.record} />
      </SidePanel.Section>
      <EntityActivitySectionConditional
        entityId={props.record().callId}
        entityType="CALL_RECORD"
        order={40}
      />
      <EntityReferencesSection
        entityId={blockId}
        entityType="call"
        order={50}
      />
    </>
  );
}

function DetailsSectionContent(props: { record: Accessor<CallRecord> }) {
  const record = props.record;

  const startedAt = (): DateValue | undefined => record().startedAt;
  const endedAt = (): DateValue | undefined => record().endedAt ?? undefined;
  const durationMs = () => record().durationMs ?? undefined;

  return (
    <SidePanel.Grid>
      <SidePanel.Row label={t('common.owner')}>
        <OwnerValue ownerId={record().createdBy} />
      </SidePanel.Row>
      <Show when={startedAt()}>
        {(value) => (
          <SidePanel.Row label={t('call.sidePanel.started')}>
            <DateValueDisplay value={value()} />
          </SidePanel.Row>
        )}
      </Show>
      <Show when={endedAt()}>
        {(value) => (
          <SidePanel.Row label={t('call.sidePanel.ended')}>
            <DateValueDisplay value={value()} />
          </SidePanel.Row>
        )}
      </Show>
      <Show when={durationMs()}>
        {(ms) => (
          <SidePanel.Row label={t('call.sidePanel.duration')}>
            <SidePanel.Pill>
              <ClockIcon class="size-3 shrink-0" />
              <span class="truncate">{formatCallDuration(ms())}</span>
            </SidePanel.Pill>
          </SidePanel.Row>
        )}
      </Show>
      <SidePanel.Row label={t('call.sidePanel.status')}>
        <SidePanel.Pill>
          <Show
            when={record().isActive}
            fallback={
              <span class="truncate text-ink-muted">
                {t('call.status.ended')}
              </span>
            }
          >
            <span class="size-2 rounded-full bg-success shrink-0" />
            <span class="truncate text-success font-medium">
              {t('call.status.inProgress')}
            </span>
          </Show>
        </SidePanel.Pill>
      </SidePanel.Row>
    </SidePanel.Grid>
  );
}

function PropertiesSectionContent(props: { record: Accessor<CallRecord> }) {
  // Tag/property writes are authorized server-side via the call's owning
  // channel (edit access), mirroring the sharing control above, so the editor
  // is always mounted and the backend rejects unauthorized mutations.
  return (
    <EntityPropertiesSection
      entityId={props.record().callId}
      entityType="CALL_RECORD"
      canEdit
      documentName={
        props.record().customName ?? props.record().channelName ?? undefined
      }
    />
  );
}

function OwnerValue(props: { ownerId: string }) {
  const displayName = () => getDisplayName(tryMacroId(props.ownerId));
  return (
    <SidePanel.Pill>
      <UserIcon id={props.ownerId} size="sm" showTooltip suppressClick />
      <span class="truncate">{displayName()}</span>
    </SidePanel.Pill>
  );
}

function DateValueDisplay(props: { value: DateValue }) {
  return (
    <SidePanel.Pill>
      <ClockIcon class="size-3 shrink-0" />
      <span class="truncate">
        {formatDate(props.value, { showTime: true })}
      </span>
    </SidePanel.Pill>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sharing Section
// ─────────────────────────────────────────────────────────────────────────────

function SharingSectionContent(props: { record: Accessor<CallRecord> }) {
  const record = props.record;
  const callCtx = useCallContextOptional();
  const toggleActiveShare = useToggleShareWithTeamMutation();
  const setArchivedShare = useSetCallRecordShareWithTeamMutation();

  const isShared = () => record().shareWithTeam;
  const isDisabled = () =>
    toggleActiveShare.isPending || setArchivedShare.isPending;

  const handleChange = async (checked: boolean) => {
    const current = record();
    try {
      const newValue = current.isActive
        ? await toggleActiveShare.mutateAsync(current.callId)
        : (
            await setArchivedShare.mutateAsync({
              callId: current.callId,
              shareWithTeam: checked,
            })
          ).shareWithTeam;

      if (callCtx?.activeCallId() === current.callId) {
        callCtx.setSharedWithTeam(newValue);
      }
    } catch (error) {
      console.error('failed to update call record team sharing', error);
    }
  };

  return (
    <div class="flex flex-col gap-2 text-xs">
      <button
        type="button"
        role="checkbox"
        aria-checked={isShared()}
        disabled={isDisabled()}
        onClick={() => void handleChange(!isShared())}
        class={cn(
          'inline-flex items-center gap-2 rounded-md h-7 px-2.5 text-xs select-none w-fit',
          'border border-ink-muted/[0.08] bg-ink-muted/[0.025]',
          'text-ink-muted/70 hover:text-ink hover:bg-ink-muted/[0.06]',
          isShared() && 'text-ink',
          isDisabled() && 'pointer-events-none opacity-50'
        )}
      >
        <InlineCheckbox checked={isShared()} />
        <span class="whitespace-nowrap">{t('call.actions.shareWithTeam')}</span>
      </button>
      <p class="text-ink-muted leading-5">
        {t('call.sidePanel.sharingDescription')}
      </p>
    </div>
  );
}
