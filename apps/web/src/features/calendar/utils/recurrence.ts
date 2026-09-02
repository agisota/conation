import { formatDateTime, getDateLocale, t } from '@app/lib/i18n';
import { TZDateMini } from '@date-fns/tz';
import { format } from 'date-fns';

const POSITIVE_INTEGER_REGEX = /^\d+$/;
const BYDAY_VALUE_REGEX = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/i;
const RECURRENCE_DATE_REGEX = /^(\d{4})-?(\d{2})-?(\d{2})/;

const RECURRENCE_FREQUENCIES = [
  'SECONDLY',
  'MINUTELY',
  'HOURLY',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY',
] as const;

const WEEKDAYS = {
  MO: { day: 1, gender: 'masculine' },
  TU: { day: 2, gender: 'masculine' },
  WE: { day: 3, gender: 'feminine' },
  TH: { day: 4, gender: 'masculine' },
  FR: { day: 5, gender: 'feminine' },
  SA: { day: 6, gender: 'feminine' },
  SU: { day: 7, gender: 'neuter' },
} as const;

const WORKWEEK_CODES = ['MO', 'TU', 'WE', 'TH', 'FR'] as const;

type ParsedRecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];
type ParsedWeekdayCode = keyof typeof WEEKDAYS;

/** One weekday selector from an RFC 5545 `BYDAY` rule. */
interface RecurrenceWeekday {
  /** Weekday code such as `MO` or `FR`. */
  weekday: ParsedWeekdayCode;
  /** Positional selector such as `1` for first or `-1` for last. */
  ordinal?: number;
}

/** The recurrence fields used by the calendar event details UI. */
interface ParsedRecurrenceRule {
  /** RFC 5545 recurrence frequency, when supported. */
  frequency?: ParsedRecurrenceFrequency;
  /** Frequency interval. Defaults to one. */
  interval: number;
  /** Weekday selectors. */
  byDay: RecurrenceWeekday[];
  /** Days of the month, including negative values counted from the end. */
  byMonthDay: number[];
  /** One-based month numbers. */
  byMonth: number[];
  /** Maximum number of occurrences. */
  count?: number;
  /** Raw RFC 5545 recurrence end value. */
  until?: string;
}

/** Parsed recurrence metadata from an event's raw recurrence properties. */
export interface ParsedRecurrenceLines {
  /** Whether an `RRULE` property was present, even if it was malformed. */
  hasRecurrenceRule: boolean;
  /** First parsed recurrence rule. */
  rule?: ParsedRecurrenceRule;
  /** Explicitly included recurrence dates. */
  additionalDates: string[];
  /** Explicitly excluded recurrence dates. */
  excludedDates: string[];
}

