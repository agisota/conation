import { useFeatureFlag } from '@app/lib/analytics/posthog';
import {
  ENABLE_CURSOR_AGENTS_FLAG,
  ENABLE_CURSOR_AGENTS_OVERRIDE,
} from '@core/constant/featureFlags';
import type { Accessor } from 'solid-js';

/** Whether the current user may see and use Cursor-agent surfaces. */
export function useCursorAgentsAccess(): Accessor<boolean> {
  const flag = useFeatureFlag(ENABLE_CURSOR_AGENTS_FLAG, {
    enabledOverride: ENABLE_CURSOR_AGENTS_OVERRIDE,
  });
  return () => flag().enabled;
}
