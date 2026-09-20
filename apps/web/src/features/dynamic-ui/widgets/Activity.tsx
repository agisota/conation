import { ActivityTimelineRow } from '@app/features/activity/activity-timeline-row';
import { t } from '@app/lib/i18n';
import { createMyActivityQuery } from '@queries/activity/graphql/feed';
import { cn } from '@ui';
import { createMemo, For, Show } from 'solid-js';
import type { WidgetOf } from '../schema';
import { SURFACE, TEXT } from '../tokens';

export type ActivityProps = Omit<WidgetOf<'activity'>, 'type'>;

const DEFAULT_LIMIT = 20;

/**
 * Live activity tile. Reuses {@link createMyActivityQuery} and
 * {@link ActivityTimelineRow} without the My Activity chrome (heatmap,
 * filters, split header). There is no team activity API; `team` still
 * reads the viewer's feed and names actors.
 */
export function Activity(props: ActivityProps) {
  const feed = createMyActivityQuery({ enabled: () => true });

  const events = createMemo(() => {
    const all = feed.data ?? [];
    const limit = props.limit ?? DEFAULT_LIMIT;
    return all.slice(0, limit);
  });

  const emptyCopy = () => {
    if (feed.isLoading) return t('common.loading');
    if (feed.isError) return t('activity.feed.unavailable');
    return t('activity.feed.empty');
  };

  return (
    <div
      class={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-lg border py-1',
        SURFACE.borderMuted
      )}
    >
      <Show when={props.filter === 'team'}>
        <div class={cn('px-3 py-2 text-xs', TEXT.tertiary)}>
          {t('dashboard.activity.personalFeedOnly')}
        </div>
      </Show>
      <Show
        when={events().length > 0}
        fallback={
          <div class={cn('px-3 py-6 text-center text-sm', TEXT.tertiary)}>
            {emptyCopy()}
          </div>
        }
      >
        <For each={events()}>
          {(event) => (
            <ActivityTimelineRow
              event={event}
              showActor={props.filter === 'team'}
            />
          )}
        </For>
      </Show>
    </div>
  );
}