function parsePositiveInteger(value: string | undefined) {
  if (!value || !POSITIVE_INTEGER_REGEX.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseIntegerList(
  value: string | undefined,
  isValid: (value: number) => boolean
) {
  if (!value) return [];

  return value
    .split(',')
    .map((part) => Number(part))
    .filter((part) => Number.isInteger(part) && isValid(part));
}

function parseByDay(value: string | undefined): RecurrenceWeekday[] {
  if (!value) return [];

  return value.split(',').flatMap((part) => {
    const match = BYDAY_VALUE_REGEX.exec(part.trim());
    if (!match) return [];

    const weekday = match[2]?.toUpperCase() as ParsedWeekdayCode;
    const ordinal = match[1] === undefined ? undefined : Number(match[1]);
    if (ordinal === 0 || (ordinal !== undefined && Math.abs(ordinal) > 53)) {
      return [];
    }

    return [{ weekday, ordinal }];
  });
}

function parseRule(value: string): ParsedRecurrenceRule {
  const fields = new Map<string, string>();
  for (const part of value.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    fields.set(
      part.slice(0, separator).trim().toUpperCase(),
      part.slice(separator + 1).trim()
    );
  }

  const rawFrequency = fields.get('FREQ')?.toUpperCase();
  const frequency = RECURRENCE_FREQUENCIES.find(
    (candidate) => candidate === rawFrequency
  );

  return {
    frequency,
    interval: parsePositiveInteger(fields.get('INTERVAL')) ?? 1,
    byDay: parseByDay(fields.get('BYDAY')),
    byMonthDay: parseIntegerList(
      fields.get('BYMONTHDAY'),
      (day) => day !== 0 && day >= -31 && day <= 31
    ),
    byMonth: parseIntegerList(
      fields.get('BYMONTH'),
      (month) => month >= 1 && month <= 12
    ),
    count: parsePositiveInteger(fields.get('COUNT')),
    until: fields.get('UNTIL') || undefined,
  };
}

function addDateValues(target: Set<string>, value: string) {
  for (const date of value.split(',')) {
    const trimmed = date.trim();
    if (trimmed) target.add(trimmed);
  }
}

/** Parses raw `RRULE`, `RDATE`, and `EXDATE` properties. */
export function parseRecurrenceLines(lines: string[]): ParsedRecurrenceLines {
  let hasRecurrenceRule = false;
  let rule: ParsedRecurrenceRule | undefined;
  const additionalDates = new Set<string>();
  const excludedDates = new Set<string>();

  for (const rawLine of lines) {
    const separator = rawLine.indexOf(':');
    if (separator < 1) continue;

    const property = rawLine
      .slice(0, separator)
      .split(';', 1)[0]
      ?.trim()
      .toUpperCase();
    const value = rawLine.slice(separator + 1).trim();

    if (property === 'RRULE') {
      hasRecurrenceRule = true;
      if (!rule) rule = parseRule(value);
    } else if (property === 'RDATE') {
      addDateValues(additionalDates, value);
    } else if (property === 'EXDATE') {
      addDateValues(excludedDates, value);
    }
  }

  return {
    hasRecurrenceRule,
    rule,
    additionalDates: [...additionalDates],
    excludedDates: [...excludedDates],
  };
}

function formatBaseFrequency(
  frequency: ParsedRecurrenceFrequency,
  interval: number
) {
  return t('calendar.recurrence.description.baseFrequency', {
    frequency,
    interval,
  });
}

type OrdinalGender = (typeof WEEKDAYS)[ParsedWeekdayCode]['gender'];

function ordinalWord(value: number, gender: OrdinalGender) {
  const names: Record<number, string> = {
    1: 'first',
    2: 'second',
    3: 'third',
    4: 'fourth',
    5: 'fifth',
    [-1]: 'last',
    [-2]: 'secondToLast',
    [-3]: 'thirdToLast',
    [-4]: 'fourthToLast',
    [-5]: 'fifthToLast',
  };
  const name = names[value];
  if (name) {
    return t(`calendar.recurrence.description.ordinal.${gender}`, {
      ordinal: name,
    });
  }

  const ordinal = t('calendar.recurrence.description.ordinal.numeric', {
    gender,
    value: Math.abs(value),
  });
  return value > 0
    ? ordinal
    : t('calendar.recurrence.description.ordinal.fromEnd', { ordinal });
}

function listFormatter(locale?: Intl.LocalesArgument) {
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });
}

function sortedByDays(byDay: RecurrenceWeekday[]) {
  return byDay.toSorted(
    (first, second) =>
      WEEKDAYS[first.weekday].day - WEEKDAYS[second.weekday].day ||
      (first.ordinal ?? 0) - (second.ordinal ?? 0)
  );
}

function isWorkweek(byDay: RecurrenceWeekday[]) {
  if (byDay.some((day) => day.ordinal !== undefined)) return false;
  const weekdays = new Set(byDay.map((day) => day.weekday));
  return (
    weekdays.size === WORKWEEK_CODES.length &&
    WORKWEEK_CODES.every((weekday) => weekdays.has(weekday))
  );
}

function formatByDay(
  byDay: RecurrenceWeekday[],
  locale?: Intl.LocalesArgument
) {
  const labels = sortedByDays(byDay).map(({ ordinal, weekday }) => {
    if (ordinal === undefined) {
      return t('calendar.recurrence.description.weekdayRecurring', {
        weekday,
      });
    }
    return t('calendar.recurrence.description.ordinalWeekday', {
      ordinal: ordinalWord(ordinal, WEEKDAYS[weekday].gender),
      weekday: t('calendar.recurrence.description.weekday', { weekday }),
    });
  });
  return listFormatter(locale).format(labels);
}

function formatMonthDays(days: number[], locale?: Intl.LocalesArgument) {
  const labels = days.map((day) =>
    day > 0
      ? t('calendar.recurrence.description.ordinal.numeric', {
          gender: 'neuter',
          value: day,
        })
      : day === -1
        ? t('calendar.recurrence.description.lastDay')
        : t('calendar.recurrence.description.monthDayFromEnd', {
            ordinal: ordinalWord(day, 'masculine'),
          })
  );
  return listFormatter(locale).format(labels);
}

function formatMonths(months: number[], locale?: Intl.LocalesArgument) {
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone: 'UTC',
  });
  return listFormatter(locale).format(
    months.map((month) => formatter.format(new Date(Date.UTC(2020, month - 1))))
  );
}

