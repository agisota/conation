import { t } from '@app/lib/i18n';
import type { Widget } from '@app/features/dynamic-ui/schema';
import CaretDownIcon from '@phosphor/caret-down.svg';
import CaretUpIcon from '@phosphor/caret-up.svg';
import XIcon from '@phosphor/x.svg';
import { Button, Input } from '@ui';
import { createEffect, createSignal, For, Show } from 'solid-js';
import {
  DASHBOARD_MODULE_TYPES,
  type ChannelMessageConfig,
  type InstantDashboardModuleType,
  type MoveDirection,
} from './catalog';

export function DashboardEditor(props: {
  widgets: Widget[];
  onAdd: (type: InstantDashboardModuleType) => void;
  onAddChannelMessage: (input: {
    channelId: string;
    messageId?: string;
  }) => void;
  onRemove: (path: number[]) => void;
  onMove: (path: number[], direction: MoveDirection) => void;
  onUpdateChannelMessage: (path: number[], next: ChannelMessageConfig) => void;
  onApplyPreset: (id: 'morning' | 'blank') => void;
}) {
  return (
    <aside class="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-edge-muted p-3 md:w-64 md:border-r">
      <div class="flex flex-col gap-2">
        <h2 class="text-ink-extra-muted text-xxs font-medium uppercase tracking-wide">
          {t('dashboard.editor.catalog')}
        </h2>
        <div
          class="flex flex-col gap-1"
          aria-label={t('dashboard.editor.addModule')}
        >
          <For each={DASHBOARD_MODULE_TYPES}>
            {(type) =>
              type === 'channelMessage' ? (
                <ChannelMessageAddForm onAdd={props.onAddChannelMessage} />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  fullWidth
                  class="justify-start"
                  onClick={() => props.onAdd(type)}
                >
                  {t(`dashboard.modules.${type}`)}
                </Button>
              )
            }
          </For>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <Button
          variant="outline"
          size="sm"
          fullWidth
          class="justify-start"
          onClick={() => props.onApplyPreset('morning')}
        >
          {t('dashboard.presets.morning')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          fullWidth
          class="justify-start"
          onClick={() => props.onApplyPreset('blank')}
        >
          {t('dashboard.presets.blank')}
        </Button>
      </div>
      <Show when={props.widgets.length > 0}>
        <div class="flex flex-col gap-1">
          <ModuleTree
            widgets={props.widgets}
            path={[]}
            onRemove={props.onRemove}
            onMove={props.onMove}
            onUpdateChannelMessage={props.onUpdateChannelMessage}
          />
        </div>
      </Show>
    </aside>
  );
}

function ChannelMessageAddForm(props: {
  onAdd: (input: { channelId: string; messageId?: string }) => void;
}) {
  const [channelId, setChannelId] = createSignal('');
  const [messageId, setMessageId] = createSignal('');

  const add = () => {
    const id = channelId().trim();
    if (id === '') return;
    const message = messageId().trim();
    props.onAdd({
      channelId: id,
      ...(message === '' ? {} : { messageId: message }),
    });
    setChannelId('');
    setMessageId('');
  };

  return (
    <form
      class="flex flex-col gap-1 rounded-md border border-edge-muted p-2"
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <span class="text-ink-muted text-sm">
        {t('dashboard.modules.channelMessage')}
      </span>
      <Input
        size="sm"
        required
        aria-label={t('dashboard.editor.channelId')}
        placeholder={t('dashboard.editor.channelId')}
        value={channelId()}
        onInput={(event) => setChannelId(event.currentTarget.value)}
      />
      <Input
        size="sm"
        aria-label={t('dashboard.editor.messageId')}
        placeholder={t('dashboard.editor.messageId')}
        value={messageId()}
        onInput={(event) => setMessageId(event.currentTarget.value)}
      />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        fullWidth
        disabled={channelId().trim() === ''}
      >
        {t('dashboard.editor.addModule')}
      </Button>
    </form>
  );
}

function ModuleTree(props: {
  widgets: Widget[];
  path: number[];
  onRemove: (path: number[]) => void;
  onMove: (path: number[], direction: MoveDirection) => void;
  onUpdateChannelMessage: (path: number[], next: ChannelMessageConfig) => void;
}) {
  return (
    <For each={props.widgets}>
      {(widget, index) => {
        const path = () => [...props.path, index()];
        return (
          <Show
            when={widget.type === 'container' ? widget : false}
            fallback={
              <ModuleRow
                widget={widget}
                path={path()}
                canMoveUp={index() > 0}
                canMoveDown={index() < props.widgets.length - 1}
                onMove={props.onMove}
                onRemove={props.onRemove}
                onUpdateChannelMessage={props.onUpdateChannelMessage}
              />
            }
          >
            {(container) => (
              <div class="flex flex-col gap-1 border-l border-edge-muted pl-2">
                <ModuleTree
                  widgets={container().children}
                  path={path()}
                  onRemove={props.onRemove}
                  onMove={props.onMove}
                  onUpdateChannelMessage={props.onUpdateChannelMessage}
                />
              </div>
            )}
          </Show>
        );
      }}
    </For>
  );
}

function ModuleRow(props: {
  widget: Widget;
  path: number[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (path: number[], direction: MoveDirection) => void;
  onRemove: (path: number[]) => void;
  onUpdateChannelMessage: (path: number[], next: ChannelMessageConfig) => void;
}) {
  return (
    <div class="flex flex-col gap-1 rounded-md px-1 py-0.5">
      <div class="flex items-center gap-1 text-ink-muted text-sm">
        <span class="min-w-0 flex-1 truncate">
          {t(`dashboard.modules.${props.widget.type}`)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!props.canMoveUp}
          tooltip={t('dashboard.editor.moveUp')}
          onClick={() => props.onMove(props.path, 'up')}
        >
          <CaretUpIcon class="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!props.canMoveDown}
          tooltip={t('dashboard.editor.moveDown')}
          onClick={() => props.onMove(props.path, 'down')}
        >
          <CaretDownIcon class="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          tooltip={t('common.remove')}
          onClick={() => props.onRemove(props.path)}
        >
          <XIcon class="size-3.5" />
        </Button>
      </div>
      <Show when={props.widget.type === 'channelMessage' ? props.widget : false}>
        {(message) => (
          <ChannelMessageConfigFields
            channelId={message().channelId}
            messageId={message().messageId}
            onCommit={(next) =>
              props.onUpdateChannelMessage(props.path, next)
            }
          />
        )}
      </Show>
    </div>
  );
}

function ChannelMessageConfigFields(props: {
  channelId: string;
  messageId: string;
  onCommit: (next: ChannelMessageConfig) => void;
}) {
  const [channelId, setChannelId] = createSignal(props.channelId);
  const [messageId, setMessageId] = createSignal(props.messageId);

  createEffect(() => {
    setChannelId(props.channelId);
    setMessageId(props.messageId);
  });

  const commit = () => {
    const id = channelId().trim();
    if (id === '') {
      setChannelId(props.channelId);
      setMessageId(props.messageId);
      return;
    }
    props.onCommit({ channelId: id, messageId: messageId().trim() });
  };

  return (
    <div class="flex flex-col gap-1">
      <Input
        size="sm"
        required
        aria-label={t('dashboard.editor.channelId')}
        placeholder={t('dashboard.editor.channelId')}
        value={channelId()}
        onInput={(event) => setChannelId(event.currentTarget.value)}
        onBlur={commit}
      />
      <Input
        size="sm"
        aria-label={t('dashboard.editor.messageId')}
        placeholder={t('dashboard.editor.messageId')}
        value={messageId()}
        onInput={(event) => setMessageId(event.currentTarget.value)}
        onBlur={commit}
      />
    </div>
  );
}
