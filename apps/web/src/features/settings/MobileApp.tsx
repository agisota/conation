import { t } from '@app/lib/i18n';
import { SettingsCard, SettingsPage } from './primitives';

export function MobileApp() {
  return (
    <SettingsPage
      title={t('settings.mobile.title')}
      description={t('settings.mobile.description')}
    >
      <SettingsCard>
        <div class="flex flex-col items-center justify-center py-12">
          <p class="text-sm text-ink text-center">
            {t('settings.mobile.availability')}
          </p>
        </div>
      </SettingsCard>
    </SettingsPage>
  );
}
