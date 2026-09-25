import { RadioGroup } from '@kobalte/core/radio-group';
import { Button, Select } from '@ui';
import { addMonths, format } from 'date-fns';
import { createMemo, For, Show } from 'solid-js';
import {
  buildRecurrenceLines,
  formatRecurrenceDescription,
  type RecurrenceConfig,
  type RecurrenceFrequency,
  WEEKDAY_CODES,
  type WeekdayCode,
} from '../../utils/recurrence';
import { EventDateField } from './EventDateTimeInputs';

const DATE_VALUE = 'yyyy-MM-dd';

type FrequencyOption = {
  value: RecurrenceFrequency;
  label: string;
};

const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { value: 'DAILY', label: 'день' },
  { value: 'WEEKLY', label: 'неделю' },
  { value: 'MONTHLY', label: 'месяц' },
  { value: 'YEARLY', label: 'год' },
];
const WEEKDAY_LABELS: Record<WeekdayCode, { full: string; short: string }> = {
  SU: { full: 'воскресеньям', short: 'Вс' },
  MO: { full: 'понедельникам', short: 'Пн' },
  TU: { full: 'вторникам', short: 'Вт' },
  WE: { full: 'средам', short: 'Ср' },
  TH: { full: 'четвергам', short: 'Чт' },
  FR: { full: 'пятницам', short: 'Пт' },
  SA: { full: 'субботам', short: 'Сб' },
};

export interface RecurrenceBuilderProps {
  value: RecurrenceConfig;
  start: Date;
  allDay: boolean;
  disabled?: boolean;
  onChange: (value: RecurrenceConfig) => void;
}

