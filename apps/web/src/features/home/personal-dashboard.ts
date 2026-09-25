import type { View } from '@service-storage/generated/schemas/view';

export const PERSONAL_DASHBOARD_ID = 'dashboard:personal';
export type DashboardWidget = 'tasks' | 'calendar' | 'transcript';
export type DashboardPreset = 'focus' | 'day' | 'blank';
export type DashboardLayout = {
  kind: 'dashboard';
  id: typeof PERSONAL_DASHBOARD_ID;
  version: 1;
  revision: number;
  preset: DashboardPreset;
  widgets: DashboardWidget[];
};

export const presetWidgets: Record<DashboardPreset, DashboardWidget[]> = {
  focus: ['tasks'],
  day: ['tasks', 'calendar'],
  blank: [],
};

export function firstDashboardLayout(): DashboardLayout {
  return {
    kind: 'dashboard',
    id: PERSONAL_DASHBOARD_ID,
    version: 1,
    revision: 0,
    preset: 'focus',
    widgets: [...presetWidgets.focus],
  };
}

const widgetIds: Record<DashboardWidget, true> = { tasks: true, calendar: true, transcript: true };
const presetIds: Record<DashboardPreset, true> = { focus: true, day: true, blank: true };
const keys = ['id', 'kind', 'preset', 'revision', 'version', 'widgets'];

export function parsePersonalDashboard(value: unknown): DashboardLayout {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Не удалось прочитать сохранённую личную доску.');
  }
  const config = value as Record<string, unknown>;
  if (
    Object.keys(config).sort().join(',') !== keys.join(',') ||
    config.kind !== 'dashboard' ||
    config.id !== PERSONAL_DASHBOARD_ID ||
    config.version !== 1 ||
    !Number.isSafeInteger(config.revision) ||
    (config.revision as number) < 0 ||
    !Object.hasOwn(presetIds, config.preset as PropertyKey) ||
    !Array.isArray(config.widgets) ||
    config.widgets.length > Object.keys(widgetIds).length ||
    config.widgets.some((widget) => typeof widget !== 'string' || !Object.hasOwn(widgetIds, widget)) ||
    new Set(config.widgets).size !== config.widgets.length
  ) {
    throw new Error('Формат личной доски не поддерживается. Изменения не перезаписаны.');
  }
  return config as DashboardLayout;
}

/** A physical saved-view UUID is only transport identity, never the logical board id. */
export function readPersonalDashboard(views: View[], ownerId: string): DashboardLayout | null {
  const matches = views.filter((view) => {
    const config = view.config;
    if (typeof config !== 'object' || config === null || Array.isArray(config)) return false;
    return 'id' in config && config.id === PERSONAL_DASHBOARD_ID;
  });
  if (matches.length > 1) {
    throw new Error('Найдено несколько личных досок. Обратитесь к администратору.');
  }
  const view = matches[0];
  if (!view) return null;
  if (view.userId !== ownerId) {
    throw new Error('Доска принадлежит другому аккаунту.');
  }
  return parsePersonalDashboard(view.config);
}

export function reorderWidget(widgets: DashboardWidget[], index: number, delta: -1 | 1) {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= widgets.length) return widgets;
  const next = widgets.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
