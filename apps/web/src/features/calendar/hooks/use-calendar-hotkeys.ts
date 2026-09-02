import { t } from '@app/lib/i18n';
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
    descriptionKey: 'calendar.hotkey.dayView',
    view: 'timeGridDay',
  },
  {
    hotkey: 'w',
    token: TOKENS.calendar.view.week,
    descriptionKey: 'calendar.hotkey.weekView',
    view: 'timeGridWeek',
  },
  {
    hotkey: 'm',
    token: TOKENS.calendar.view.month,
    descriptionKey: 'calendar.hotkey.monthView',
    view: 'dayGridMonth',
  },
] as const satisfies ReadonlyArray<{
  hotkey: 'd' | 'w' | 'm';
  token: (typeof TOKENS.calendar.view)[keyof typeof TOKENS.calendar.view];
  descriptionKey: string;
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
        description: t(command.descriptionKey),
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
      description: t('calendar.hotkey.previousPeriod'),
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
      description: t('calendar.hotkey.nextPeriod'),
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
      description: t('calendar.navigation.goToToday'),
      keyDownHandler: () => {
        handlers.navigateToToday();
        return true;
      },
    })
  );

  onCleanup(() => group.dispose());
}
