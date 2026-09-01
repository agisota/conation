import { t } from '@app/lib/i18n';
import { useAddInboxFlow } from '@core/email-link';
import Caution from '@phosphor/warning.svg';
import { Button } from '@ui';

export function EmailPermissionsBanner() {
  const startAddInbox = useAddInboxFlow();

  return (
    <div class="w-full bg-alert-bg border-y border-alert/20 text-alert-ink p-2">
      <div class="flex items-center gap-4">
        <Caution class="size-8 shrink-0" />
        <div class="flex flex-wrap flex-1 min-w-0 gap-2">
          <div class="text-sm shrink-0">
            {t('core.emailConnection.missing')}
          </div>
          <span class="grow" />
          <Button
            variant="accent"
            size="sm"
            class="px-4"
            onClick={() => void startAddInbox()}
          >
            {t('core.emailConnection.connectGmail')}
          </Button>
        </div>
      </div>
    </div>
  );
}
