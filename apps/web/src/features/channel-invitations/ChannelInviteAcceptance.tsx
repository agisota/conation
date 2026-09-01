import { t } from '@app/lib/i18n';
import { LoadingBlock } from '@core/component/LoadingBlock';
import { PcNoiseGrid } from '@core/component/PcNoiseGrid';
import { ThrownResultError } from '@core/util/result';
import LogoIcon from '@icon/macro-logo.svg';
import UsersThreeIcon from '@phosphor/users-three.svg';
import { useUserInfo } from '@queries/auth';
import { useJoinChannelByCodeMutation } from '@queries/channel/join-links';
import { useLocation, useNavigate, useSearchParams } from '@solidjs/router';
import { Button, Surface } from '@ui';
import { Match, Switch } from 'solid-js';

export function ChannelInviteAcceptance() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const userInfo = useUserInfo();

  const joinCode = () => {
    const code = searchParams.code;
    return typeof code === 'string' && code.length > 0 ? code : undefined;
  };

  const joinMutation = useJoinChannelByCodeMutation({
    onSuccess() {
      navigate('/', { replace: true });
    },
  });

  function handleLogin() {
    const invitationRoute = `${location.pathname}${location.search}`;
    navigate(`/login?redirect=${encodeURIComponent(invitationRoute)}`);
  }

  function handleJoin() {
    const code = joinCode();
    if (!code) return;
    joinMutation.mutate({ joinCode: code });
  }

  const errorCode = () => {
    const error = joinMutation.error;
    if (!(error instanceof ThrownResultError)) return undefined;
    return error.errors[0]?.code;
  };

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
        <Surface>
          <div class="flex flex-col gap-6 p-6">
            <div class="flex justify-center">
              <LogoIcon class="size-10 text-accent" />
            </div>
            <div class="flex flex-col items-center">
              <Switch>
                <Match when={!joinCode()}>
                  <InvalidInviteLink />
                </Match>
                <Match when={!userInfo()?.authenticated}>
                  <UnauthenticatedView onLogin={handleLogin} />
                </Match>
                <Match when={joinMutation.isPending}>
                  <LoadingBlock />
                </Match>
                <Match when={errorCode() === 'NOT_FOUND'}>
                  <InvalidInviteLink />
                </Match>
                <Match when={joinMutation.isError}>
                  <ServerError onRetry={handleJoin} />
                </Match>
                <Match when={joinCode()}>
                  <JoinConfirmation onJoin={handleJoin} />
                </Match>
              </Switch>
            </div>
          </div>
        </Surface>
      </div>
    </div>
  );
}

function InvalidInviteLink() {
  const navigate = useNavigate();

  return (
    <div class="w-full flex flex-col items-center gap-4 text-center">
      <h2 class="text-lg font-medium text-ink">
        {t('invitations.channel.invalid.title')}
      </h2>
      <p class="text-sm text-ink-muted">
        {t('invitations.channel.invalid.description')}
      </p>
      <Button
        variant="outline"
        size="md"
        class="w-full rounded-xs"
        onClick={() => navigate('/')}
      >
        {t('invitations.common.goHome')}
      </Button>
    </div>
  );
}

function UnauthenticatedView(props: { onLogin: () => void }) {
  return (
    <div class="w-full flex flex-col items-center gap-4 text-center">
      <h2 class="text-lg font-medium text-ink">
        {t('invitations.channel.unauthenticated.title')}
      </h2>
      <p class="text-sm text-ink-muted">
        {t('invitations.channel.unauthenticated.description')}
      </p>
      <Button
        variant="outline"
        size="md"
        class="w-full rounded-xs"
        onClick={props.onLogin}
      >
        {t('invitations.common.signIn')}
      </Button>
    </div>
  );
}

function JoinConfirmation(props: { onJoin: () => void }) {
  return (
    <div class="flex flex-col items-center gap-6 text-center w-full">
      <div class="flex flex-col gap-2">
        <h2 class="flex items-center justify-center gap-2 text-lg font-medium text-ink">
          <UsersThreeIcon class="size-5" />
          {t('invitations.channel.join.title')}
        </h2>
        <p class="text-sm text-ink-muted">
          {t('invitations.channel.join.description')}
        </p>
      </div>
      <Button
        variant="outline"
        size="md"
        class="w-full rounded-xs"
        onClick={props.onJoin}
      >
        {t('invitations.channel.join.submit')}
      </Button>
    </div>
  );
}

function ServerError(props: { onRetry: () => void }) {
  return (
    <div class="w-full flex flex-col items-center gap-4 text-center">
      <h2 class="text-lg font-medium text-ink">
        {t('invitations.channel.error.title')}
      </h2>
      <p class="text-sm text-ink-muted">
        {t('invitations.channel.error.description')}
      </p>
      <Button
        variant="outline"
        size="md"
        class="w-full rounded-xs"
        onClick={props.onRetry}
      >
        {t('common.retry')}
      </Button>
    </div>
  );
}
