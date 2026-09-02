import { ConationToolMark } from '@app/components/brand';
import { t } from '@app/lib/i18n';
import { BaseTool } from './BaseTool';
import { createToolRenderer } from './ToolRenderer';

/**
 * `SelfKnowledge` renders as a standard tool row: the Conation mark and a "Self
 * knowledge" label. The about-Conation page it returns is self-reflection the
 * model did, not an action the user needs to inspect, so the result is hidden
 * and the row has no expand toggle.
 */
const handler = createToolRenderer({
  name: 'SelfKnowledge',
  render: (ctx) => (
    <BaseTool
      icon={ConationToolMark}
      renderContext={ctx.renderContext}
      type="call"
    >
      {t('ai.tools.selfKnowledge')}
    </BaseTool>
  ),
});

export const selfKnowledgeHandler = handler;