function formatRuleDetails(
  rule: ParsedRecurrenceRule,
  locale?: Intl.LocalesArgument
) {
  const frequency = rule.frequency;
  if (!frequency) return undefined;

  if (
    rule.interval === 1 &&
    (frequency === 'DAILY' || frequency === 'WEEKLY') &&
    isWorkweek(rule.byDay)
  ) {
    return t('calendar.recurrence.description.everyWeekday');
  }

  const base = formatBaseFrequency(frequency, rule.interval);
  const days = rule.byDay.length > 0 ? formatByDay(rule.byDay, locale) : '';
  const hasOrdinalDay = rule.byDay.some((day) => day.ordinal !== undefined);

  if ((frequency === 'WEEKLY' || frequency === 'DAILY') && days) {
    return t('calendar.recurrence.description.onDays', {
      base,
      days,
      ordinal: String(hasOrdinalDay),
    });
  }

  if (frequency === 'MONTHLY') {
    if (rule.byMonthDay.length > 0) {
      return t('calendar.recurrence.description.onMonthDays', {
        base,
        days: formatMonthDays(rule.byMonthDay, locale),
      });
    }
    if (days) {
      return t('calendar.recurrence.description.onDays', {
        base,
        days,
        ordinal: String(hasOrdinalDay),
      });
    }
  }

  if (frequency === 'YEARLY') {
    const months =
      rule.byMonth.length > 0 ? formatMonths(rule.byMonth, locale) : '';
    const monthDay = rule.byMonthDay[0];

    if (months && monthDay !== undefined) {
      if (rule.byMonth.length === 1 && monthDay > 0) {
        const date = new Intl.DateTimeFormat(locale, {
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(Date.UTC(2020, rule.byMonth[0] - 1, monthDay)));
        return t('calendar.recurrence.description.onDate', { base, date });
      }
      if (monthDay === -1) {
        return t('calendar.recurrence.description.onLastDayOfMonths', {
          base,
          months,
        });
      }
      return t('calendar.recurrence.description.onDayInMonths', {
        base,
        day: monthDay,
        months,
      });
    }
    if (months && days) {
      return t('calendar.recurrence.description.onDaysInMonths', {
        base,
        days,
        months,
        ordinal: String(hasOrdinalDay),
      });
    }
    if (months) {
      return t('calendar.recurrence.description.inMonths', { base, months });
    }
    if (days) {
      return t('calendar.recurrence.description.onDays', {
        base,
        days,
        ordinal: String(hasOrdinalDay),
      });
    }
    if (rule.byMonthDay.length > 0) {
      return t('calendar.recurrence.description.onMonthDays', {
        base,
        days: formatMonthDays(rule.byMonthDay, locale),
      });
    }
  }

  return base;
}

function parseUntilDate(value: string) {
  const match = RECURRENCE_DATE_REGEX.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : undefined;
}

/**
 * Legacy options accepted for source compatibility.
 *
 * @deprecated Recurrence descriptions always use the selected application
 * locale so ICU messages, dates, months, and lists cannot disagree.
 */
export interface RecurrenceDescriptionOptions {
  /** @deprecated Ignored; select the application locale with `setLocale`. */
  locale?: Intl.LocalesArgument;
}

/** Formats recurrence properties in the selected application locale. */
export function formatRecurrenceDescription(
  lines: string[],
  _legacyOptions: RecurrenceDescriptionOptions = {}
): string | undefined {
  const locale = getDateLocale();
  const parsed = parseRecurrenceLines(lines);
  let description = parsed.rule
    ? formatRuleDetails(parsed.rule, locale)
    : undefined;

  if (!description && parsed.additionalDates.length > 0) {
    const count = parsed.additionalDates.length;
    description = t('calendar.recurrence.description.onAdditionalDates', {
      count,
    });
  }

  if (!description && parsed.hasRecurrenceRule) {
    description = t('calendar.recurrence.recurringEvent');
  }
  if (!description) return undefined;

  const suffixes: string[] = [];
  if (parsed.rule?.count) {
    suffixes.push(
      t('calendar.recurrence.description.occurrences', {
        count: parsed.rule.count,
      })
    );
  }
  if (parsed.rule?.until) {
    const until = parseUntilDate(parsed.rule.until);
    if (until) {
      suffixes.push(
        t('calendar.recurrence.description.until', {
          date: new Intl.DateTimeFormat(locale, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(until),
        })
      );
    }
  }
  if (parsed.rule && parsed.additionalDates.length > 0) {
    const count = parsed.additionalDates.length;
    suffixes.push(
      t('calendar.recurrence.description.additionalDates', { count })
    );
  }
  if (parsed.excludedDates.length > 0) {
    const count = parsed.excludedDates.length;
    suffixes.push(t('calendar.recurrence.description.exceptions', { count }));
  }

  return [description, ...suffixes].join(' · ');
}

/** Weekday codes in RFC 5545 order for a Sunday-first chip row. */
export const WEEKDAY_CODES = [
  'SU',
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
] as const;

export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

const WORKWEEK: readonly WeekdayCode[] = ['MO', 'TU', 'WE', 'TH', 'FR'];

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** How a recurrence ends. */
type RecurrenceEnds =
  | { kind: 'never' }
  | { kind: 'on'; date: string }
  | { kind: 'after'; count: number };

/** The recurrence shapes the editor can express and round-trip. */
export interface RecurrenceConfig {
  frequency: RecurrenceFrequency;
  /** Every N frequency units; 1 is omitted from the rule. */
  interval: number;
  /** Weekly-only weekday selectors. */
  byDay: WeekdayCode[];
  /** Monthly-only positional weekday, e.g. first Friday = `{ 1, FR }`. */
  monthlyByDay?: { ordinal: number; weekday: WeekdayCode };
  ends: RecurrenceEnds;
}

const NEVER: RecurrenceEnds = { kind: 'never' };

/**
 * RFC 5545 `UNTIL` closing an inclusive local end date, Google-style:
 * all-day rules carry the plain date, timed rules the local end-of-day
 * instant rendered in UTC.
 */
function untilValue(date: string, allDay: boolean, timeZone?: string) {
  if (allDay) return date.replaceAll('-', '');
  const [year, month, day] = date.split('-').map(Number);
  const endOfDay =
    timeZone && year !== undefined && month !== undefined && day !== undefined
      ? new TZDateMini(year, month - 1, day, 23, 59, 59, timeZone)
      : new Date(`${date}T23:59:59`);
  return `${endOfDay.toISOString().slice(0, 19).replaceAll(/[-:]/g, '')}Z`;
}

/** The local calendar date a stored `UNTIL` value ends on (inclusive). */
function untilDate(value: string, timeZone?: string): string | undefined {
  const match = value.match(
    /^(\d{4})-?(\d{2})-?(\d{2})(?:T(\d{2}):?(\d{2}):?(\d{2})Z)?$/
  );
  if (!match) return undefined;
  if (match[4] === undefined) return `${match[1]}-${match[2]}-${match[3]}`;
  const instant = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6])
    )
  );
  return format(
    timeZone ? TZDateMini.tz(timeZone, instant) : instant,
    'yyyy-MM-dd'
  );
}

