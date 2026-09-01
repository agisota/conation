import TagSimple from '@phosphor-icons/core/regular/tag-simple.svg';
import { t } from '@app/lib/i18n';
import { BaseTool } from './BaseTool';
import { createToolRenderer } from './ToolRenderer';

const handler = createToolRenderer({
  name: 'ListLabels',
  render: (ctx) => (
    <BaseTool icon={TagSimple} renderContext={ctx.renderContext} type="call">{t('auto.list_email_labels')}</BaseTool>
  ),
});

export const listLabelsHandler = handler;
