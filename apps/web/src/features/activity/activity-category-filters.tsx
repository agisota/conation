import { t } from '@app/lib/i18n';
import { Button, cn } from '@ui';
import { For } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { ACTION_GLYPHS, ACTION_TONE_CLASS } from './action-glyph';
import {
  ACTIVITY_FILTER_CATEGORIES,
  type ActivityFilterCategory,
} from './activity-feed-query';

const CATEGORY_LABEL: Record<ActivityFilterCategory, string> = {
  GraphqlActivityCreated: 'activity.filters.created',
  GraphqlActivityEdited: 'activity.filters.edited',
  GraphqlActivityOpened: 'activity.filters.opened',
  GraphqlActivityDeleted: 'activity.filters.deleted',
  GraphqlActivityMessaged: 'activity.filters.messaged',
  GraphqlActivitySent: 'activity.filters.sent',
  GraphqlActivityPropertyChanged: 'activity.filters.property',
  GraphqlActivityParticipantAdded: 'activity.filters.participantAdded',
  GraphqlActivityParticipantRemoved: 'activity.filters.participantRemoved',
  GraphqlActivityCallStarted: 'activity.filters.call',
};

/** Category chips that sit under the heatmap, independent of header sort. */
export function ActivityCategoryFilters(props: {
  selected: ReadonlySet<string>;
  onToggle: (category: ActivityFilterCategory) => void;
}) {
  return (
    <div
      class="flex flex-wrap items-center gap-1"
      role="group"
      aria-label={t('activity.filters.label')}
    >
      <For each={ACTIVITY_FILTER_CATEGORIES}>
        {(category) => (
          <CategoryChip
            category={category}
            selected={props.selected}
            onToggle={props.onToggle}
          />
        )}
      </For>
    </div>
  );
}

function CategoryChip(props: {
  category: ActivityFilterCategory;
  selected: ReadonlySet<string>;
  onToggle: (category: ActivityFilterCategory) => void;
}) {
  const active = () =>
    props.selected.size === 0 || props.selected.has(props.category);
  const Icon = ACTION_GLYPHS[props.category];
  return (
    <Button
      variant="ghost"
      size="xs"
      aria-pressed={props.selected.has(props.category)}
      onClick={() => props.onToggle(props.category)}
      class={cn(
        'h-6 gap-1 rounded-full px-2 text-xs',
        active() ? 'bg-ink/8 text-ink' : 'text-ink-extra-muted opacity-60'
      )}
    >
      <Dynamic
        component={Icon}
        class={`size-3 ${ACTION_TONE_CLASS[props.category]}`}
      />
      {t(CATEGORY_LABEL[props.category])}
    </Button>
  );
}