/** Serialize a config into a single-`RRULE` recurrence property list. */
export function buildRecurrenceLines(
  config: RecurrenceConfig,
  allDay: boolean,
  timeZone?: string
): string[] {
  const parts = [`FREQ=${config.frequency}`];
  if (config.interval > 1) {
    parts.push(`INTERVAL=${config.interval}`);
  }
  if (config.frequency === 'WEEKLY' && config.byDay.length > 0) {
    const ordered = WEEKDAY_CODES.filter((code) => config.byDay.includes(code));
    parts.push(`BYDAY=${ordered.join(',')}`);
  }
  if (config.frequency === 'MONTHLY' && config.monthlyByDay) {
    parts.push(
      `BYDAY=${config.monthlyByDay.ordinal}${config.monthlyByDay.weekday}`
    );
  }
  if (config.ends.kind === 'on') {
    parts.push(`UNTIL=${untilValue(config.ends.date, allDay, timeZone)}`);
  } else if (config.ends.kind === 'after') {
    parts.push(`COUNT=${config.ends.count}`);
  }
  return [`RRULE:${parts.join(';')}`];
}

/**
 * Parse recurrence properties into an editable config. Returns `undefined`
 * for rules the editor cannot round-trip (extra dates, exclusions, or
 * selectors beyond its vocabulary), which the UI keeps untouched instead.
 */
