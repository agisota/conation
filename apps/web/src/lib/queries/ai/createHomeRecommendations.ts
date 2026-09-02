import type { Accessor } from 'solid-js';
import {
  buildRecommendationPrompt,
  pickRecommendations,
  recommendationSchema,
} from './homeRecommendations';
import { createAIProjection } from './projection';

// `provider/model` id routed by the projection generator. This is the first
// model in Conation's server-side Rox fallback chain.
const FAST_MODEL = 'rox/gemini-2.5-flash';

/**
 * Fast + smart recommendation projections. The static prompt instructs the
 * agent to gather non-email items through ListNotifications and emails through
 * ListEntities, which preserves each entity type's canonical inbox semantics.
 *
 * Two projections share one prompt and schema and differ only in model: the
 * fast one generates inline for immediate paint; the smart one uses the
 * server default and replaces it when it lands. Both are available to every
 * authenticated user in Conation.
 *
 * Result selection is pure and lives in `homeRecommendations.ts`; this hook
 * only wires it to the projections.
 */
export function createHomeRecommendations(
  args: { enabled?: Accessor<boolean> } = {}
) {
  const enabled = () => args.enabled?.() ?? true;
  const smartEnabled = enabled;

  const fast = createAIProjection(() => ({
    id: 'home/recommended-fast',
    prompt: buildRecommendationPrompt(),
    schema: recommendationSchema,
    model: FAST_MODEL,
    awaitGeneration: true,
    refreshCadence: 'high',
    expiry: 'day',
    enabled: enabled(),
  }));

  const smart = createAIProjection(() => ({
    id: 'home/recommended-smart',
    prompt: buildRecommendationPrompt(),
    schema: recommendationSchema,
    refreshCadence: 'high',
    expiry: 'day',
    enabled: enabled(),
  }));

  const items = () => pickRecommendations(smart.data(), fast.data());

  const retry = async () => {
    if (!enabled()) return;
    const requests = [fast.refresh()];
    if (smartEnabled()) requests.push(smart.refresh());
    await Promise.allSettled(requests);
  };

  return {
    /** Best available items: smart when it has landed, else fast. */
    items,
    /** Smart pass still running — the visible items may improve shortly. */
    isThinking: () => smartEnabled() && smart.isGenerating(),
    /** Nothing to render yet. */
    isLoading: () =>
      enabled() &&
      items() === undefined &&
      (fast.isGenerating() || smart.isGenerating()),
    /** Every enabled projection failed and there is nothing to show. */
    hasError: () =>
      items() === undefined &&
      fast.error() !== undefined &&
      (!smartEnabled() || smart.error() !== undefined),
    retry,
  };
}
