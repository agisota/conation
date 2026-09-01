import {
  ChatWithAgentButton,
  ChatWithAgentIcon,
  openChatWithAgent,
} from '@app/features/chat/ChatWithAgentButton';
import { t } from '@app/lib/i18n';
import { useCall } from '@channel/Call/use-call';
import {
  BLOCK_TOOL_IDS,
  type BlockTool,
  ResponsiveBlockToolbar,
  ResponsivePermissionsBadge,
} from '@components/app/ResponsiveBlockToolbar';
import { HeaderIsland } from '@components/app/split-layout/components/HeaderIsland';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@components/app/split-layout/components/SplitHeader';
import { StaticSplitLabel } from '@components/app/split-layout/components/SplitLabel';
import { useBlockId } from '@core/block';
import { BlockLiveIndicators } from '@core/component/LiveIndicators';
import {
  getShareDrawerRecipientInput,
  ShareTrigger,
  useShareDialogContext,
} from '@core/component/TopBar/ShareButton';
import { isMobile } from '@core/mobile/isMobile';
import { buildEntityData } from '@entity';
import PhoneCallIcon from '@icon/wide-call.svg';
import IconShared from '@icon/wide-share.svg';
import type { CallRecord } from '@service-storage/generated/schemas/callRecord';
import { Button } from '@ui';
import { type Accessor, Show } from 'solid-js';

export function CallRecordingSplitHeaderLoading() {
  return (
    <SplitHeaderLeft>
      <div class="h-full my-auto flex min-w-0 items-center justify-start gap-3">
        <div class="ph-no-capture z-split-header-content relative flex h-full max-w-full min-w-0 shrink items-center gap-2">
          <StaticSplitLabel
            label={t('call.recording.defaultName')}
            icon={
              <PhoneCallIcon class="size-4 touch:size-6 shrink-0 text-ink-muted" />
            }
          />
        </div>
      </div>
    </SplitHeaderLeft>
  );
}

export function CallRecordingSplitHeader(props: {
  record: Accessor<CallRecord>;
}) {
  const record = props.record;
  const blockId = useBlockId();
  const shareCtx = useShareDialogContext();
  const callName = () =>
    record().customName ?? record().channelName ?? t('call.defaultName');
  const call = useCall(() => record().channelId);

  const shareTool: BlockTool = {
    id: BLOCK_TOOL_IDS.share,
    group: 'sharing',
    label: t('block.actions.share'),
    icon: IconShared,
    action: () => shareCtx.open(),
    buttonComponent: () => <ShareTrigger />,
    focusTarget: getShareDrawerRecipientInput,
  };

  const tools: BlockTool[] = [
    {
      label: t('chat.actions.askConation'),
      icon: ChatWithAgentIcon,
      action: () =>
        openChatWithAgent({
          type: 'document',
          id: blockId,
          name: callName(),
          fileType: 'call',
        }),
      condition: isMobile,
    },
    {
      id: BLOCK_TOOL_IDS.chat,
      label: t('chat.actions.chat'),
      icon: ChatWithAgentIcon,
      action: () =>
        openChatWithAgent({
          type: 'document',
          id: blockId,
          name: callName(),
          fileType: 'call',
        }),
      buttonComponent: () => (
        <ChatWithAgentButton
          entity={{
            type: 'document',
            id: blockId,
            name: callName(),
            fileType: 'call',
          }}
        />
      ),
    },
    shareTool,
  ];

  const menuTools: BlockTool[] = [
    {
      label: t('chat.actions.askConation'),
      icon: ChatWithAgentIcon,
      action: () =>
        openChatWithAgent({
          type: 'document',
          id: blockId,
          name: callName(),
          fileType: 'call',
        }),
    },
    shareTool,
  ];

  return (
    <>
      <SplitHeaderLeft>
        <div class="h-full my-auto flex min-w-0 items-center justify-start gap-3">
          <div class="ph-no-capture z-split-header-content relative flex h-full max-w-full min-w-0 shrink items-center gap-2">
            <StaticSplitLabel
              label={callName()}
              icon={
                <PhoneCallIcon class="size-4 touch:size-6 shrink-0 text-ink-muted" />
              }
            />
          </div>
        </div>
      </SplitHeaderLeft>

      <SplitHeaderRight>
        <div class="-order-1">
          <BlockLiveIndicators />
        </div>
        <Show when={!record().isActive}>
          <div class="order-[900] flex items-center">
            <HeaderIsland>
              <Button
                depth={2}
                variant="outline"
                size="icon-xs"
                class="bg-surface"
                tooltip={t('call.actions.callAgain')}
                onClick={() => call.joinCall()}
              >
                <PhoneCallIcon class="size-4" />
              </Button>
            </HeaderIsland>
          </div>
        </Show>
      </SplitHeaderRight>

      <ResponsivePermissionsBadge />

      <ResponsiveBlockToolbar
        tools={tools}
        menuTools={menuTools}
        ops={[{ op: 'copy' }]}
        id={blockId}
        itemType="call"
        name={callName()}
        // Generic chrome can't reconstruct a CallEntity (it lacks the
        // channelId), so supply it for the menu's entity-gated items.
        entity={buildEntityData({
          id: record().callId,
          name: callName(),
          blockName: 'call',
          channelId: record().channelId,
          isActive: record().isActive,
          status: record().status ?? undefined,
        })}
      />
    </>
  );
}
