import type { ThemeV3 } from '../types/themeTypes';
import { macroLightTheme } from './macro-light';

/** Warm surfaces from the corporate palette, retaining ThemeV3's layer graph. */
export const roxWarmLightTheme = {
  ...macroLightTheme,
  id: 'Rox Warm Light',
  name: 'Rox Warm Light',
  colorTokens: {
    ...macroLightTheme.colorTokens,
    'surface-0': '#E2DBD5',
    'surface-1': '#ECE5DF',
    'surface-2': '#F3EAE3',
    'surface-3': '#F8EFE7',
    'surface-4': '#FCF6EF',
    'content-0': '#2D232E',
    'content-1': '#534A4F',
    'content-2': '#62595C',
    'content-3': '#62595C',
    'content-4': '#62595C',
    edge: '#CCC5BF',
    'edge-muted': '#DED5D0',
    accent: '#89500F',
    'ink-placeholder': 'var(--color-content-2)',
    page: 'var(--color-surface-1)',
    panel: 'var(--color-surface-3)',
    dialog: 'var(--color-surface-4)',
    menu: 'var(--color-surface-4)',
    tooltip: 'var(--color-surface-4)',
    toast: 'var(--color-surface-4)',
    'input-focus': 'var(--color-surface-4)',
    message: 'var(--color-surface-3)',
    success: '#276543',
    warning: '#835106',
    failure: '#A12E33',
    chrome: '#DFD8D2',
  },
} satisfies ThemeV3;
