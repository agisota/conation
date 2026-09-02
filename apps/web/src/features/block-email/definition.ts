import { t } from '@app/lib/i18n';
import { defineBlock, LoadErrors } from '@core/block';
import { ok } from 'neverthrow';
import EmailBlock from './component/Block';

export const definition = defineBlock({
  name: 'email',
  get description() {
    return t('blockEmail.description');
  },
  component: EmailBlock,
  liveTrackingEnabled: true,
  syncServiceEnabled: false,
  get defaultFilename() {
    return t('blockEmail.noSubject');
  },

  // The thread itself is fetched by the block component (useThreadQuery),
  // which owns loading, offline fallback, and error states — see Block.tsx.
  async load(source) {
    if (source.type === 'dss') {
      return ok({ id: source.id });
    }
    return LoadErrors.INVALID;
  },
  accepted: {},
});
