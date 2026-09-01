import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { t } from '@app/lib/i18n';
import { PcNoiseGrid } from '@core/component/PcNoiseGrid';
import LogoIcon from '@icon/macro-logo.svg';
import { useNavigate } from '@solidjs/router';
import { Button, Surface } from '@ui';
import { onMount } from 'solid-js';

/**
 * Native-mobile entry screen shown to unauthenticated users (via `/welcome`).
 * Routes new users into the mobile onboarding wizard and existing users to the
 * standard Login screen.
 */
export function MobileAuthWelcome() {
  const navigate = useNavigate();
  const analytics = useAnalytics();

  onMount(() => {
    analytics.pageView('mobile_auth_welcome');
  });

  return (
    <div class="flex items-center justify-center size-full p-8 overflow-hidden relative">
      <div class="inset-0 absolute text-edge bg-surface opacity-10 -z-1">
        <PcNoiseGrid
          cellSize={30}
          warp={0}
          crunch={0.2}
          freq={0.001}
          size={[0, 0.3]}
          rounding={0}
          fill={0}
          stroke={1}
          speed={[0.017, 0.209]}
        />
      </div>

      <div class="w-full max-w-105">
        <Surface depth={1}>
          <div class="flex flex-col items-center gap-2 py-10">
            <LogoIcon class="size-20 text-ink" />
            <div class="text-lg font-medium">{t('auto.welcome_to_macro')}</div>
          </div>
          <div class="flex flex-col gap-3 px-8 pb-8">
            <Button
              variant="strong"
              size="xl"
              onClick={() => navigate('/onboarding')}
            >{t('auto.create_new_account')}</Button>
            <Button
              size="xl"
              class="border border-edge-muted"
              onClick={() => navigate('/login')}
            >{t('auto.log_into_existing_account')}</Button>
          </div>
        </Surface>
      </div>
    </div>
  );
}
