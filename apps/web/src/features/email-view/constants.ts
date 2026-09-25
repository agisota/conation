import type { EmailTab } from './types';

export type EmailTabItem = {
  id: EmailTab;
  label: string;
};

export const EMAIL_TABS: EmailTabItem[] = [
  { id: 'important', label: 'Основное' },
  { id: 'noise', label: 'Другие' },
  { id: 'sent', label: 'Отправленные' },
  { id: 'calendar', label: 'Календарь' },
  { id: 'drafts', label: 'Черновики' },
  { id: 'shared', label: 'Общие' },
  { id: 'all', label: 'Все письма' },
];

export const EMAIL_TAB_IDS: EmailTab[] = EMAIL_TABS.map((tab) => tab.id);

export const DEFAULT_EMAIL_TAB: EmailTab = 'important';
