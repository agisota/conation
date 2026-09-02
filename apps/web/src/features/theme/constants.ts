import { DEFAULT_THEMES } from './themes';

type DefaultTheme = (typeof DEFAULT_THEMES)[number]['id'];

export const DEFAULT_LIGHT_THEME: DefaultTheme = 'Conation Light';
export const DEFAULT_DARK_THEME: DefaultTheme = 'Conation Dark';

export { DEFAULT_THEMES };
