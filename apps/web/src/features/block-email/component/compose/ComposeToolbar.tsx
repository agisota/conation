import { t } from '@app/lib/i18n';
import { EmailDateSelector } from '@block-email/component/email-date-selector';
import { MAX_ATTACHMENTS_BYTES_SIZE } from '@block-email/constants';
import { FormatButtons } from '@channel/Input/FormatButtons';
import { HeaderIsland } from '@components/app/split-layout/components/HeaderIsland';
import { SplitHeaderRight } from '@components/app/split-layout/components/SplitHeader';
import { defaultSelectionData } from '@core/component/LexicalMarkdown/plugins';
import {
  NODE_TRANSFORM,
  type NodeTransformType,
} from '@core/component/LexicalMarkdown/plugins/node-transform/nodeTransformPlugin';
import { toast } from '@core/component/Toast/Toast';
import { ENABLE_EMAIL_SCHEDULED_SEND } from '@core/constant/featureFlags';
import { fileSelector } from '@core/directive/fileSelector';
import { isMobile } from '@core/mobile/isMobile';
import PaperclipIcon from '@phosphor/paperclip.svg?component-solid';
import TextAa from '@phosphor/text-aa.svg';
import Trash from '@phosphor/trash.svg';
import { Button, SendButton, Tooltip } from '@ui';
import { FORMAT_TEXT_COMMAND, type LexicalEditor } from 'lexical';
import { createSignal, Show } from 'solid-js';
import { useCompose } from './ComposeContext';

export function EmailComposeToolbar(props: {
  editor?: () => LexicalEditor | undefined;
}) {
  const ctx = useCompose();
  const [showFormatRibbon, setShowFormatRibbon] = createSignal(false);
  let attachButtonRef!: HTMLDivElement;

  const handleAddAttachments = (files: File[]) => {
    const currentAttachments = ctx.attachments();

    const attachmentsToAddByteSize = files.reduce((sum, f) => sum + f.size, 0);

    if (attachmentsToAddByteSize >= MAX_ATTACHMENTS_BYTES_SIZE) {
      toast.failure(
        t('blockEmail.attachments.tooLarge', { count: files.length })
      );
      return;
    }

    const currentAttachmentsByteSize = currentAttachments.reduce(
      (sum, a) => sum + (a.type === 'local' ? a.file.size : a.fileSize),
      0
    );

    if (
      currentAttachmentsByteSize + attachmentsToAddByteSize >=
      MAX_ATTACHMENTS_BYTES_SIZE
    ) {
      toast.failure(t('blockEmail.attachments.limitReached'), {
        subtext: t('blockEmail.attachments.limitDescription'),
      });
      return;
    }

    ctx.onAddAttachments(
      files.map((file) => ({
        type: 'local',
        file,
      }))
    );
  };

  return (
    <>
      <Show when={showFormatRibbon()}>
        <div class="flex flex-row w-full gap-2 items-center p-2 -ml-3">
          <FormatButtons
            selectionState={() => defaultSelectionData}
            onInlineFormat={(format) => {
              props.editor?.()?.dispatchCommand(FORMAT_TEXT_COMMAND, format);
            }}
            onNodeFormat={(transform: NodeTransformType) => {
              props.editor?.()?.dispatchCommand(NODE_TRANSFORM, transform);
            }}
          />
        </div>
      </Show>
      <div class="flex flex-row w-full h-8 justify-between items-center space-x-2 mt-2">
        <Show
          when={!isMobile()}
          fallback={
            <MobileToolbar
              attachButtonRef={attachButtonRef}
              handleAddAttachments={handleAddAttachments}
            />
          }
        >
          <div class="flex flex-row items-center gap-1">
            <Show when={!ctx.hideAttachments}>
              <div class="relative" ref={attachButtonRef}>
                <Button
                  ref={(el) =>
                    fileSelector(el, () => ({
                      multiple: true,
                      onSelect: handleAddAttachments,
                    }))
                  }
                  tooltip={t('blockEmail.actions.attach')}
                  size="icon-sm"
                  disabled={ctx.disabled()}
                >
                  <PaperclipIcon />
                </Button>
              </div>
            </Show>
            <Button
              tooltip={t('blockEmail.actions.format')}
              size="icon-sm"
              disabled={ctx.disabled()}
              onClick={() => {
                setShowFormatRibbon(!showFormatRibbon());
              }}
            >
              <TextAa />
            </Button>
            <Show when={ctx.hasDraft()}>
              <div aria-hidden="true" class="mx-1 h-4 w-px bg-edge-muted/70" />
              <Button
                onclick={ctx.onDelete}
                tooltip={t('blockEmail.compose.deleteDraft')}
                size="icon-sm"
              >
                <Trash />
              </Button>
            </Show>
          </div>

          <div class="flex items-center gap-1">
            <Show when={ctx.onSaveDraft}>
              <Button
                disabled={
                  ctx.isSending() || ctx.isSavingDraft?.() || ctx.disabled()
                }
                onClick={() => void ctx.onSaveDraft?.()}
                variant="outline"
                size="sm"
              >
                {ctx.isSavingDraft?.()
                  ? t('blockEmail.compose.saving')
                  : t('blockEmail.compose.saveDraft')}
              </Button>
            </Show>
            <Show when={ENABLE_EMAIL_SCHEDULED_SEND && ctx.onSendTimeChange}>
              <EmailDateSelector
                sendTime={ctx.sendTime()}
                onSendTimeChange={ctx.onSendTimeChange}
                disabled={ctx.scheduleSendDisabled?.()}
              />
            </Show>
            <Tooltip
              label={ctx.sendTime() ? t('blockEmail.schedule.scheduled') : ''}
            >
              <SendButton
                onClick={() => ctx.onSend()}
                disabled={
                  ctx.isSavingDraft?.() ||
                  !!ctx.sendTime() ||
                  ctx.isSending() ||
                  ctx.disabled()
                }
                pending={ctx.isSending()}
                tooltip={t('blockEmail.actions.send')}
                shortcut="cmd+enter"
              />
            </Tooltip>
          </div>
        </Show>
      </div>
    </>
  );
}

