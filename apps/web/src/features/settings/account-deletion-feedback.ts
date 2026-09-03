import type {
  AccountDeletionReason,
  AppEvents,
} from '@app/lib/analytics/app-events';

export const ACCOUNT_DELETION_FEEDBACK_MAX_LENGTH = 500;

export const ACCOUNT_DELETION_REASON_OPTIONS: ReadonlyArray<{
  value: AccountDeletionReason;
  labelKey: `settings.account.delete.reason.${string}`;
}> = [
  {
    value: 'not_using_enough',
    labelKey: 'settings.account.delete.reason.notUsingEnough',
  },
  {
    value: 'missing_features',
    labelKey: 'settings.account.delete.reason.missingFeatures',
  },
  {
    value: 'difficult_to_use',
    labelKey: 'settings.account.delete.reason.difficultToUse',
  },
  {
    value: 'bugs_or_performance',
    labelKey: 'settings.account.delete.reason.bugsOrPerformance',
  },
  {
    value: 'too_expensive',
    labelKey: 'settings.account.delete.reason.tooExpensive',
  },
  {
    value: 'prefer_another_product',
    labelKey: 'settings.account.delete.reason.preferAnotherProduct',
  },
  {
    value: 'privacy_or_security_concerns',
    labelKey: 'settings.account.delete.reason.privacyOrSecurity',
  },
  {
    value: 'other',
    labelKey: 'settings.account.delete.reason.other',
  },
];

export function buildAccountDeletionFeedbackPayload(
  reason: AccountDeletionReason | undefined,
  feedback: string
): AppEvents['account_deletion_feedback'] {
  const normalizedFeedback = feedback
    .trim()
    .slice(0, ACCOUNT_DELETION_FEEDBACK_MAX_LENGTH);

  return {
    reason: reason ?? 'not_provided',
    ...(normalizedFeedback ? { feedback: normalizedFeedback } : {}),
  };
}

export async function performAccountDeletion(dependencies: {
  captureFeedback: () => void;
  deleteUser: () => Promise<{ isErr: () => boolean }>;
  logout: () => Promise<void>;
}): Promise<boolean> {
  dependencies.captureFeedback();

  const result = await dependencies.deleteUser();
  if (result.isErr()) return false;

  await dependencies.logout();
  return true;
}
