import { t } from '@app/lib/i18n';
import Newspaper from '@phosphor-icons/core/regular/newspaper.svg';
import { BaseTool } from './BaseTool';
import { createToolRenderer } from './ToolRenderer';

const handler = createToolRenderer({
  name: 'ReadCallRecord',
  render: (ctx) => (
    <BaseTool type="call" icon={Newspaper} renderContext={ctx.renderContext}>
      {t('ai.tools.call.readTranscript')}
    </BaseTool>
  ),
});

export const readCallRecordHandler = handler;
