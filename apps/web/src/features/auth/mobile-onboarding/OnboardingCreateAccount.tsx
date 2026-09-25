import { GOOGLE_GMAIL_IDP } from '@core/auth/email';
import IconGoogle from '@icon/macro-google.svg';
import { useNavigate } from '@solidjs/router';
import { Button } from '@ui';
import { useSsoLogin } from '../useSsoLogin';

/**
 * Onboarding step 0 — create the account by connecting the primary Gmail via
 * SSO sign-in. There is no Continue button here: once the SSO flow completes
 * `useIsAuthenticated()` flips true and `MobileOnboarding` auto-advances to the
 * next step. The escape hatch creates an account without connecting email.
 */
export function OnboardingCreateAccount() {
  const navigate = useNavigate();
  const startSsoLogin = useSsoLogin({ signupMode: true });

  return (
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-4">
        <h1 class="text-2xl font-semibold tracking-tight text-ink">
          Начните работу
        </h1>
        <p class="text-[15px]/relaxed text-ink-muted">
          Подключите Gmail, чтобы синхронизировать письма, контакты и вложения.
        </p>
        <p class="text-[15px]/relaxed text-ink-muted">
          Этот адрес станет основным: вы будете использовать его для входа.
        </p>
      </div>

      <div class="flex flex-col gap-2 pt-2">
        <Button
          variant="strong"
          size="xl"
          onClick={() => startSsoLogin(GOOGLE_GMAIL_IDP)}
        >
          <IconGoogle class="size-5" />
          Подключить Gmail
        </Button>
        <button
          type="button"
          class="min-h-11 self-start pt-2 text-[15px] text-ink-muted/70 underline hover:text-ink/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={() => navigate('/signup')}
        >
          Создать аккаунт без подключения почты
        </button>
      </div>
    </div>
  );
}