/** Builds an RFC 5545 recurrence rule from individually editable parts. */
export function RecurrenceBuilder(props: RecurrenceBuilderProps) {
  const selectedFrequency = createMemo(
    () =>
      FREQUENCY_OPTIONS.find(
        (option) => option.value === props.value.frequency
      ) ?? FREQUENCY_OPTIONS[0]
  );
  const fallbackEndDate = () => format(addMonths(props.start, 3), DATE_VALUE);
  const recurrenceDescription = createMemo(
    () =>
      formatRecurrenceDescription(
        buildRecurrenceLines(props.value, props.allDay),
        { locale: 'ru-RU' }
      ) ?? 'Повторяющееся событие'
  );

  const patchConfig = (patch: Partial<RecurrenceConfig>) =>
    props.onChange({ ...props.value, ...patch });
  const setEnds = (ends: RecurrenceConfig['ends']) => patchConfig({ ends });
  const toggleWeekday = (code: WeekdayCode) =>
    patchConfig({
      byDay: props.value.byDay.includes(code)
        ? props.value.byDay.filter((day) => day !== code)
        : [...props.value.byDay, code],
    });
  const changeEndsKind = (kind: string) => {
    if (props.disabled) return;
    switch (kind) {
      case 'never':
        setEnds({ kind: 'never' });
        return;
      case 'on':
        setEnds({
          kind: 'on',
          date:
            props.value.ends.kind === 'on'
              ? props.value.ends.date
              : fallbackEndDate(),
        });
        return;
      case 'after':
        setEnds({
          kind: 'after',
          count:
            props.value.ends.kind === 'after' ? props.value.ends.count : 13,
        });
    }
  };

  return (
    <div class="flex flex-col gap-4 text-sm text-ink-muted">
      <p class="text-base font-medium text-ink">{recurrenceDescription()}</p>

      <div class="flex flex-wrap items-start gap-4">
        <div class="flex flex-col gap-2">
          <span class="text-ink-extra-muted">Повторять каждые</span>
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <input
              type="number"
              min="1"
              value={props.value.interval}
              onInput={(event) =>
                patchConfig({ interval: event.currentTarget.valueAsNumber })
              }
              aria-label="Интервал повторения"
              class="settings-input h-7 w-16"
              disabled={props.disabled}
            />
            <Select<FrequencyOption>
              options={FREQUENCY_OPTIONS}
              value={selectedFrequency()}
              onChange={(option) =>
                option && patchConfig({ frequency: option.value })
              }
              optionValue="value"
              optionTextValue="label"
              disabled={props.disabled}
            >
              <Select.Trigger
                aria-label="Единица повтора"
                class="settings-input h-7 w-28"
              >
                <Select.Value<FrequencyOption>>
                  {(selectState) => selectState.selectedOption().label}
                </Select.Value>
                <Select.Icon />
              </Select.Trigger>
              <Select.Content>
                <Select.Listbox />
              </Select.Content>
            </Select>
          </div>
        </div>

        <Show when={props.value.frequency === 'WEEKLY'}>
          <div class="flex flex-col gap-2">
            <span class="text-ink-extra-muted">Повторять по дням</span>
            <div class="flex flex-wrap items-center gap-1.5">
              <For each={WEEKDAY_CODES}>
                {(code) => (
                  <Button
                    type="button"
                    variant={
                      props.value.byDay.includes(code) ? 'accent' : 'ghost'
                    }
                    size="icon-sm"
                    class="rounded-full text-sm"
                    aria-label={`Повторять по ${WEEKDAY_LABELS[code].full}`}
                    aria-pressed={props.value.byDay.includes(code)}
                    disabled={props.disabled}
                    onClick={() => toggleWeekday(code)}
                  >
                    {WEEKDAY_LABELS[code].short}
                  </Button>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>

      <div class="flex flex-col gap-2">
        <span class="text-ink-extra-muted">Окончание</span>
        <RadioGroup
          value={props.value.ends.kind}
          onChange={changeEndsKind}
          disabled={props.disabled}
          aria-label="Окончание повторения"
          class="grid min-w-0 grid-cols-3 gap-2"
        >
          <RadioGroup.Item
            value="never"
            class="min-w-0 rounded-lg border border-edge-muted bg-surface p-3 data-checked:border-accent data-checked:bg-accent-bg/40"
            onClick={() => changeEndsKind('never')}
          >
            <div class="flex flex-wrap items-center gap-2">
              <RadioGroup.ItemInput />
              <RadioGroup.ItemControl class="flex size-4 shrink-0 items-center justify-center rounded-full border border-edge data-checked:border-accent">
                <RadioGroup.ItemIndicator class="size-2 rounded-full bg-accent" />
              </RadioGroup.ItemControl>
              <RadioGroup.ItemLabel class="shrink-0 font-medium text-ink">
                Никогда
              </RadioGroup.ItemLabel>
              <span class="text-ink-extra-muted">
                Событие будет повторяться без ограничения срока.
              </span>
            </div>
          </RadioGroup.Item>

          <RadioGroup.Item
            value="on"
            class="min-w-0 rounded-lg border border-edge-muted bg-surface p-3 data-checked:border-accent data-checked:bg-accent-bg/40"
            onClick={() => changeEndsKind('on')}
          >
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <RadioGroup.ItemInput />
              <RadioGroup.ItemControl class="flex size-4 shrink-0 items-center justify-center rounded-full border border-edge data-checked:border-accent">
                <RadioGroup.ItemIndicator class="size-2 rounded-full bg-accent" />
              </RadioGroup.ItemControl>
              <RadioGroup.ItemLabel class="shrink-0 font-medium text-ink">
                До
              </RadioGroup.ItemLabel>
              <EventDateField
                label="Дата окончания"
                value={
                  props.value.ends.kind === 'on'
                    ? props.value.ends.date
                    : fallbackEndDate()
                }
                onChange={(date) => setEnds({ kind: 'on', date })}
                disabled={props.disabled}
                portalScope="local"
                appearance="bare"
                class="min-h-7 rounded-lg px-2 hover:bg-hover"
              />
            </div>
          </RadioGroup.Item>

          <RadioGroup.Item
            value="after"
            class="min-w-0 rounded-lg border border-edge-muted bg-surface p-3 data-checked:border-accent data-checked:bg-accent-bg/40"
            onClick={() => changeEndsKind('after')}
          >
            <div class="flex flex-wrap items-center gap-2">
              <RadioGroup.ItemInput />
              <RadioGroup.ItemControl class="flex size-4 shrink-0 items-center justify-center rounded-full border border-edge data-checked:border-accent">
                <RadioGroup.ItemIndicator class="size-2 rounded-full bg-accent" />
              </RadioGroup.ItemControl>
              <RadioGroup.ItemLabel class="shrink-0 font-medium text-ink">
                После
              </RadioGroup.ItemLabel>
              <input
                type="number"
                min="1"
                value={
                  props.value.ends.kind === 'after'
                    ? props.value.ends.count
                    : 13
                }
                onInput={(event) =>
                  setEnds({
                    kind: 'after',
                    count: event.currentTarget.valueAsNumber,
                  })
                }
                aria-label="Количество повторений"
                class="settings-input h-7 w-14"
                disabled={props.disabled}
              />
              <span>повторений</span>
            </div>
          </RadioGroup.Item>
        </RadioGroup>
      </div>
    </div>
  );
}
