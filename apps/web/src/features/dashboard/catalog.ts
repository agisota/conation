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

/** Catalog types that can be added without extra ids. */
export type InstantDashboardModuleType = Exclude<
  DashboardModuleType,
  'channelMessage'
>;

export type MoveDirection = 'up' | 'down';

export type ChannelMessageConfig = {
  channelId: string;
  messageId: string;
};

/** Schema-valid default for a catalog module that does not need ids. */
export function createDashboardModule(
  type: InstantDashboardModuleType
): Widget {
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

/**
 * Pinned message module. Requires a non-empty `channelId`; `messageId` may
 * be omitted. Never seeds empty ids.
 */
export function createChannelMessageModule(input: {
  channelId: string;
  messageId?: string;
}): Widget | undefined {
  const channelId = input.channelId.trim();
  if (channelId === '') return undefined;
  return {
    type: 'channelMessage',
    channelId,
    messageId: input.messageId?.trim() ?? '',
  };
}

/** Restore persisted `layout.modules` into a widget tree, dropping invalid nodes. */
export function parseDashboardModules(value: unknown): Widget[] {
  if (!Array.isArray(value)) return [];
  const widgets: Widget[] = [];
  for (const item of value) {
    const parsed = WidgetSchema.safeParse(item);
    if (!parsed.success) continue;
    const sanitized = sanitizeWidget(parsed.data);
    if (sanitized !== undefined) widgets.push(sanitized);
  }
  return widgets;
}

/** Drop `channelMessage` nodes with empty `channelId`, including nested ones. */
function sanitizeWidget(widget: Widget): Widget | undefined {
  if (widget.type === 'channelMessage') {
    const channelId = widget.channelId.trim();
    if (channelId === '') return undefined;
    return {
      ...widget,
      channelId,
      messageId: widget.messageId.trim(),
    };
  }
  if (widget.type !== 'container') return widget;
  const children = widget.children.flatMap((child) => {
    const next = sanitizeWidget(child);
    return next === undefined ? [] : [next];
  });
  if (children.length === 0) return undefined;
  return { ...widget, children };
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
  if (module.type === 'channelMessage' && module.channelId.trim() === '') {
    return widgets;
  }
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

/** Swap the node at `path` with its previous or next sibling. */
export function moveDashboardModuleAt(
  widgets: Widget[],
  path: number[],
  direction: MoveDirection
): Widget[] {
  if (path.length === 0) return widgets;
  const index = path[0];
  if (index === undefined || index < 0 || index >= widgets.length) {
    return widgets;
  }
  if (path.length === 1) {
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= widgets.length) return widgets;
    const current = widgets[index];
    const neighbor = widgets[swapWith];
    if (current === undefined || neighbor === undefined) return widgets;
    const next = widgets.slice();
    next[index] = neighbor;
    next[swapWith] = current;
    return next;
  }
  const target = widgets[index];
  if (target === undefined || target.type !== 'container') return widgets;
  const children = moveDashboardModuleAt(
    target.children,
    path.slice(1),
    direction
  );
  return widgets.map((widget, i) =>
    i === index ? { ...target, children } : widget
  );
}

function updateAt(
  widgets: Widget[],
  path: number[],
  patch: (widget: Widget) => Widget
): Widget[] {
  if (path.length === 0) return widgets;
  const index = path[0];
  if (index === undefined || index < 0 || index >= widgets.length) {
    return widgets;
  }
  const target = widgets[index];
  if (target === undefined) return widgets;
  if (path.length === 1) {
    return widgets.map((widget, i) => (i === index ? patch(widget) : widget));
  }
  if (target.type !== 'container') return widgets;
  const children = updateAt(target.children, path.slice(1), patch);
  return widgets.map((widget, i) =>
    i === index ? { ...target, children } : widget
  );
}

/**
 * Patch a `channelMessage` at `path`. Empty `channelId` is ignored so the
 * widget cannot lose its required id.
 */
export function updateDashboardChannelMessageAt(
  widgets: Widget[],
  path: number[],
  next: ChannelMessageConfig
): Widget[] {
  const channelId = next.channelId.trim();
  if (channelId === '') return widgets;
  const messageId = next.messageId.trim();
  return updateAt(widgets, path, (widget) => {
    if (widget.type !== 'channelMessage') return widget;
    return { ...widget, channelId, messageId };
  });
}
