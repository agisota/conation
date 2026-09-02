import { useIsAuthenticated } from '@core/auth';
import { useEmail } from '@core/context/user';
import { t } from '@core/i18n';
import NoAccessGraphic from '@design/empty-state-no-access.svg';
import { EmptyStatePanel } from '@ui';
import { onMount } from 'solid-js';
import { openLoginModal } from '../TopBar/LoginButton';

/**
 * @description This is the view for when a user tries to access an item that returns a 401 indicating they do not have permission to access it.
 */
export default function Unauthorized() {
  const currentUserEmail = useEmail();

  const isAuthenticated = useIsAuthenticated();
  onMount(() => {
    if (!isAuthenticated()) {
      openLoginModal();
    }
  });

  return (
    <EmptyStatePanel
      centered
      graphic={NoAccessGraphic}
      graphicClass="mb-6"
      title={t('core.access.unauthorizedTitle')}
      description={
        currentUserEmail()
          ? t('core.access.signedInAs', { email: currentUserEmail()! })
          : undefined
      }
    />
  );
}
