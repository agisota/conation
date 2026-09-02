import { t } from '@app/lib/i18n';
import { Telemetry } from '@conation/observability';

import ResetIcon from '@phosphor/arrow-clockwise.svg';
import HomeIcon from '@phosphor/house.svg';
import { Button, Dialog, Surface } from '@ui';
import { Show } from 'solid-js';

interface FatalErrorProps {
  error?: Error;
  reset?: () => void;
}

export function FatalError(props: FatalErrorProps) {
  Telemetry.error(props.error || 'Unknown error', {
    url: window.location.href,
  });

  return (
    <Dialog open position="center" class="w-120">
      <Surface depth={2} class="rounded-xl bg-surface">
        <div class="p-6 sm:p-8 font-sans">
          <div class="text-center">
            <h1 class="text-ink text-lg/7 font-semibold mb-4">
              {t('shell.error.fatalTitle')}
            </h1>

            <Show when={props.error} keyed>
              {(error) => (
                <div class="mb-6 p-3 bg-failure-bg border border-edge rounded text-left">
                  <p class="text-sm text-failure-ink font-mono break-all">
                    {error.message || error.toString()}
                  </p>
                </div>
              )}
            </Show>

            <p class="text-ink-muted text-sm mb-6">
              {t('shell.error.fatalDescription')}
            </p>

            <div class="flex flex-row gap-3 justify-center">
              <Button
                variant="accent"
                onClick={() => {
                  window.location.href = window.location.origin + '/app';
                }}
              >
                <HomeIcon class="size-4" />
                {t('shell.navigation.home')}
              </Button>
              <Button variant="outline" onClick={props.reset}>
                <ResetIcon class="size-4" />
                {t('shell.actions.tryAgain')}
              </Button>
            </div>
          </div>
        </div>
      </Surface>
    </Dialog>
  );
}
