import { makePersisted } from '@solid-primitives/storage';
import { createMemo, createSignal } from 'solid-js';
import {
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  DEFAULT_THEMES,
} from '../constants';
import type {
  ThemeColorTokens,
  ThemeV0,
  ThemeV1,
  ThemeV3,
} from '../types/themeTypes';
import { normalizeThemeColorTokens } from '../utils/themeColorTokens';
import {
  convertThemev0v1,
  convertThemev1v2,
  convertThemev2v3,
} from '../utils/themeMigrations';
import { isThemeV2, isThemeV3 } from '../utils/themeValidation';
import {
  hasStoredAppearance,
  initialModeTheme,
  initialThemeMode,
} from './themeStartup';

const hadAppearanceOnLoad =
  typeof localStorage !== 'undefined' && hasStoredAppearance(localStorage);

export const [isThemeSaved, setIsThemeSaved] = createSignal<boolean>(true);

export const [themeUpdate, setThemeUpdate] = createSignal<undefined>(
  undefined,
  { equals: () => false }
);

export const [htmlColor, setHtmlColor] = makePersisted(
  createSignal({ color: '', mode: 'light' as 'light' | 'dark' }),
  { name: 'html-color-theme' }
);

export const [userThemes, setUserThemes] = makePersisted(
  createSignal<ThemeV3[]>([]),
  { name: 'macro-user-themes' }
);
if (userThemes().length > 0) {
  setUserThemes(
    (userThemes() as unknown[]).flatMap((theme) => {
      if (isThemeV3(theme)) {
        return [
          {
            ...theme,
            colorTokens: normalizeThemeColorTokens(theme.colorTokens, theme.mode),
          },
        ];
      }
      if (isThemeV2(theme)) return [convertThemev2v3(theme)];
      if (typeof theme !== 'object' || theme === null) return [];

      const version = (theme as { version?: unknown }).version;
      if (version === 1) {
        return [convertThemev2v3(convertThemev1v2(theme as ThemeV1))];
      }
      if (version === undefined || version === 0) {
        return [
          convertThemev2v3(convertThemev1v2(convertThemev0v1(theme as ThemeV0))),
        ];
      }
      return [];
    })
  );
}

export const [currentThemeId, setCurrentThemeId] = makePersisted(
  createSignal<string>(DEFAULT_LIGHT_THEME),
  { name: 'macro-selected-theme' }
);

export const themes = createMemo<ThemeV3[]>(() => [
  ...DEFAULT_THEMES,
  ...userThemes(),
]);

/** VNext colors currently rendered and edited in the document. */
export const [themeColorTokens, setThemeColorTokens] =
  createSignal<ThemeColorTokens>({});


// Per-mode theme preferences, persisted to localStorage. The active one is
// applied by systemThemeEffect / resolveActiveThemeId (themeUtils.ts): the light
// theme when themeMode is 'light' (or 'system' + OS light), the dark theme when
// 'dark' (or 'system' + OS dark).
export const [lightModeTheme, setLightModeTheme] = makePersisted(
  createSignal<string>(
    typeof localStorage === 'undefined'
      ? DEFAULT_LIGHT_THEME
      : initialModeTheme(
          localStorage,
          'light',
          themes().find(
            (theme) => theme.id === currentThemeId() && theme.mode === 'light'
          )?.id,
          DEFAULT_LIGHT_THEME
        )
  ),
  { name: 'macro-light-mode-theme' }
);

export const [darkModeTheme, setDarkModeTheme] = makePersisted(
  createSignal<string>(
    typeof localStorage === 'undefined'
      ? DEFAULT_DARK_THEME
      : initialModeTheme(
          localStorage,
          'dark',
          themes().find(
            (theme) => theme.id === currentThemeId() && theme.mode === 'dark'
          )?.id,
          DEFAULT_DARK_THEME
        )
  ),
  { name: 'macro-dark-mode-theme' }
);

/** The "Active theme" mode: pin a fixed light or dark theme, or follow the OS
 *  ('system'). Drives which per-mode theme (lightModeTheme/darkModeTheme) is
 *  live — see resolveActiveThemeId / systemThemeEffect in themeUtils. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** The old auto-detect switch is honored when no newer theme mode was saved.
 * A genuinely empty appearance profile starts pinned to Rox Warm Light. */
export const [themeMode, setThemeMode] = makePersisted(
  createSignal<ThemeMode>(
    typeof localStorage === 'undefined'
      ? 'light'
      : initialThemeMode(
          localStorage,
          themes().find((theme) => theme.id === currentThemeId())?.mode,
          hadAppearanceOnLoad
        )
  ),
  { name: 'macro-theme-mode' }
);

const supportsMatchMedia =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

// Tracks the OS color scheme so the active theme can follow it when themeMode is
// 'system'.
export const [systemMode, setSystemMode] = createSignal<'dark' | 'light'>(
  supportsMatchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
);

if (supportsMatchMedia) {
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  darkModeQuery.addEventListener('change', (e: MediaQueryListEvent) => {
    setSystemMode(e.matches ? 'dark' : 'light');
  });
}
/** Align the first live mode with the persisted choice before Root applies it. */
const initialLiveThemeMode = themeMode();
export const [liveThemeMode, setLiveThemeMode] = createSignal<'light' | 'dark'>(
  initialLiveThemeMode === 'system' ? systemMode() : initialLiveThemeMode
);

// Theme-list filters: whether light and/or dark themes are shown in the list.
export const [showLightThemes, setShowLightThemes] = makePersisted(
  createSignal<boolean>(true),
  { name: 'macro-show-light-themes' }
);
export const [showDarkThemes, setShowDarkThemes] = makePersisted(
  createSignal<boolean>(true),
  { name: 'macro-show-dark-themes' }
);

export const [themeDepth, setThemeDepth] = createSignal<number>(0.15);
