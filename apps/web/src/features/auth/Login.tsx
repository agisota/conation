import { ConationLockup } from '@app/components/brand';
import { OnboardingFlow } from '@app/features/setup/flow/OnboardingFlow';
import { NoiseBackground } from '@app/features/setup/flow/shared';
import { useOnboardingV4Flag } from '@app/features/setup/flow/useOnboardingV4Flag';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { LocaleSelect, t } from '@app/lib/i18n';
import { GOOGLE_GMAIL_IDP } from '@core/auth/email';
import { getConfiguredClientProfile } from '@core/constant/clientProfile';
import { LoadingBlock } from '@core/component/LoadingBlock';
import { toast } from '@core/component/Toast/Toast';
import { useEmailLinks } from '@core/email-link';
import { isMobile } from '@core/mobile/isMobile';
import { isNativeMobilePlatform } from '@core/mobile/isNativeMobilePlatform';
import { virtualKeyboardVisible } from '@core/mobile/virtualKeyboard';
import { debouncedDependent } from '@core/util/debounce';
import { unsetTokenPromise } from '@core/util/fetchWithToken';
import { unsetConationApiTokenPromise } from '@service-auth/fetch';
import { getNativeMobilePlatform } from '@core/util/platform';
import IconApple from '@icon/conation-apple.svg';
import IconGoogle from '@icon/conation-google.svg';
import ArrowLeft from '@phosphor/arrow-left.svg';
import ArrowRight from '@phosphor/arrow-right.svg';
import { useUserInfo } from '@queries/auth';
import {
  invalidateAllAfterLogin,
  useUserInfoQuery,
} from '@queries/auth/user-info';
import { authServiceClient } from '@service-auth/client';
import {
  action,
  useAction,
  useNavigate,
  useSearchParams,
  useSubmission,
} from '@solidjs/router';
import { Button } from '@ui';
import { Stepper } from '@ui/components/Stepper';
import { detect } from 'detect-browser';
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  Show,
  Suspense,
  untrack,
} from 'solid-js';
import { match } from 'ts-pattern';
import {
  autoLoginCode,
  sendEmailCode,
  sentEmailCode,
  useResetEmailCode,
} from './EmailForm';
import {
  clearSignupMailboxLocal,
  peekSignupMailboxLocal,
  rememberSignupMailboxLocal,
  checkMailboxAvailable,
} from './signup-antibot';
import { OtpInput } from './OtpInput';
import { Stage } from './Shared';
import { useSsoLogin } from './useSsoLogin';

function PostLoginRedirect() {
  const navigate = useNavigate();

  // Login init is owned by the per-method handlers (the session-token effect and
  // onComplete); this redirect only navigates, so login doesn't fire init twice.
  onMount(() => {
    navigate('/', { replace: true });
  });

  return <LoadingBlock />;
}

/**
 * Where login and onboarding meet: once authenticated, first-time desktop
 * users continue straight into the onboarding steps IN PLACE — same page,
 * no redirect — while everyone else proceeds into the app. This keeps
 * /login a single surface that decides what the user needs next.
 */
function PostAuthGate() {
  const userInfoQuery = useUserInfoQuery();
  const onboardingV4 = useOnboardingV4Flag();

  const isFirstTimeDesktopUser = () =>
    !isMobile() &&
    !isNativeMobilePlatform() &&
    userInfoQuery.data?.authenticated === true &&
    userInfoQuery.data.tutorialComplete === false;

  const needsOnboarding = () =>
    onboardingV4().enabled && isFirstTimeDesktopUser();

  // Don't redirect into the app while the gate is still unknown: a first-time
  // user would land on home for a beat and then get yanked to /onboarding.
  const waitingOnFlag = () =>
    onboardingV4().loading && isFirstTimeDesktopUser();

  return (
    <Suspense fallback={<LoadingBlock />}>
      <Show when={userInfoQuery.data} fallback={<LoadingBlock />}>
        <Show when={!waitingOnFlag()} fallback={<LoadingBlock />}>
          <Show when={needsOnboarding()} fallback={<PostLoginRedirect />}>
            <OnboardingFlow />
          </Show>
        </Show>
      </Show>
    </Suspense>
  );
}

