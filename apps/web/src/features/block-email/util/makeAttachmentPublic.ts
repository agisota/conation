import { analytics } from '@app/lib/analytics';
import { t } from '@app/lib/i18n';
import { Telemetry } from '@conation/observability';
import { toast } from '@core/component/Toast/Toast';

import { storageServiceClient } from '@service-storage/client';

export const makeAttachmentPublic = async (attachmentId: string) => {
  const permissions = await storageServiceClient.getDocumentPermissions({
    document_id: attachmentId,
  });
  if (
    !permissions.isErr() &&
    permissions.value.linkShare === 'PUBLIC' &&
    permissions.value.linkShareAccessLevel === 'view'
  ) {
    return;
  }

  const result = await storageServiceClient.editDocument({
    documentId: attachmentId,
    sharePermission: {
      linkShare: 'PUBLIC',
      linkShareAccessLevel: 'view',
    },
  });
  if (!result.isErr()) {
    toast.success(t('blockEmail.attachments.shared'), {
      subtext: t('blockEmail.attachments.sharedDescription'),
    });
    analytics.track('share_entity', {
      entityType: 'email_attachment',
      entityId: attachmentId,
      shareMethod: 'attachment_public',
      accessLevel: 'view',
    });
  } else {
    toast.alert(t('blockEmail.attachments.shareWarning'), {
      subtext: t('blockEmail.attachments.shareWarningDescription'),
    });
    Telemetry.error('Failed to make attachment public', {
      errors: JSON.stringify(result.error),
    });
  }
};
