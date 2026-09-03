import { t } from '@app/lib/i18n';
import EnvelopeOpen from '@phosphor-icons/core/regular/envelope-open.svg';
import { BaseTool } from './BaseTool';
import { createToolRenderer } from './ToolRenderer';

const handler = createToolRenderer({
  name: 'GetThread',
  render: (ctx) => (
    <BaseTool icon={EnvelopeOpen} renderContext={ctx.renderContext} type="call">
      {t('ai.tools.email.readThread')}
    </BaseTool>
  ),
});

export const getThreadHandler = handler;
