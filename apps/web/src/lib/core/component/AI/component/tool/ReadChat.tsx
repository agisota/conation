import { t } from '@app/lib/i18n';
import { ItemPreview } from '@core/component/ItemPreview';
import Newspaper from '@phosphor-icons/core/regular/newspaper.svg';
import { Suspense } from 'solid-js';
import { BaseTool } from './BaseTool';
import { createToolRenderer } from './ToolRenderer';

const handler = createToolRenderer({
  name: 'ReadChat',
  render: (ctx) => (
    <BaseTool icon={Newspaper} renderContext={ctx.renderContext} type="call">
      <div class="min-w-0 flex-1">
        {t('ai.tools.chat.read')} <span class="text-ink-placeholder">·</span>{' '}
        <Suspense>
          <ItemPreview
            class="inline-flex align-middle ring-0"
            id={ctx.tool.data.chatId}
            type="chat"
          />
        </Suspense>
      </div>
    </BaseTool>
  ),
});

export const readChatHandler = handler;
