import { t } from '@app/lib/i18n';
import type { Widget } from '@app/features/dynamic-ui/schema';
import XIcon from '@phosphor/x.svg';
import { Button } from '@ui';
import { For, Show } from 'solid-js';
import { DASHBOARD_MODULE_TYPES, type DashboardModuleType } from './catalog';

export function DashboardEditor(props: {
  widgets: Widget[];
  onAdd: (type: DashboardModuleType) => void;
  onRemove: (path: number[]) => void;
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
            {(type) => (
              <Button
                variant="outline"
                size="sm"
                fullWidth
                class="justify-start"
                onClick={() => props.onAdd(type)}
              >
                {t(`dashboard.modules.${type}`)}
              </Button>
            )}
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
          />
        </div>
      </Show>
    </aside>
  );
}

function ModuleTree(props: {
  widgets: Widget[];
  path: number[];
  onRemove: (path: number[]) => void;
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
                type={widget.type}
                path={path()}
                onRemove={props.onRemove}
              />
            }
          >
            {(container) => (
              <div class="flex flex-col gap-1 border-l border-edge-muted pl-2">
                <ModuleTree
                  widgets={container().children}
                  path={path()}
                  onRemove={props.onRemove}
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
  type: Widget['type'];
  path: number[];
  onRemove: (path: number[]) => void;
}) {
  return (
    <div
      class="flex items-center gap-1 rounded-md px-1 py-0.5 text-ink-muted text-sm"
    >
      <span class="min-w-0 flex-1 truncate">
        {t(`dashboard.modules.${props.type}`)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        tooltip={t('common.remove')}
        onClick={() => props.onRemove(props.path)}
      >
        <XIcon class="size-3.5" />
      </Button>
    </div>
  );
}
