import { t } from '@app/lib/i18n';
import {
  createBulkRenameDssEntityMutation,
  type EntityData,
  InlineEntity,
} from '@entity';
import { Dialog } from '@kobalte/core/dialog';
import CloseIcon from '@phosphor-icons/core/regular/x.svg?component-solid';
import { Button, cn, SegmentedControl } from '@ui';
import { createMemo, createSignal, For, onMount, Show } from 'solid-js';

type RenameMode = 'total' | 'prepend' | 'append' | 'replace';

export const BulkRenameEntitiesView = (props: {
  entities: EntityData[];
  onFinish: () => void;
  onCancel: () => void;
  onError?: (error: unknown) => void;
}) => {
  const renameMutation = createBulkRenameDssEntityMutation();

  let inputRef: HTMLInputElement | undefined;

  const primaryEntity = () => props.entities[0];
  const multi = () => props.entities.length > 1;

  const [editValue, setEditValue] = createSignal(primaryEntity()?.name ?? '');
  const [replaceFind, setReplaceFind] = createSignal('');
  const [replaceWith, setReplaceWith] = createSignal('');

  // Mode defaults
  const [mode, setMode] = createSignal<RenameMode>(
    multi() ? 'append' : 'total'
  );

  const modeOptions: { value: RenameMode; label: string }[] = [
    { value: 'prepend', label: t('entity.rename.mode.prepend') },
    { value: 'append', label: t('entity.rename.mode.append') },
    { value: 'replace', label: t('entity.rename.mode.replace') },
    { value: 'total', label: t('entity.rename.mode.total') },
  ];

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishEditing();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      props.onCancel();
    }
  };

  const previewName = createMemo(() => {
    const base = primaryEntity()?.name ?? '';
    const v = editValue().trim();

    switch (mode()) {
      case 'total':
        return v;

      case 'prepend':
        return v + base;

      case 'append':
        return base + v;

      case 'replace':
        if (!replaceFind()) return base;
        return base.replaceAll(replaceFind(), replaceWith());

      default:
        return base;
    }
  });

  const finishEditing = async () => {
    const newValue = editValue();

    let renameFn: (old?: string) => string = () => newValue;
    switch (mode()) {
      case 'prepend':
        renameFn = (old) => newValue + (old ?? '');
        break;
      case 'append':
        renameFn = (old) => (old ?? '') + newValue;
        break;
      case 'replace':
        renameFn = (old) =>
          (old ?? '').replaceAll(replaceFind(), replaceWith());
        break;
      default:
    }

    try {
      const results = await renameMutation.mutateAsync(
        props.entities.map((e) => ({ entity: e, newName: renameFn(e.name) }))
      );
      if (results.some((result) => !result.success)) {
        props.onError?.(new Error('Some entities could not be renamed'));
        return;
      }
      props.onFinish();
    } catch (error) {
      console.error('Failed to rename entities:', error);
      props.onError?.(error);
    }
  };

  return (
    <>
      <div class="shrink-0 flex flex-row items-center px-2 gap-1 border-b border-b-edge-muted h-10">
        <Dialog.CloseButton as={Button} variant="ghost" size="icon-sm">
          <CloseIcon />
        </Dialog.CloseButton>
        <Dialog.Title as="span" class="text-sm font-medium p-0 m-0">
          {t('entity.rename.title')}
        </Dialog.Title>
      </div>

      <div class="p-2 border-b border-edge-muted">
        <div class="flex items-center gap-2">
          <For each={props.entities.slice(0, 2)}>
            {(entity) => (
              <div
                class={cn(
                  'bg-hover border border-edge-muted px-2 py-1 truncate text-xs rounded-xs',
                  {
                    'max-w-[50%]': props.entities.length === 2,
                  }
                )}
              >
                <InlineEntity entity={entity} />
              </div>
            )}
          </For>
          <Show when={props.entities.length > 2}>
            <div class="text-ink-muted text-xs px-2 py-1">
              {t('entity.selection.additionalCount', {
                count: props.entities.length - 2,
              })}
            </div>
          </Show>
        </div>
      </div>

      <div class="p-3 flex flex-col gap-3">
        <Show when={multi()}>
          <SegmentedControl
            aria-label={t('entity.rename.modeLabel')}
            value={mode()}
            options={modeOptions}
            onChange={(value) => setMode(value)}
            size="sm"
          />
        </Show>

        <div class="w-full">
          <input
            ref={(el) => {
              inputRef = el;
              onMount(() => {
                setTimeout(() => {
                  inputRef?.focus();
                  inputRef?.select();
                });
              });
            }}
            value={editValue()}
            onInput={(e) => setEditValue(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            class="w-full p-2 text-sm border border-edge bg-surface text-ink
                   placeholder:text-ink-placeholder focus:outline-none focus:bg-active
                   selection:bg-ink selection:text-surface"
            placeholder={t('entity.rename.textPlaceholder')}
          />
        </div>

        <Show when={multi() && mode() === 'replace'}>
          <div class="flex flex-col gap-2">
            <input
              class="p-1 text-sm border border-edge bg-surface"
              placeholder={t('entity.rename.findPlaceholder')}
              value={replaceFind()}
              onInput={(e) => setReplaceFind(e.currentTarget.value)}
            />
            <input
              class="p-1 text-sm border border-edge bg-surface"
              placeholder={t('entity.rename.replaceWithPlaceholder')}
              value={replaceWith()}
              onInput={(e) => setReplaceWith(e.currentTarget.value)}
            />
          </div>
        </Show>

        <Show when={multi() && mode() !== 'total'}>
          <div class="text-xs opacity-70">
            {t('entity.rename.previewFirst')}
            <div class="mt-1 p-2 bg-surface border border-edge rounded">
              {previewName()}
            </div>
          </div>
        </Show>

        <div class="flex justify-end gap-2">
          <Button variant="ghost" class="rounded-xs" onClick={props.onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="outline"
            class="rounded-xs"
            onClick={finishEditing}
          >
            {t('entity.rename.submit')}
          </Button>
        </div>
      </div>
    </>
  );
};
