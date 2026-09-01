import { t } from '@app/lib/i18n';
import AppStoreQr from '@design/app-store.svg';
import { SettingsCard, SettingsPage } from './primitives';

export function MobileApp() {
  return (
    <SettingsPage
      title={t('settings.mobile.title')}
      description={t('settings.mobile.description')}
    >
      <SettingsCard>
        <div class="flex flex-col items-center justify-center gap-6 py-12">
          <AppStoreQr style="display: block; max-width: 280px;" />
          <p class="text-sm text-ink text-center">
            {t('settings.mobile.downloadOn')}
            <br />
            <a
              href="https://apps.apple.com/us/app/macro-app/id6743133649"
              rel="noopener noreferrer"
              class="text-link hover:text-link-hover visited:text-link-visited hover:underline"
              target="_blank"
            >
              {t('settings.mobile.appStore')}
            </a>
          </p>
        </div>
      </SettingsCard>
    </SettingsPage>
  );
}
