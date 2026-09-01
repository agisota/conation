import type { SoupState } from '@app/features/next-soup/create-soup-state';
import { t } from '@app/lib/i18n';
import { createHotkeyGroup, registerHotkey } from '@core/hotkey/hotkeys';
import { onCleanup, onMount } from 'solid-js';

/**
 * Registers J / ↓ and K / ↑ navigation hotkeys into the given scope for the
 * provided soup state. Call this in any component that renders a navigable list
 * so keyboard navigation is always available while the list is visible.
 *
 * @param soup      The soup state to navigate
 * @param scopeId   The hotkey scope to register into (use the shell's scopeId)
 * @param onNavigate  Optional callback fired after each navigation step
 */
export function useListNavigation(
  soup: SoupState,
  scopeId: string,
  onNavigate?: (direction: 'down' | 'up') => void
) {
  const group = createHotkeyGroup();

  onMount(() => {
    const handle = (direction: 'down' | 'up') => {
      soup.navigate[direction]();
      onNavigate?.(direction);
      return true;
    };

    registerHotkey({
      scopeId,
      hotkey: ['j', 'arrowdown'],
      description: t('onboarding.hotkeys.navigateDown'),
      keyDownHandler: () => handle('down'),
    }).withGroup(group);

    registerHotkey({
      scopeId,
      hotkey: ['k', 'arrowup'],
      description: t('onboarding.hotkeys.navigateUp'),
      keyDownHandler: () => handle('up'),
    }).withGroup(group);
  });

  onCleanup(() => group.dispose());
}
