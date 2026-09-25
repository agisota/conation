import type { ThemeV3 } from '../types/themeTypes';
import { decepticonTheme } from './decepticon';
import { emberTheme } from './ember';
import { floraTheme } from './flora';
import { lapisTheme } from './lapis';
import { macroDarkTheme } from './macro-dark';
import { macroGruvboxTheme } from './macro-gruvbox';
import { macroLightTheme } from './macro-light';
import { moonTheme } from './moon';
import { paperTheme } from './paper';
import { rainTheme } from './rain';
import { satsumaTheme } from './satsuma';
import { roxWarmLightTheme } from './rox-warm-light';
import { spiritTheme } from './spirit';
import { voidTheme } from './void';

// Ordered for the theme picker: dark themes first, then light themes led by
// the corporate default without removing the original Macro Light preset.
export const DEFAULT_THEMES = [
  macroDarkTheme,
  macroGruvboxTheme,
  voidTheme,
  emberTheme,
  spiritTheme,
  moonTheme,
  rainTheme,
  roxWarmLightTheme,
  macroLightTheme,
  satsumaTheme,
  lapisTheme,
  floraTheme,
  paperTheme,
  decepticonTheme,
] satisfies ThemeV3[];
