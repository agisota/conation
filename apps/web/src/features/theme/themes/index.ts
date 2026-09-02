import type { ThemeV3 } from '../types/themeTypes';
import { decepticonTheme } from './decepticon';
import { emberTheme } from './ember';
import { floraTheme } from './flora';
import { lapisTheme } from './lapis';
import { conationDarkTheme } from './macro-dark';
import { conationGruvboxTheme } from './macro-gruvbox';
import { conationLightTheme } from './macro-light';
import { moonTheme } from './moon';
import { paperTheme } from './paper';
import { rainTheme } from './rain';
import { satsumaTheme } from './satsuma';
import { spiritTheme } from './spirit';
import { voidTheme } from './void';

// Ordered for the theme picker: dark themes first (led by Conation Dark), then
// light themes (led by Conation Light).
export const DEFAULT_THEMES = [
  conationDarkTheme,
  conationGruvboxTheme,
  voidTheme,
  emberTheme,
  spiritTheme,
  moonTheme,
  rainTheme,
  conationLightTheme,
  satsumaTheme,
  lapisTheme,
  floraTheme,
  paperTheme,
  decepticonTheme,
] satisfies ThemeV3[];
