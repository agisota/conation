import { createHotkeyGroup, registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { onCleanup } from 'solid-js';
import type { CalendarPeriodView } from '../types';

interface CalendarHotkeyHandlers {
  scopeId: string;
  changeView: (view: CalendarPeriodView) => void;
  previousPeriod: () => unknown;
  nextPeriod: () => unknown;
  navigateToToday: () => void;
}

const VIEW_HOTKEYS = [
  {
    hotkey: 'd',
    token: TOKENS.calendar.view.day,
    description: 'Дневной вид',
    view: 'timeGridDay',
  },
  {
    hotkey: 'w',
    token: TOKENS.calendar.view.week,
    description: 'Недельный вид',
    view: 'timeGridWeek',
  },
  {
    hotkey: 'm',
    token: TOKENS.calendar.view.month,
    description: 'Месячный вид',
    view: 'dayGridMonth',
  },
] as const satisfies ReadonlyArray<{
  hotkey: 'd' | 'w' | 'm';
  token: (typeof TOKENS.calendar.view)[keyof typeof TOKENS.calendar.view];
  description: string;
  view: CalendarPeriodView;
}>;

/** Registers keyboard navigation for the current calendar component. */
export function useCalendarHotkeys(handlers: CalendarHotkeyHandlers) {
  const group = createHotkeyGroup();

  for (const command of VIEW_HOTKEYS) {
    group.add(
      registerHotkey({
        scopeId: handlers.scopeId,
        hotkey: command.hotkey,
        hotkeyToken: command.token,
        description: command.description,
        keyDownHandler: () => {
          handlers.changeView(command.view);
          return true;
        },
      })
    );
  }

  // 'k'/'j' are vim-style aliases for the same paging, so the keys that step
  // through soup lists also step through calendar periods.
  group.add(
    registerHotkey({
      scopeId: handlers.scopeId,
      hotkey: ['p', 'k'],
      hotkeyToken: TOKENS.calendar.period.previous,
      description: 'Предыдущий период',
      keyDownHandler: () => {
        void handlers.previousPeriod();
        return true;
      },
    })
  );

  group.add(
    registerHotkey({
      scopeId: handlers.scopeId,
      hotkey: ['n', 'j'],
      hotkeyToken: TOKENS.calendar.period.next,
      description: 'Следующий период',
      keyDownHandler: () => {
        void handlers.nextPeriod();
        return true;
      },
    })
  );

  group.add(
    registerHotkey({
      scopeId: handlers.scopeId,
      hotkey: 't',
      hotkeyToken: TOKENS.calendar.period.today,
      description: 'Перейти к сегодняшнему дню',
      keyDownHandler: () => {
        handlers.navigateToToday();
        return true;
      },
    })
  );

  onCleanup(() => group.dispose());
}
