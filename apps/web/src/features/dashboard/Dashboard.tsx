import { Widget } from '@app/features/dynamic-ui/widget';
import type { Widget as WidgetNode } from '@app/features/dynamic-ui/schema';
import { t } from '@app/lib/i18n';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@components/app/split-layout/components/SplitHeader';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { aiChatTheme } from '@core/component/LexicalMarkdown/theme';
import { Button } from '@ui';
import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import {
  appendDashboardModule,
  createChannelMessageModule,
  createDashboardModule,
  moveDashboardModuleAt,
  parseDashboardModules,
  removeDashboardModuleAt,
  updateDashboardChannelMessageAt,
  type ChannelMessageConfig,
  type InstantDashboardModuleType,
  type MoveDirection,
} from './catalog';
import { DashboardEditor } from './editor';
import { useDashboardPersistence } from './persistence';
import { getDashboardPreset } from './presets';

/**
 * `/dashboard` split page: compose catalog modules into containers and live-
 * preview them with {@link Widget.Compose}. Distinct from Home — no ChatInput.
 */
export function Dashboard() {
  const persistence = useDashboardPersistence();
  const [widgets, setWidgets] = createSignal<WidgetNode[]>([]);
  const [hydrated, setHydrated] = createSignal(false);

  createEffect(() => {
    if (hydrated()) return;
    if (persistence.isLoading()) return;
    const restored = persistence.layout();
    setWidgets(parseDashboardModules(restored?.modules));
    setHydrated(true);
  });

  const view = createMemo(() => ({ widgets: widgets() }));

  const addModule = (type: InstantDashboardModuleType) => {
    setWidgets((current) =>
      appendDashboardModule(current, createDashboardModule(type))
    );
  };

  const addChannelMessage = (input: {
    channelId: string;
    messageId?: string;
  }) => {
    const module = createChannelMessageModule(input);
    if (module === undefined) return;
    setWidgets((current) => appendDashboardModule(current, module));
  };

  const removeModule = (path: number[]) => {
    setWidgets((current) => removeDashboardModuleAt(current, path));
  };

  const moveModule = (path: number[], direction: MoveDirection) => {
    setWidgets((current) => moveDashboardModuleAt(current, path, direction));
  };

  const updateChannelMessage = (
    path: number[],
    next: ChannelMessageConfig
  ) => {
    setWidgets((current) =>
      updateDashboardChannelMessageAt(current, path, next)
    );
  };

  const applyPreset = (id: 'morning' | 'blank') => {
    setWidgets(getDashboardPreset(id).widgets);
  };

  return (
    <div class="flex size-full flex-col bg-surface">
      <SplitHeaderLeft>
        <span class="text-sm font-semibold">{t('dashboard.editor.title')}</span>
      </SplitHeaderLeft>
      <SplitHeaderRight>
        <Button
          variant="cta"
          size="sm"
          disabled={persistence.isSavingPersonal() || !hydrated()}
          onClick={() =>
            persistence.savePersonal({ kind: 'dashboard', modules: widgets() })
          }
        >
          {t('dashboard.editor.savePersonal')}
        </Button>
        <Show when={persistence.canEditTeamDefault()}>
          <Button
            variant="outline"
            size="sm"
            disabled={persistence.isSavingTeamDefault() || !hydrated()}
            onClick={() =>
              persistence.saveTeamDefault({
                kind: 'dashboard',
                modules: widgets(),
              })
            }
          >
            {t('dashboard.editor.makeTeamDefault')}
          </Button>
        </Show>
      </SplitHeaderRight>
      <div class="flex min-h-0 flex-1 flex-col md:flex-row">
        <DashboardEditor
          widgets={widgets()}
          onAdd={addModule}
          onAddChannelMessage={addChannelMessage}
          onRemove={removeModule}
          onMove={moveModule}
          onUpdateChannelMessage={updateChannelMessage}
          onApplyPreset={applyPreset}
        />
        <section class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4">
          <h2 class="text-ink-extra-muted mb-3 text-xxs font-medium uppercase tracking-wide">
            {t('dashboard.editor.preview')}
          </h2>
          <StaticMarkdownContext theme={aiChatTheme}>
            <Widget.Compose view={view()} />
          </StaticMarkdownContext>
        </section>
      </div>
    </div>
  );
}
