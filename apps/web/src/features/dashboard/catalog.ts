import type { Widget } from '@app/features/dynamic-ui/schema';
import { WidgetSchema } from '@app/features/dynamic-ui/schema';
import { t } from '@app/lib/i18n';

/** Catalog module types the editor can drop into a composed view. */
export const DASHBOARD_MODULE_TYPES = [
  'list',
  'md',
  'timeline',
  'channelMessage',
  'calendar',
  'pins',
  'kpi',
  'activity',
] as const;

export type DashboardModuleType = (typeof DASHBOARD_MODULE_TYPES)[number];

/** Schema-valid default for a catalog module. */
export function createDashboardModule(type: DashboardModuleType): Widget {
  switch (type) {
    case 'list':
      return {
        type: 'list',
        title: t('dashboard.modules.list'),
        source: { kind: 'query', query: { include: { subType: ['task'] } } },
        limit: 8,
      };
    case 'md':
      return { type: 'md', markdown: t('dashboard.modules.md') };
    case 'timeline':
      return {
        type: 'timeline',
        title: t('dashboard.modules.timeline'),
        events: [],
      };
    case 'channelMessage':
      return { type: 'channelMessage', channelId: '', messageId: '' };
    case 'calendar':
      return { type: 'calendar', range: 'week', source: 'mine' };
    case 'pins':
      return { type: 'pins', kind: 'favorites' };
    case 'kpi':
      return {
        type: 'kpi',
        title: t('dashboard.modules.kpi'),
        metric: 'count',
        query: { include: { subType: ['task'] } },
      };
    case 'activity':
      return { type: 'activity', filter: 'me', limit: 8 };
  }
}

/** Restore persisted `layout.modules` into a widget tree, dropping invalid nodes. */
export function parseDashboardModules(value: unknown): Widget[] {
  if (!Array.isArray(value)) return [];
  const widgets: Widget[] = [];
  for (const item of value) {
    const parsed = WidgetSchema.safeParse(item);
    if (parsed.success) widgets.push(parsed.data);
  }
  return widgets;
}

function rootColumnChildren(widgets: Widget[]): Widget[] {
  const only = widgets[0];
  if (
    widgets.length === 1 &&
    only !== undefined &&
    only.type === 'container' &&
    (only.direction ?? 'col') === 'col'
  ) {
    return only.children;
  }
  return widgets;
}

/** Append a catalog module as a child of the composed column container. */
export function appendDashboardModule(
  widgets: Widget[],
  module: Widget
): Widget[] {
  return [
    {
      type: 'container',
      direction: 'col',
      gap: 3,
      children: [...rootColumnChildren(widgets), module],
    },
  ];
}

function removeAt(widgets: Widget[], path: number[]): Widget[] {
  if (path.length === 0) return widgets;
  const index = path[0];
  if (index === undefined || index < 0 || index >= widgets.length) {
    return widgets;
  }
  if (path.length === 1) {
    return widgets.filter((_, i) => i !== index);
  }
  const target = widgets[index];
  if (target === undefined || target.type !== 'container') return widgets;
  const children = removeAt(target.children, path.slice(1));
  return widgets.map((widget, i) =>
    i === index ? { ...target, children } : widget
  );
}

function pruneContainers(widgets: Widget[]): Widget[] {
  return widgets.flatMap((widget) => {
    if (widget.type !== 'container') return [widget];
    const children = pruneContainers(widget.children);
    if (children.length === 0) return [];
    return [{ ...widget, children }];
  });
}

/** Remove the node at `path` (indexes from the view root) and drop empty containers. */
export function removeDashboardModuleAt(
  widgets: Widget[],
  path: number[]
): Widget[] {
  return pruneContainers(removeAt(widgets, path));
}
