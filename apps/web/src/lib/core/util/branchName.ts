import { analytics } from '@app/lib/analytics';
import { toast } from '@core/component/Toast/Toast';
import { t } from '@core/i18n';

import { storageServiceClient } from '@service-storage/client';

export const copyBranchNameToClipboard = async (documentId: string) => {
  const result = await storageServiceClient.getDocumentBranchName({
    documentId,
  });
  if (!result.isOk()) {
    toast.failure(t('core.branchName.copyFailed'));
    return;
  }
  try {
    await navigator.clipboard.writeText(result.value.branchName);
    analytics.track('task_copy_branch_name');
    toast.success(t('core.branchName.copied'));
  } catch {
    toast.failure(t('core.branchName.copyFailed'));
  }
};