function MobileToolbar(props: {
  attachButtonRef: HTMLDivElement;
  handleAddAttachments: (files: File[]) => void;
}) {
  const ctx = useCompose();

  return (
    <SplitHeaderRight>
      <HeaderIsland>
        <div class="flex items-center gap-1 pl-2">
          <Show when={!ctx.hideAttachments}>
            <div class="relative" ref={props.attachButtonRef}>
              <Button
                ref={(el) =>
                  fileSelector(el, () => ({
                    multiple: true,
                    onSelect: props.handleAddAttachments,
                  }))
                }
                size="icon-sm"
                disabled={ctx.disabled()}
                tooltip={t('blockEmail.actions.attach')}
              >
                <PaperclipIcon />
              </Button>
            </div>
          </Show>
          <Show when={ctx.onSaveDraft}>
            <Button
              variant="outline"
              size="sm"
              disabled={
                ctx.isSending() || ctx.isSavingDraft?.() || ctx.disabled()
              }
              onClick={() => void ctx.onSaveDraft?.()}
            >
              {ctx.isSavingDraft?.()
                ? t('blockEmail.compose.saving')
                : t('blockEmail.compose.draft')}
            </Button>
          </Show>
          <Show when={ENABLE_EMAIL_SCHEDULED_SEND && ctx.onSendTimeChange}>
            <EmailDateSelector
              sendTime={ctx.sendTime()}
              onSendTimeChange={ctx.onSendTimeChange}
              disabled={ctx.scheduleSendDisabled?.()}
              compact
            />
          </Show>
          <SendButton
            disabled={
              ctx.isSending() ||
              ctx.isSavingDraft?.() ||
              ctx.disabled() ||
              !!ctx.sendTime()
            }
            pending={ctx.isSending()}
            onClick={() => ctx.onSend()}
            tooltip={t('blockEmail.actions.send')}
          />
        </div>
      </HeaderIsland>
    </SplitHeaderRight>
  );
}
