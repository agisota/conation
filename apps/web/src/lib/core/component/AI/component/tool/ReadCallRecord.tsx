import Newspaper from '@phosphor-icons/core/regular/newspaper.svg';
import { t } from '@app/lib/i18n';
import { BaseTool } from './BaseTool';
import { createToolRenderer } from './ToolRenderer';

const handler = createToolRenderer({
  name: 'ReadCallRecord',
  render: (ctx) => (
    <BaseTool type="call" icon={Newspaper} renderContext={ctx.renderContext}>{t('auto.read')}<span class="text-ink">call transcript</span>
    </BaseTool>
  ),
});

export const readCallRecordHandler = handler;
