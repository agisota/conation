import { AFTER_SETUP_ROUTE, DEFAULT_ROUTE } from '@app/constants/defaultRoute';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { t } from '@app/lib/i18n';
import { toast } from '@core/component/Toast/Toast';
import { authKeys } from '@queries/auth/keys';
import { useCompleteTutorialMutation } from '@queries/auth/tutorial';
import type { UserInfoData } from '@queries/auth/user-info';
import { queryClient } from '@queries/client';
import { useCompleteOnboardingMutation } from '@queries/onboarding';
import { useNavigate, useSearchParams } from '@solidjs/router';
import { createEffect, createSignal } from 'solid-js';
import { FLOW_NEXT_STORAGE_KEY, FLOW_STEP_STORAGE_KEY } from './shared';

/**
 * The "leave onboarding" workflow: mark onboarding + the legacy tutorial
 * complete, then land in the app (the preserved `?next=` deep link, or
 * the Getting Started checklist). Imports never block the exit;
 * auto-import keeps landing rows server-side.
 */
export function createFlowFinish(options?: {
  /** Extra analytics context stamped onto `onboarding_v4_completed`. */
  completionRollup?: () => {
    emails_connected: number;
    connectors_connected: string[];
  };
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const completeOnboarding = useCompleteOnboardingMutation();
  const completeTutorial = useCompleteTutorialMutation();
  const analytics = useAnalytics();
  const [finishing, setFinishing] = createSignal(false);

  const trackCompleted = (planSkipped: boolean) => {
    analytics.track('onboarding_v4_completed', {
      // Analytics retains the legacy enum for historical dashboards. In
      // Conation this means included access, not a selectable plan.
      plan: 'free',
      plan_skipped: planSkipped,
      emails_connected: 0,
      connectors_connected: [],
      ...options?.completionRollup?.(),
    });
  };

  // Same-app relative paths only. A `next` at the default route is not a
  // real deep link — fall through to the Getting Started checklist.
  const sanitizeNext = (value: unknown): string | undefined =>
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !value.startsWith(DEFAULT_ROUTE)
      ? value
      : undefined;

  // The inbox-OAuth callback returns to bare /onboarding — persist the
  // deep link so it survives the round-trip.
  createEffect(() => {
    const next = sanitizeNext(searchParams.next);
    if (next) sessionStorage.setItem(FLOW_NEXT_STORAGE_KEY, next);
  });

  const afterTarget = () =>
    sanitizeNext(searchParams.next) ??
    sanitizeNext(sessionStorage.getItem(FLOW_NEXT_STORAGE_KEY)) ??
    AFTER_SETUP_ROUTE;

  /**
   * Mark the flow complete and verify it stuck: NewOnboardingRedirect keys
   * off tutorialComplete, so navigating before the cache reflects the PATCH
   * would bounce straight back here.
   */
  const completeFlow = async (): Promise<boolean> => {
    const [onboardingResult] = await Promise.allSettled([
      completeOnboarding.mutateAsync({ skipped: false }),
      completeTutorial.mutateAsync(),
    ]);
    // Exiting with the row still active would leave staged candidates
    // undiscarded and the flow resumable after the user thinks it's done.
    if (onboardingResult.status === 'rejected') {
      toast.failure(t('setup.errors.finishFailed'));
      return false;
    }
    await queryClient
      .refetchQueries({ queryKey: authKeys.userInfo.queryKey })
      .catch(() => {});
    // Read the cache, not the query observer: observer stores flush on a
    // scheduled task, so right after the await they still hold the
    // pre-PATCH value and the guard would fail on a fresh success.
    const userInfo = queryClient.getQueryData<UserInfoData>(
      authKeys.userInfo.queryKey
    );
    if (userInfo?.tutorialComplete !== true) {
      toast.failure(t('setup.errors.finishFailed'));
      return false;
    }
    sessionStorage.removeItem(FLOW_STEP_STORAGE_KEY);
    sessionStorage.removeItem(FLOW_NEXT_STORAGE_KEY);
    return true;
  };

  /** Finish the included-access step and enter the app. */
  const finish = async (planSkipped = false) => {
    if (finishing()) return;
    setFinishing(true);
    try {
      if (await completeFlow()) {
        trackCompleted(planSkipped);
        navigate(afterTarget(), { replace: true });
      }
    } finally {
      setFinishing(false);
    }
  };

  return {
    finishing,
    finish,
    afterTarget,
  };
}
