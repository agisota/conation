import { t } from '@app/lib/i18n';
import type { ThemeV3 } from '../types/themeTypes';

/** Localized labels for built-in themes; IDs remain persisted contracts. */
export function themeDisplayName(theme: Pick<ThemeV3, 'id' | 'name'>): string {
  switch (theme.id) {
    case 'Macro Dark':
      return t('theme.system.conationDark');
    case 'Conation Light':
      return t('theme.system.conationLight');
    case 'Conation Gruvbox':
      return t('theme.system.conationGruvbox');
    default:
      return theme.name;
  }
}
