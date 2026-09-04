import { t } from '@app/lib/i18n';
import { useAddInboxFlow } from '@core/email-link';
import Caution from '@phosphor/warning.svg';
import { useEmailLinksQuery } from '@queries/email/link';
import { UserProvider } from '@service-email/generated/schemas/userProvider';
import { Button } from '@ui';
import { createMemo, Show } from 'solid-js';

export function EmailPermissionsBanner() {
  const startAddInbox = useAddInboxFlow();
  const linksQuery = useEmailLinksQuery();
  // Gmail is optional. A Conation mailbox (Stalwart) already linked must not
  // be treated as a missing-email state that demands Connect Gmail.
  const hasStalwartLink = createMemo(() =>
    (linksQuery.data?.links ?? []).some(
      (link) => link.provider === UserProvider.STALWART
    )
  );

  return (
    <Show when={!hasStalwartLink()}>
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
    </Show>
  );
}
