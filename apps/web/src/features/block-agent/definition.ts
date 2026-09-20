import { defineBlock, type ExtractLoadType, LoadErrors } from '@core/block';
import { ok } from 'neverthrow';
import { lazy } from 'solid-js';
import {
  isPlaceholderSessionId,
  pendingSession,
} from './context/pending-session';

export const definition = defineBlock({
  name: 'agent',
  description: 'View an agent session',
  component: lazy(() => import('./component/Block')),
  liveTrackingEnabled: false,
  async load(source, _intent) {
    if (source.type === 'dss') {
      // A placeholder is only meaningful to the tab that minted it (see
      // `context/pending-session.ts`). One arriving from anywhere else — a
      // reloaded URL, a restored layout — names a session this tab cannot
      // find, so it is missing rather than merely slow.
      // A spawn that already failed (missing Daytona/OmniRoute, etc.) is
      // the same: never treat the placeholder as a running session.
      if (isPlaceholderSessionId(source.id)) {
        const pending = pendingSession(source.id);
        if (!pending || pending.failed()) {
          return LoadErrors.MISSING;
        }
      }
      return ok({ id: source.id });
    }
    return LoadErrors.MISSING;
  },
  accepted: {},
  // Automations soup tab is still client-only and is not a string in this
  // file; hide/gate it in soup-filter-presets (N03), not on the agent block.
});

export type AgentData = ExtractLoadType<(typeof definition)['load']>;