function LoginPicker(props: {
  setStage: (next: Stage) => void;
  signupMode?: boolean;
}) {
  const analytics = useAnalytics();
  const startSsoLogin = useSsoLogin({ signupMode: props.signupMode });
  const [mailboxDraft, setMailboxDraft] = createSignal('');
  // Apple sign-in is iOS-only: it's required there for App Store review,
  // and intentionally absent on desktop.
  const showApple = getNativeMobilePlatform() === 'ios';
  // Standalone/self-host has no Google IdP; the button only 500s.
  const showGoogle = getConfiguredClientProfile() !== 'standalone';

  const continueWithEmail = () => {
    if (props.signupMode) {
      rememberSignupMailboxLocal(mailboxDraft());
      analytics.track('sign_up_click', { method: 'email' });
    }
    props.setStage(Stage.Email);
  };

  const startSso = (idp: string) => {
    void startSsoLogin(idp, { mailboxLocal: mailboxDraft() });
  };

  return (
    <div class="flex flex-col gap-3">
      <Show when={props.signupMode}>
        <FormInput
          id="mailbox_local"
          type="text"
          placeholder={t('auth.mailbox.localPlaceholder')}
          required={false}
          autoFocus={false}
          value={mailboxDraft()}
          onInput={setMailboxDraft}
        />
        <p class="text-xs text-ink-muted leading-snug">{t('auth.mailbox.hint')}</p>
      </Show>
      <Show when={showGoogle}>
        <Button
          variant="cta"
          size="xl"
          autofocus
          onClick={() => startSso(GOOGLE_GMAIL_IDP)}
        >
          <IconGoogle class="size-fit" />
          {t('auth.methods.continueWithGoogle')}
        </Button>
      </Show>

      <Show when={showApple}>
        <Button
          variant="outline"
          size="xl"
          class="bg-surface"
          onClick={() => startSso('Apple')}
        >
          <IconApple class="size-fit" />
          {t('auth.methods.continueWithApple')}
        </Button>
      </Show>

      <Button
        variant={showGoogle ? 'outline' : 'cta'}
        size="xl"
        class={showGoogle ? 'bg-surface' : undefined}
        autofocus={!showGoogle}
        onClick={continueWithEmail}
      >
        {t('auth.methods.continueWithEmail')}
      </Button>
    </div>
  );
}

function FormInput(props: {
  id: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  value?: string;
  autoFocus?: boolean;
  onInput?: (value: string) => void;
}) {
  let inputEl: HTMLInputElement | undefined;
  onMount(() => {
    if (props.autoFocus === false) return;
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    // The Stepper's outin Transition resolves this step's JSX (firing onMount)
    // before attaching it to the document, so the input is still detached
    // here. Poll until it's connected, then focus.
    const focusWhenConnected = () => {
      if (cancelled || !inputEl) return;
      if (inputEl.isConnected) inputEl.focus({ preventScroll: true });
      else requestAnimationFrame(focusWhenConnected);
    };
    focusWhenConnected();
  });
  return (
    <input
      ref={(el) => (inputEl = el)}
      id={props.id}
      name={props.id}
      type={props.type ?? 'text'}
      placeholder={props.placeholder}
      value={props.value ?? ''}
      required={props.required ?? true}
      autocomplete={props.id}
      onInput={(event) => props.onInput?.(event.currentTarget.value)}
      class="ln-input w-full px-4 py-3 rounded-lg border border-edge bg-surface text-sm text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none transition-colors user-invalid:border-failure"
    />
  );
}

function FormError(props: { msg?: string }) {
  return (
    <Show when={props.msg}>
      <p role="alert" class="text-xs text-failure leading-snug">
        {props.msg}
      </p>
    </Show>
  );
}