export function parseRecurrenceConfig(
  lines: string[],
  timeZone?: string
): RecurrenceConfig | undefined {
  if (lines.length === 0) return undefined;
  const parsed = parseRecurrenceLines(lines);
  const rule = parsed.rule;
  if (
    !rule ||
    parsed.additionalDates.length > 0 ||
    parsed.excludedDates.length > 0 ||
    lines.length > 1
  ) {
    return undefined;
  }
  if (
    rule.frequency !== 'DAILY' &&
    rule.frequency !== 'WEEKLY' &&
    rule.frequency !== 'MONTHLY' &&
    rule.frequency !== 'YEARLY'
  ) {
    return undefined;
  }
  if (rule.byMonthDay.length > 0 || rule.byMonth.length > 0) {
    return undefined;
  }
  if (rule.count !== undefined && rule.until !== undefined) {
    return undefined;
  }

  let byDay: WeekdayCode[] = [];
  let monthlyByDay: RecurrenceConfig['monthlyByDay'];
  if (rule.byDay.length > 0) {
    if (rule.frequency === 'WEEKLY') {
      if (rule.byDay.some((day) => day.ordinal !== undefined)) {
        return undefined;
      }
      byDay = rule.byDay.map((day) => day.weekday);
    } else if (rule.frequency === 'MONTHLY' && rule.byDay.length === 1) {
      const [day] = rule.byDay;
      if (day?.ordinal === undefined) return undefined;
      monthlyByDay = { ordinal: day.ordinal, weekday: day.weekday };
    } else {
      return undefined;
    }
  }

  let ends: RecurrenceEnds = NEVER;
  if (rule.count !== undefined) {
    ends = { kind: 'after', count: rule.count };
  } else if (rule.until !== undefined) {
    const date = untilDate(rule.until, timeZone);
    if (date === undefined) return undefined;
    ends = { kind: 'on', date };
  }

  return {
    frequency: rule.frequency,
    interval: rule.interval,
    byDay,
    monthlyByDay,
    ends,
  };
}

/** The positional weekday Google's monthly preset uses: 1st–4th, else last. */
export function monthlyOrdinalFor(start: Date): {
  ordinal: number;
  weekday: WeekdayCode;
} {
  const nth = Math.ceil(start.getDate() / 7);
  return {
    ordinal: nth === 5 ? -1 : nth,
    weekday: WEEKDAY_CODES[start.getDay()] as WeekdayCode,
  };
}

/** One entry in the recurrence preset dropdown. */
export interface RecurrencePreset {
  id: string;
  label: string;
  config: RecurrenceConfig;
}

const ORDINAL_LABELS: Record<number, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  [-1]: 'last',
};

/** Google Calendar's preset list, phrased from the event's start date. */
export function recurrencePresetsFor(start: Date): RecurrencePreset[] {
  const weekday = WEEKDAY_CODES[start.getDay()] as WeekdayCode;
  const weekdayName = formatDateTime(start, { weekday: 'long' });
  const monthly = monthlyOrdinalFor(start);
  const ordinal = ORDINAL_LABELS[monthly.ordinal] ?? 'last';
  return [
    {
      id: 'daily',
      label: t('calendar.recurrence.preset.daily'),
      config: { frequency: 'DAILY', interval: 1, byDay: [], ends: NEVER },
    },
    {
      id: 'weekly',
      label: t('calendar.recurrence.preset.weekly', {
        weekday: weekdayName,
      }),
      config: {
        frequency: 'WEEKLY',
        interval: 1,
        byDay: [weekday],
        ends: NEVER,
      },
    },
    {
      id: 'monthly',
      label: t('calendar.recurrence.preset.monthly', {
        ordinal: t('calendar.recurrence.preset.ordinal', { ordinal }),
        weekday: weekdayName,
      }),
      config: {
        frequency: 'MONTHLY',
        interval: 1,
        byDay: [],
        monthlyByDay: monthly,
        ends: NEVER,
      },
    },
    {
      id: 'annually',
      label: t('calendar.recurrence.preset.annually', {
        date: formatDateTime(start, { month: 'long', day: 'numeric' }),
      }),
      config: { frequency: 'YEARLY', interval: 1, byDay: [], ends: NEVER },
    },
    {
      id: 'weekdays',
      label: t('calendar.recurrence.preset.weekdays'),
      config: {
        frequency: 'WEEKLY',
        interval: 1,
        byDay: [...WORKWEEK],
        ends: NEVER,
      },
    },
  ];
}

/** Whether two configs produce the same rule. */
export function recurrenceConfigsEqual(
  first: RecurrenceConfig,
  second: RecurrenceConfig
): boolean {
  return (
    buildRecurrenceLines(first, false).join('\n') ===
    buildRecurrenceLines(second, false).join('\n')
  );
}

/** A sensible starting point for the custom editor. */
export function defaultCustomConfig(start: Date): RecurrenceConfig {
  return {
    frequency: 'WEEKLY',
    interval: 1,
    byDay: [WEEKDAY_CODES[start.getDay()] as WeekdayCode],
    ends: NEVER,
  };
}
