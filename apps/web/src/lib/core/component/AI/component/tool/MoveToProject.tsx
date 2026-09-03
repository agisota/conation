import { ItemPreview } from '@core/component/ItemPreview';
import { t } from '@core/i18n';
import ArrowSquareIn from '@phosphor-icons/core/regular/arrow-square-in.svg';
import type { MoveableEntityType } from '@service-cognition/generated/tools/types';
import type { ItemType } from '@service-storage/client';
import { Show, Suspense } from 'solid-js';
import { BaseTool } from './BaseTool';
import { createToolRenderer } from './ToolRenderer';

const ITEM_TYPES: Record<MoveableEntityType, ItemType> = {
  document: 'document',
  chat: 'chat',
  email: 'email',
  project: 'project',
};

const handler = createToolRenderer({
  name: 'MoveToProject',
  render: (ctx) => (
    <BaseTool
      icon={ArrowSquareIn}
      renderContext={ctx.renderContext}
      type="call"
    >
      <div class="min-w-0 flex-1">
        {t('ai.tools.move.move')}{' '}
        <Suspense>
          <ItemPreview
            class="inline-flex align-middle ring-0"
            id={ctx.tool.data.entityId}
            type={ITEM_TYPES[ctx.tool.data.entityType]}
          />
        </Suspense>{' '}
        {t('ai.tools.move.to')}{' '}
        <Show
          when={ctx.tool.data.projectId}
          fallback={<span class="text-ink">{t('ai.tools.move.topLevel')}</span>}
        >
          {(projectId) => (
            <Suspense>
              <ItemPreview
                class="inline-flex align-middle ring-0"
                id={projectId()}
                type="project"
              />
            </Suspense>
          )}
        </Show>
      </div>
    </BaseTool>
  ),
});

export const moveToProjectHandler = handler;
