import { For } from 'solid-js';
import {
  getLocale,
  parseLocale,
  setLocale,
  SUPPORTED_LOCALES,
  t,
} from '.';

function CompactLocaleSelect(props: { class?: string }) {
  return (
    <div
      role="radiogroup"
      aria-label={t('settings.account.language.label')}
      class={`flex items-center rounded-lg border border-edge-muted bg-surface/80 p-0.5 text-xs backdrop-blur-sm ${props.class ?? ''}`}
    >
      <For each={SUPPORTED_LOCALES}>
        {(locale) => (
          <button
            type="button"
            role="radio"
            aria-checked={getLocale() === locale}
            class={`rounded-md px-2.5 py-1 transition-colors ${
              getLocale() === locale
                ? 'bg-surface text-ink font-medium'
                : 'text-ink-muted hover:text-ink'
            }`}
            onClick={() => {
              if (locale === getLocale()) return;
              setLocale(locale);
            }}
          >
            {t(`locale.${locale}`)}
          </button>
        )}
      </For>
    </div>
  );
}

/** Native select used by account settings. */
function SettingsLocaleSelect(props: { class?: string }) {
  return (
    <select
      aria-label={t('settings.account.language.label')}
      class={`settings-input min-w-36 ${props.class ?? ''}`}
      value={getLocale()}
      onChange={(event) => {
        const next = parseLocale(event.currentTarget.value);
        if (!next || next === getLocale()) return;
        setLocale(next);
      }}
    >
      <For each={SUPPORTED_LOCALES}>
        {(locale) => (
          <option value={locale}>
            {t('settings.account.language.option', { locale })}
          </option>
        )}
      </For>
    </select>
  );
}

/** Runtime locale control. Switching updates copy and `document.documentElement.lang` without reload. */
export function LocaleSelect(props: {
  class?: string;
  variant?: 'settings' | 'compact';
}) {
  if (props.variant === 'compact') {
    return <CompactLocaleSelect class={props.class} />;
  }
  return <SettingsLocaleSelect class={props.class} />;
}
