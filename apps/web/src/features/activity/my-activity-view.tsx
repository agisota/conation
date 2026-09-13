import { dateBucket } from '@app/features/next-soup/soup-view/group-by-date';
import { SoupSectionHeader } from '@app/features/next-soup/soup-view/section-header';
import { formatDateTime, t } from '@app/lib/i18n';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@components/app/split-layout/components/SplitHeader';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import SortIcon from '@phosphor/sort-ascending.svg';
import type { ActivityEvent } from '@queries/activity/graphql/entity';
import { createMyActivityQuery } from '@queries/activity/graphql/feed';
import { createMyActivityOverviewQuery } from '@queries/activity/graphql/overview';
import { Button, Dropdown, SingleSelectCheck } from '@ui';
import { type Component, createMemo, createSignal, For, Show } from 'solid-js';
import { ActionGraph } from './action-graph';
import { ActivityCategoryFilters } from './activity-category-filters';
import { parseOverviewDate } from './activity-dates';
import {
  type ActivityFilterCategory,
  type ActivitySort,
  filterActivityEvents,
  sortActivityEvents,
  toggleActivityCategory,
} from './activity-feed-query';
import { ActivityTimelineRow } from './activity-timeline-row';
import { TopEntities } from './top-entities';

type FeedGroup = { key: string; label: string; events: ActivityEvent[] };

/** The soup list inset shared by section headers, feed rows, and the overview. */
const INSET_CLASS = 'mx-1 w-[calc(100%-0.5rem)]';

/** The user's own activity, newest first, behind the activity-feed flag. */
export function MyActivityView() {
  const overview = createMyActivityOverviewQuery({ enabled: () => true });
  const feed = createMyActivityQuery({ enabled: () => true });
  const [selectedDate, setSelectedDate] = createSignal<string | null>(null);
  const [categories, setCategories] = createSignal<Set<string>>(new Set());
  const [sort, setSort] = createSignal<ActivitySort>('newest');

  const timeZone = () => overview.data?.timeZone ?? 'UTC';

  const visibleEvents = createMemo(() =>
    sortActivityEvents(
      filterActivityEvents(feed.data ?? [], {
        selectedDate: selectedDate(),
        timeZone: timeZone(),
        categories: categories(),
      }),
      sort()
    )
  );

  const groups = createMemo<FeedGroup[]>(() => {
    const day = selectedDate();
    const events = visibleEvents();
    if (day) {
      if (events.length === 0) return [];
      return [
        {
          key: day,
          label: formatDateTime(parseOverviewDate(day), {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          events,
        },
      ];
    }
    const out: FeedGroup[] = [];
    for (const event of events) {
      const bucket = dateBucket(event.occurredAt);
      const last = out[out.length - 1];
      if (last?.key === bucket.key) {
        last.events.push(event);
      } else {
        out.push({ ...bucket, events: [event] });
      }
    }
    return out;
  });

  const emptyCopy = () => {
    if (feed.isLoading) return t('common.loading');
    if (feed.isError) return t('activity.feed.unavailable');
    if (selectedDate()) return t('activity.feed.emptyDay');
    if (categories().size > 0) return t('activity.feed.emptyFiltered');
    return t('activity.feed.empty');
  };

  return (
    <div class="@container/u-list flex size-full flex-col">
      <SplitHeaderLeft>
        <span class="font-semibold text-sm">{t('activity.title')}</span>
      </SplitHeaderLeft>
      <SplitHeaderRight>
        <ActivitySortMenu value={sort()} onChange={setSort} />
      </SplitHeaderRight>
      <StaticMarkdownContext>
        <div class="min-h-0 flex-1 overflow-y-auto py-1">
          <div class="mx-auto w-full max-w-[1000px]">
            <div class={`${INSET_CLASS} flex min-w-0 flex-col gap-2 pb-2`}>
              <Show
                when={overview.data}
                fallback={
                  <p class="px-2 py-1 text-ink-extra-muted text-xs">
                    {overview.isError
                      ? t('activity.overview.unavailable')
                      : t('activity.overview.loading')}
                  </p>
                }
              >
                {(data) => (
                  <ActionGraph
                    overview={data()}
                    selectedDate={selectedDate()}
                    onSelectDate={setSelectedDate}
                  />
                )}
              </Show>
              <ActivityCategoryFilters
                selected={categories()}
                onToggle={(category: ActivityFilterCategory) =>
                  setCategories((current) =>
                    toggleActivityCategory(current, category)
                  )
                }
              />
            </div>
            <Show when={overview.data}>
              {(data) => <TopEntities entities={data().topEntities} />}
            </Show>
            <Show
              when={groups().length > 0}
              fallback={
                <p class={`${INSET_CLASS} px-2 py-2 text-ink-muted text-sm`}>
                  {emptyCopy()}
                </p>
              }
            >
              <FeedGroups groups={groups()} row={ActivityTimelineRow} />
              <Show when={feed.hasNextPage && selectedDate() === null}>
                <div class="flex justify-center py-2">
                  <Button
                    variant="ghost"
                    onClick={() => void feed.fetchNextPage()}
                    disabled={feed.isFetchingNextPage}
                  >
                    {feed.isFetchingNextPage
                      ? t('common.loading')
                      : t('activity.feed.showMore')}
                  </Button>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </StaticMarkdownContext>
    </div>
  );
}

function ActivitySortMenu(props: {
  value: ActivitySort;
  onChange: (value: ActivitySort) => void;
}) {
  const options: Array<{ value: ActivitySort; label: string }> = [
    { value: 'newest', label: t('activity.sort.newest') },
    { value: 'oldest', label: t('activity.sort.oldest') },
  ];
  return (
    <Dropdown placement="bottom-end">
      <Dropdown.Trigger depth={2} class="bg-surface">
        <SortIcon />
        <span>{t('activity.sort.label')}</span>
      </Dropdown.Trigger>
      <Dropdown.Content class="shadow-menu">
        <Dropdown.Group>
          <For each={options}>
            {(option) => (
              <Dropdown.Item onSelect={() => props.onChange(option.value)}>
                <span class="flex-1 truncate">{option.label}</span>
                <SingleSelectCheck active={props.value === option.value} />
              </Dropdown.Item>
            )}
          </For>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
}

function FeedGroups(props: {
  groups: FeedGroup[];
  row: Component<{ event: ActivityEvent }>;
}) {
  return (
    <For each={props.groups}>
      {(group) => (
        <>
          <SoupSectionHeader>{group.label}</SoupSectionHeader>
          <For each={group.events}>
            {(event) => <props.row event={event} />}
          </For>
        </>
      )}
    </For>
  );
}
