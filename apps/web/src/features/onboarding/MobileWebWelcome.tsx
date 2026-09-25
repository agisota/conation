import { useAnalytics } from '@app/lib/analytics/analytics-context';
import LogoIcon from '@icon/macro-logo.svg';
import { A } from '@solidjs/router';
import { createSignal, onMount } from 'solid-js';

interface MobileWebWelcomeProps {
  onSignUp: (email: string) => void;
}

export default function MobileWebWelcome(props: MobileWebWelcomeProps) {
  const analytics = useAnalytics();
  const [email, setEmail] = createSignal('');

  onMount(() => {
    analytics.track('mobile_web_welcome_viewed');
  });

  const handleSignUp = () => {
    props.onSignUp(email());
  };

  return (
    <div class="flex flex-col size-full p-6 overflow-hidden relative">
      <div class="flex flex-col items-start gap-4 w-full max-w-md mx-auto mt-6">
        <LogoIcon class="size-16 text-accent self-center" />
        <h1 class="text-3xl font-semibold text-ink mt-3">Добро пожаловать</h1>
        <p class="text-base text-ink/60 mt-4">
          Единое пространство для работы — чтобы сосредоточиться на главном и
          работать быстрее.
        </p>

        <form
          class="w-full flex flex-col gap-5 mt-10"
          onSubmit={(e) => {
            e.preventDefault();
            handleSignUp();
          }}
        >
          <input
            type="email"
            aria-label="Адрес электронной почты"
            placeholder="name@company.com"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            class="w-full px-3 py-2.5 text-base border border-edge-muted rounded-lg bg-surface text-ink placeholder:text-ink-placeholder outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent"
          />
          <button
            type="submit"
            class="w-full min-h-11 px-3 py-2.5 text-base font-semibold rounded-xs bg-accent text-surface border-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Зарегистрироваться
          </button>
        </form>

        <p class="text-[15px] text-ink/50 mt-20">Уже есть аккаунт?</p>
        <A
          href="/login"
          onClick={() => analytics.track('login_from_onboarding')}
          class="w-full min-h-11 px-3 py-2.5 text-base rounded-xs flex items-center justify-between gap-2 border border-edge-muted bg-transparent text-ink/50 hover:bg-hover/60"
        >
          Войти
        </A>
      </div>
    </div>
  );
}
