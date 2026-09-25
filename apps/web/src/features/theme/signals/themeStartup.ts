import { DEFAULT_LIGHT_THEME } from '../constants';
import type { ThemeColorMode } from '../types/themeTypes';

type ThemeMode = ThemeColorMode | 'system';
type AppearanceStorage = Pick<Storage, 'getItem'>;

const choiceKeys = [
  'macro-theme-mode',
  'macro-theme-should-match-system',
  'macro-selected-theme',
  'macro-light-mode-theme',
  'macro-dark-mode-theme',
  'macro-user-themes',
  'html-color-theme',
] as const;

/** Read before persisted signals normalize or write any appearance keys. */
export function hasStoredAppearance(storage: AppearanceStorage): boolean {
  return choiceKeys.some((key) => storage.getItem(key) !== null);
}

/** The old auto-detect switch predates per-mode theme preferences. */
export function initialThemeMode(
  storage: AppearanceStorage,
  selectedMode?: ThemeColorMode,
  hadAppearance = hasStoredAppearance(storage)
): ThemeMode {
  const saved = storage.getItem('macro-theme-mode');
  if (saved !== null) {
    try {
      const mode: unknown = JSON.parse(saved);
      if (mode === 'light' || mode === 'dark' || mode === 'system') return mode;
    } catch {
      // A malformed key is not a reason to discard other saved appearance data.
    }
  }
  if (!hadAppearance) return 'light';
  // The first render persists the default selected theme, but the mode signal
  // may not write its unchanged initial value. Do not reinterpret that new
  // light profile as a legacy system-following choice on the next reload.
  if (
    storage.getItem('macro-theme-should-match-system') === null &&
    storage.getItem('macro-selected-theme') ===
      JSON.stringify(DEFAULT_LIGHT_THEME)
  ) {
    return 'light';
  }
  if (storage.getItem('macro-theme-should-match-system') === 'false') {
    return selectedMode ?? 'system';
  }
  return 'system';
}

/** Keep the theme last selected by a pre-per-mode profile, if it matches. */
export function initialModeTheme(
  storage: AppearanceStorage,
  mode: ThemeColorMode,
  selectedThemeId: string | undefined,
  fallback: string
): string {
  const saved = storage.getItem(`macro-${mode}-mode-theme`);
  if (saved !== null) {
    try {
      const id: unknown = JSON.parse(saved);
      if (typeof id === 'string') return id;
    } catch {
      // Recover from only this malformed preference.
    }
  }
  return selectedThemeId ?? fallback;
}
