import { CalendarEmbed } from '@app/features/calendar/components/CalendarEmbed';
import { CalendarGridSkeleton } from '@app/features/calendar/components/CalendarGridSkeleton';
import { useCalendarOccurrenceData } from '@app/features/calendar/hooks/use-calendar-occurrence-data';
import { useCalendarSources } from '@app/features/calendar/hooks/use-calendar-sources';
import type { CalendarEvent, CalendarWeekStart } from '@app/features/calendar/types';
import { getDefaultCalendarTimeFormat } from '@app/features/calendar/utils/time-format';
import { getLocale, t } from '@app/lib/i18n';
import {
  createCalendarOccurrenceQueryRange,
  type CalendarOccurrenceQueryRange,
} from '@queries/calendar/occurrences';
import { cn } from '@ui';
import { addDays, format, startOfDay, startOfWeek } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { createMemo, createSignal, For, Show } from 'solid-js';
import type { WidgetOf } from '../schema';
import { SURFACE, TEXT } from '../tokens';

export type CalendarProps = Omit<WidgetOf<'calendar'>, 'type'>;

function dateFnsLocale() {
  return getLocale() === 'ru' ? ru : enUS;
}

function calendarWeekStartsOn(): CalendarWeekStart {
  return dateFnsLocale().options?.weekStartsOn === 1 ? 1 : 0;
}

function occurrenceRange(
  range: CalendarProps['range'],
  date: Date,
  weekStartsOn: CalendarWeekStart
): CalendarOccurrenceQueryRange {
  const start = startOfDay(date);
  if (range === 'day') {
    return createCalendarOccurrenceQueryRange(start, addDays(start, 1));
  }
  if (range === 'week') {
    const weekStart = startOfWeek(start, {
      weekStartsOn,
      locale: dateFnsLocale(),
    });
    return createCalendarOccurrenceQueryRange(weekStart, addDays(weekStart, 7));
  }
  return createCalendarOccurrenceQueryRange(start, addDays(start, 7));
}

function pinIds(events: CalendarEvent[], pins: CalendarProps['pins']) {
  if (!pins || pins.length === 0) return undefined;
  const wanted = new Set(pins.map((pin) => pin.id));
  const ids = new Set<string>();
  for (const event of events) {
    if (wanted.has(event.id) || wanted.has(event.eventId)) ids.add(event.id);
  }
  return ids;
}

/**
 * Embedded calendar tile. Day/week reuse {@link CalendarEmbed}; agenda is a
 * chronological list of the same occurrence query so it can sit in a tile
 * without FullCalendar's unsupported list view.
 */
export function Calendar(props: CalendarProps) {
  const initialDate = new Date();
  const [range, setRange] = createSignal(
    occurrenceRange(props.range, initialDate, calendarWeekStartsOn())
  );
  const { sourceById, sources } = useCalendarSources();
  const data = useCalendarOccurrenceData({ range, sourceById });

  const events = createMemo(() => {
    const all = data.visibleEvents();
    if (props.source === 'team') return all;
    const primaryIds = new Set(
      sources()
        .filter((source) => source.isPrimary)
        .map((source) => source.id)
    );
    if (primaryIds.size === 0) return all;
    return all.filter((event) => primaryIds.has(event.calendar.id));
  });

  const eventsById = createMemo(
    () => new Map(events().map((event) => [event.id, event]))
  );

  const emphasizedEventIds = createMemo(() => pinIds(events(), props.pins));

  return (
    <div
      class={cn(
        'flex min-h-72 min-w-0 w-full flex-col overflow-hidden rounded-lg border',
        SURFACE.borderMuted
      )}
    >
      <Show
        when={!data.isLoading()}
        fallback={
          <CalendarGridSkeleton
            dayCount={props.range === 'week' ? 7 : 1}
            showDayHeader={props.range !== 'day'}
            showAllDaySlot={false}
          />
        }
      >
        <Show
          when={props.range !== 'agenda'}
          fallback={<Agenda events={events()} />}
        >
          <CalendarEmbed
            initialDate={initialDate}
            events={events()}
            eventsById={eventsById()}
            emphasizedEventIds={emphasizedEventIds()}
            settings={{
              initialView: props.range === 'week' ? 'timeGridWeek' : 'timeGridDay',
              dayCount: props.range === 'day' ? 1 : undefined,
              showDayHeaders: props.range !== 'day',
              collapseEmptyAllDaySlot: true,
              showWeekends: true,
              weekStartsOn: calendarWeekStartsOn(),
              timeFormat: getDefaultCalendarTimeFormat(),
            }}
            selection={{ color: 'var(--color-accent)' }}
            onDatesSet={({ start, end }) => {
              const nextRange = createCalendarOccurrenceQueryRange(start, end);
              const previousRange = range();
              if (
                previousRange.start !== nextRange.start ||
                previousRange.end !== nextRange.end ||
                previousRange.startDate !== nextRange.startDate ||
                previousRange.endDate !== nextRange.endDate
              ) {
                setRange(nextRange);
              }
            }}
          />
        </Show>
      </Show>
    </div>
  );
}

function Agenda(props: { events: CalendarEvent[] }) {
  const ordered = createMemo(() =>
    [...props.events].sort((a, b) => a.start.localeCompare(b.start))
  );

  return (
    <Show
      when={ordered().length > 0}
      fallback={
        <div class={cn('px-3 py-6 text-center text-sm', TEXT.tertiary)}>
          {t('dynamicUi.widgets.timeline.empty')}
        </div>
      }
    >
      <ul class="flex min-h-0 flex-1 flex-col overflow-auto py-1">
        <For each={ordered()}>
          {(event) => (
            <li class="flex min-w-0 items-baseline gap-2 px-3 py-1.5 text-sm">
              <span class={cn('shrink-0 tabular-nums', TEXT.tertiary)}>
                {event.allDay
                  ? format(new Date(event.start), 'MMM d', {
                      locale: dateFnsLocale(),
                    })
                  : format(new Date(event.start), 'MMM d, p', {
                      locale: dateFnsLocale(),
                    })}
              </span>
              <span class={cn('min-w-0 truncate', TEXT.primary)}>
                {event.title}
              </span>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}
