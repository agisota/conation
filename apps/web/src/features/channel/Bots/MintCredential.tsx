import { t } from '@app/lib/i18n';
import { toast } from '@core/component/Toast/Toast';
import { useCreateBotTokenMutation } from '@queries/bots/bots';
import { Button } from '@ui';
import { createSignal, type JSX, Show } from 'solid-js';
import { CredentialField } from './CredentialField';

export function useMintBotToken() {
  const createToken = useCreateBotTokenMutation();
  const [token, setToken] = createSignal<string>();

  const mint = (vars: {
    botId: string;
    label?: string;
    expiresAt?: string;
  }) => {
    if (createToken.isPending) return;
    createToken.mutate(vars, {
      onSuccess: ({ bearer_token }) => setToken(bearer_token),
      onError: () => toast.failure(t('channel.bots.tokenDialog.failed')),
    });
  };

  return {
    token,
    mint,
    isPending: () => createToken.isPending,
    reset: () => setToken(undefined),
  };
}

export function MintCredential(props: {
  minted?: ReturnType<typeof useMintBotToken>;
  botId: string;
  label?: string | null;
  expiresAt?: string | null;
  fieldLabel?: string;
  fieldHelp?: string;
  description?: string;
  fallback?: (api: { mint: () => void; isPending: boolean }) => JSX.Element;
  afterToken?: JSX.Element;
}) {
  const minted = props.minted ?? useMintBotToken();
  const mint = () =>
    minted.mint({
      botId: props.botId,
      label: props.label ?? undefined,
      expiresAt: props.expiresAt ?? undefined,
    });

  return (
    <Show
      when={minted.token()}
      fallback={
        props.fallback?.({ mint, isPending: minted.isPending() }) ?? (
          <div class="flex flex-col gap-2">
            <p class="text-xs text-ink-muted">
              {props.description ?? t('channel.bots.tokenDialog.description')}
            </p>
            <div>
              <Button
                type="button"
                variant="cta"
                size="sm"
                disabled={minted.isPending()}
                onClick={mint}
              >
                {minted.isPending()
                  ? t('channel.bots.tokenDialog.creating')
                  : t('channel.bots.tokenDialog.create')}
              </Button>
            </div>
          </div>
        )
      }
    >
      {(rawToken) => (
        <div class="flex flex-col gap-5">
          <CredentialField
            label={
              props.fieldLabel ?? t('channel.bots.tokenDialog.bearerToken')
            }
            value={rawToken()}
            help={
              props.fieldHelp ?? t('channel.bots.tokenDialog.visibilityHelp')
            }
          />
          {props.afterToken}
        </div>
      )}
    </Show>
  );
}