function EmailFormNew(props: {
  setStage: (next: Stage) => void;
  onBack: () => void;
  signupMode?: boolean;
}) {
  const [isPasswordLogin, setIsPasswordLogin] = createSignal(false);
  const [mailboxDraft, setMailboxDraft] = createSignal(
    peekSignupMailboxLocal() ?? ''
  );
  const [mailboxStatus, setMailboxStatus] = createSignal<
    'idle' | 'checking' | 'ok' | 'taken' | 'invalid'
  >('idle');
  const [mailboxHint, setMailboxHint] = createSignal<string>();
  const mailboxQuery = debouncedDependent(mailboxDraft, 400);
  const submission = useSubmission(sendEmailCode);
  const send = useAction(sendEmailCode);
  const [searchParams] = useSearchParams();
  const searchParamsEmail = untrack(() => {
    const email = searchParams.email;
    if (typeof email === 'string') return email;
  });

  // Dev builds auto-start the flow for `?email=` links (the seeder prints
  // them per persona); combined with the local backend returning the code,
  // opening the link logs straight in.
  createEffect(() => {
    if (
      import.meta.env.DEV &&
      searchParamsEmail &&
      !submission.pending &&
      !submission.result &&
      !submission.error
    ) {
      const formData = new FormData();
      formData.append('email', searchParamsEmail);
      send(formData);
    }
  });

  createEffect(() => {
    if (sentEmailCode(submission.result)) {
      props.setStage(Stage.Verify);
    } else if (submission.result === 'isPasswordLogin') {
      setIsPasswordLogin(true);
    } else if (submission.result === 'LoggedIn') {
      props.setStage(Stage.Done);
    }
  });

  createEffect(() => {
    const local = mailboxQuery().trim();
    if (!props.signupMode || !local) {
      setMailboxStatus('idle');
      setMailboxHint();
      return;
    }
    let cancelled = false;
    setMailboxStatus('checking');
    setMailboxHint();
    void checkMailboxAvailable(local)
      .then((result) => {
        if (cancelled) return;
        if (result.available) {
          setMailboxStatus('ok');
          setMailboxHint(t('auth.mailbox.available', { mailbox: result.mailbox }));
        } else {
          setMailboxStatus('taken');
          setMailboxHint(
            result.suggestion
              ? t('auth.mailbox.takenSuggestion', {
                  mailbox: result.mailbox,
                  suggestion: result.suggestion,
                })
              : t('auth.errors.mailboxTaken', { mailbox: result.mailbox })
          );
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : '';
        if (message === 'invalid') {
          setMailboxStatus('invalid');
          setMailboxHint(t('auth.mailbox.invalid'));
          return;
        }
        setMailboxStatus('idle');
        setMailboxHint();
      });
    onCleanup(() => {
      cancelled = true;
    });
  });

  return (
    <form
      action={sendEmailCode}
      method="post"
      noValidate={false}
      class="flex flex-col gap-3"
    >
      <p class="text-xs text-ink-muted leading-snug">
        {t('auth.email.verificationHint')}
      </p>
      <FormInput
        id="email"
        type="email"
        placeholder={t('auth.email.placeholder')}
        value={searchParamsEmail}
      />
      <Show when={props.signupMode}>
        <FormInput
          id="mailbox_local"
          type="text"
          placeholder={t('auth.mailbox.localPlaceholder')}
          required={false}
          autoFocus={false}
          value={mailboxDraft()}
          onInput={setMailboxDraft}
        />
        <p
          class="text-xs leading-snug"
          classList={{
            'text-success': mailboxStatus() === 'ok',
            'text-failure':
              mailboxStatus() === 'taken' || mailboxStatus() === 'invalid',
            'text-ink-muted':
              mailboxStatus() === 'idle' || mailboxStatus() === 'checking',
          }}
          aria-live="polite"
        >
          {mailboxStatus() === 'checking'
            ? t('auth.mailbox.checking')
            : mailboxHint() || t('auth.mailbox.hint')}
        </p>
      </Show>
      <Show when={isPasswordLogin()}>
        <FormInput
          id="password"
          type="password"
          placeholder={t('auth.password.placeholder')}
          required={isPasswordLogin()}
        />
      </Show>
      <FormError msg={submission.error?.message} />
      <Button
        variant="cta"
        size="xl"
        type="submit"
        disabled={submission.pending}
      >
        {t('auth.actions.continue')}
        <ArrowRight class="size-5" />
      </Button>
      <Button
        variant="outline"
        size="xl"
        class="bg-surface"
        onClick={props.onBack}
      >
        <ArrowLeft class="size-5" />
        {t('auth.actions.backToSignIn')}
      </Button>
    </form>
  );
}

const verifyCode = action(async (formData: FormData) => {
  const code = formData.get('one-time-code');
  if (typeof code !== 'string') throw new Error(t('auth.errors.invalidCode'));
  const email = formData.get('email');
  if (typeof email !== 'string') throw new Error(t('auth.errors.invalidEmail'));

  const result = await authServiceClient.passwordlessCallback({ code, email });
  if (result.isErr()) {
    if (result.error.some((err) => err.code === 'UNAUTHORIZED')) {
      throw new Error(t('auth.errors.invalidCode'));
    }
    throw new Error(t('auth.errors.verificationFailed'));
  }

  return true;
}, 'verify-code-login-new');

const RESEND_TIMER = 45;

function VerifyFormNew(props: {
  setStage: (next: Stage) => void;
  onBack: () => void;
}) {
  const [code, setCode] = createSignal('');
  const [resendError, setResendError] = createSignal<string>();
  const [showResendCode, setShowResendCode] = createSignal(false);
  const [resendTimer, setResendTimer] = createSignal(RESEND_TIMER);
  const submission = useSubmission(verifyCode);
  const emailSubmission = useSubmission(sendEmailCode);
  const resend = useAction(sendEmailCode);
  const submit = useAction(verifyCode);

  const email = () => {
    const value = emailSubmission.input?.[0].get('email');
    return typeof value === 'string' ? value : undefined;
  };

  // Local backends return the code with the email step; submit it
  // automatically so seeded persona logins are one click.
  createEffect(() => {
    const code = autoLoginCode(emailSubmission.result);
    const submittedEmail = email();
    if (
      code &&
      submittedEmail &&
      !submission.pending &&
      !submission.result &&
      !submission.error
    ) {
      const formData = new FormData();
      formData.append('email', submittedEmail);
      formData.append('one-time-code', code);
      submit(formData);
    }
  });

  createEffect(() => {
    if (!showResendCode()) {
      const timer = setTimeout(() => {
        setResendTimer(0);
        setShowResendCode(true);
      }, RESEND_TIMER * 1000);
      const pTimer = setInterval(
        () => setResendTimer((t) => (t > 0 ? t - 1 : 0)),
        1000
      );
      onCleanup(() => {
        clearTimeout(timer);
        clearInterval(pTimer);
      });
    }
  });

  const handleResendCode = async () => {
    const submittedEmail = email();
    if (!submittedEmail) {
      setResendError(t('auth.errors.emailUnavailable'));
      return;
    }
    submission.clear();
    setResendError();
    setResendTimer(RESEND_TIMER);
    setShowResendCode(false);
    const formData = new FormData();
    formData.append('email', submittedEmail);
    try {
      await resend(formData);
    } catch (e) {
      console.error(e);
      setResendTimer(0);
      setShowResendCode(true);
      setResendError(
        e instanceof Error ? e.message : t('auth.errors.resendFailed')
      );
    }
  };

  createEffect(() => {
    if (submission.result) {
      props.setStage(Stage.Done);
      const url = new URL(window.location.href);
      const sp = new URLSearchParams(url.search);
      const referral = sp.get('referral');
      if (referral) window.location.href = `/app?referral=${referral}`;
    }
  });

  let formEl: HTMLFormElement | undefined;

  return (
    <form
      ref={formEl}
      action={verifyCode}
      method="post"
      class="flex flex-col gap-3"
    >
      <input type="hidden" name="email" value={email() ?? ''} />
      <input type="hidden" name="one-time-code" value={code()} />
      <p class="text-xs text-ink-muted leading-snug">
        {t('auth.verify.instructions', { email: email() ?? '' })}
      </p>
      <OtpInput
        value={code()}
        disabled={submission.pending}
        onInput={setCode}
        onComplete={(value) => {
          const submittedEmail = email();
          if (!submittedEmail) return;
          const formData = new FormData(formEl);
          formData.set('email', submittedEmail);
          formData.set('one-time-code', value);
          submit(formData);
        }}
      />
      <p class="text-center text-xs text-ink-muted" aria-live="polite">
        {t('auth.verify.didNotReceiveCode')}{' '}
        <button
          type="button"
          onClick={handleResendCode}
          disabled={
            emailSubmission.pending ||
            submission.pending ||
            !showResendCode() ||
            !email()
          }
          class="font-medium text-ink transition-colors hover:text-ink-muted disabled:text-ink-extra-muted"
        >
          <Show when={resendTimer() > 0} fallback={t('auth.actions.resend')}>
            {t('auth.actions.resendCountdown', { seconds: resendTimer() })}
          </Show>
        </button>
      </p>
      <FormError msg={submission.error?.message ?? resendError()} />
      {/* The visible pattern-validated input is gone (the code lives in a
          hidden field, which browsers exempt from constraint validation), so
          gate submission here instead of round-tripping partial codes. */}
      <Button
        variant="cta"
        size="xl"
        type="submit"
        disabled={submission.pending || code().length !== 6 || !email()}
      >
        {t('auth.actions.verify')}
        <ArrowRight class="size-5" />
      </Button>
      <Button
        variant="outline"
        size="xl"
        class="bg-surface"
        onClick={props.onBack}
      >
        <ArrowLeft class="size-5" />
        {t('auth.actions.changeEmail')}
      </Button>
    </form>
  );
}

export function Login(props: { signupMode?: boolean }) {
  const [searchParams] = useSearchParams();
  const [stage, setStage] = createSignal(
    searchParams.email ? Stage.Email : Stage.None
  );
  const userInfo = useUserInfo();
  const { initEmailLink, query: emailLinks } = useEmailLinks();
  const analytics = useAnalytics();
  const authenticatedUserId = createMemo(() => {
    const user = userInfo();
    return user?.authenticated ? user.id : undefined;
  });

  onMount(() => {
    analytics.pageView(props.signupMode ? 'signup' : 'login');
  });

  const identifyUser = () => {
    const user = userInfo();

    if (!user || !user.authenticated) return;

    const platform = detect(navigator.userAgent);
    analytics.identify(user.id, {
      email: user.email,
      os: platform?.os?.replaceAll(' ', ''),
    });
  };

  const initMailboxOnLogin = async () => {
    const standalone = getConfiguredClientProfile() === 'standalone';
    await initEmailLink({ localPart: peekSignupMailboxLocal() }).match(
      async () => {
        clearSignupMailboxLocal();
        if (!standalone) return;
        const result = await emailLinks.refetch();
        const mailbox = result.data?.links[0]?.email_address;
        if (mailbox) {
          toast.success(t('auth.mailbox.created', { email: mailbox }));
        }
      },
      (err) => {
        if (err.tag === 'AlreadyInitialized' || err.tag === 'MailboxTaken') {
          if (err.tag === 'MailboxTaken') clearSignupMailboxLocal();
          return;
        }
        console.error('Failed to init email link on login', err);
        // Standalone stacks often have no Stalwart. A failed mailbox
        // must not look like a failed login — getting-started can retry.
      }
    );
  };

  createEffect(
    on(authenticatedUserId, (userId) => {
      if (userId) identifyUser();
    })
  );

  createEffect(() => {
    // token may be an array if the redirect URL contained duplicate token params;
    // take the last one as it is the most recently appended by the auth service
    const rawToken = searchParams.token;
    const session_code = Array.isArray(rawToken)
      ? rawToken[rawToken.length - 1]
      : rawToken;
    if (session_code && typeof session_code === 'string') {
      authServiceClient.sessionLogin({ session_code }).then(async (res) => {
        if (res.isOk()) {
          // Reset token state only after the session cookies have actually
          // changed — resetting before sessionLogin opens a window where a
          // visibility-triggered refresh re-latches under the new generation.
          unsetTokenPromise();
          unsetConationApiTokenPromise();
          await invalidateAllAfterLogin();
          await initMailboxOnLogin();
        } else {
          console.error('Failed to redeem session code', res.error);
          toast.failure(t('auth.errors.signInFailed'));
        }
      });
    }
  });

  const onComplete = async () => {
    unsetTokenPromise();
    unsetConationApiTokenPromise();
    await invalidateAllAfterLogin();
    await initMailboxOnLogin();
    const user = userInfo();

    if (!user || !user.authenticated) return;

    analytics.track('login', {
      method: 'email',
    });
    identifyUser();
  };

  onCleanup(() => {
    setStage(Stage.Email);
  });

  const onStageChange = (next: Stage) => {
    if (next === Stage.Done) {
      onComplete();
    }
    setStage(next);
  };

  const stepIndex = () =>
    match(stage())
      .with(Stage.None, () => 0)
      .with(Stage.Email, () => 1)
      .with(Stage.Verify, () => 2)
      .with(Stage.Done, () => 2)
      .exhaustive();

  const emailSubmission = useSubmission(sendEmailCode);
  const verifySubmission = useSubmission(verifyCode);
  const resetEmailCode = useResetEmailCode(setStage);

  const onBack = () => {
    if (stage() === Stage.Verify) {
      verifySubmission.clear();
      resetEmailCode();
    } else if (stage() === Stage.Email) {
      emailSubmission.clear();
      setStage(Stage.None);
    }
  };

  return (
    <Show when={!userInfo()?.authenticated} fallback={<PostAuthGate />}>
      <div class="flex items-center justify-center size-full overflow-hidden relative">
        <style>{
          /*css*/ `
          @keyframes ln-card-in {
            from { opacity: 0; transform: translateY(14px) scale(0.985); }
            to   { opacity: 1; transform: translateY(0)    scale(1);     }
          }
          .ln-card { animation: ln-card-in 520ms cubic-bezier(0.22, 1, 0.36, 1) both; }

          /* Override browser autofill yellow with our surface/ink palette */
          .ln-input:-webkit-autofill,
          .ln-input:-webkit-autofill:hover,
          .ln-input:-webkit-autofill:focus,
          .ln-input:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 1000px var(--color-surface) inset;
            -webkit-text-fill-color: var(--color-ink);
            caret-color: var(--color-ink);
            transition: background-color 5000s ease-in-out 0s;
          }
        `
        }</style>

        <NoiseBackground />
        <div class="absolute top-4 right-4 z-20">
          <LocaleSelect variant="compact" />
        </div>

        <div class="relative z-10 w-full max-w-sm sm:max-w-lg ln-card">
          <div class="px-4 sm:px-8 flex flex-col gap-12">
            <div class="flex flex-col gap-8">
              <Show when={!virtualKeyboardVisible()}>
                <div class="flex flex-col gap-1.5">
                  <ConationLockup alt="" class="mb-4 h-24 w-[22rem] max-w-full brightness-0" />
                  <h1 class="font-semibold tracking-tight text-ink text-2xl">
                    {t('auth.welcome.title')}
                  </h1>
                  <p class="text-sm text-ink-muted">
                    {t('auth.welcome.tagline')}
                  </p>
                </div>
              </Show>

              <Stepper
                step={stepIndex()}
                transition={Stepper.transitions.scale}
              >
                <Stepper.Step>
                  <LoginPicker
                    setStage={onStageChange}
                    signupMode={props.signupMode}
                  />
                </Stepper.Step>
                <Stepper.Step>
                  <EmailFormNew setStage={onStageChange} onBack={onBack} signupMode={props.signupMode} />
                </Stepper.Step>
                <Stepper.Step>
                  <VerifyFormNew setStage={onStageChange} onBack={onBack} />
                </Stepper.Step>
              </Stepper>
            </div>

            <div class="text-center text-xs text-ink/50 wrap-break-word">
              {t('auth.legal.byContinuing')}{' '}
              <a
                class="text-link hover:text-link-hover visited:text-link-hover visited:text-link-visited underline underline-offset-2 focus-visible:text-link-hover"
                href="/terms"
              >
                {t('auth.legal.terms')}
              </a>{' '}
              {t('auth.legal.and')}{' '}
              <a
                class="text-link hover:text-link-hover visited:text-link-visited underline underline-offset-2 focus-visible:text-link-hover"
                href="/privacy"
              >
                {t('auth.legal.privacyPolicy')}
              </a>
              .
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
