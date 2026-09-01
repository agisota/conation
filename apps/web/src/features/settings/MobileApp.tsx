import AppStoreQr from '@design/app-store.svg';
import { t } from '@app/lib/i18n';
import { SettingsCard, SettingsPage } from './primitives';

export function MobileApp() {
  return (
    <SettingsPage
      title={t('auto.mobile_app')}
      description="Scan the code to get Macro on your phone."
    >
      <SettingsCard>
        <div class="flex flex-col items-center justify-center gap-6 py-12">
          <AppStoreQr style="display: block; max-width: 280px;" />
          <p class="text-sm text-ink text-center">{t('auto.download_on_the')}<br />
            <a
              href="https://apps.apple.com/us/app/macro-app/id6743133649"
              rel="noopener noreferrer"
              class="text-link hover:text-link-hover visited:text-link-visited hover:underline"
              target="_blank"
            >{t('auto.app_store')}</a>
          </p>
        </div>
      </SettingsCard>
    </SettingsPage>
  );
}
