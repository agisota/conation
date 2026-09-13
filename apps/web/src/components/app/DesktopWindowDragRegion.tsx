import { isPlatform } from '@core/util/platform';
import { Show } from 'solid-js';

/**
 * Invisible native-window move handle. Overlay titlebars have no gray
 * chrome; this strip is the hover target for macOS traffic lights.
 */
export function DesktopWindowDragRegion() {
  return (
    <Show when={isPlatform('desktop')}>
      <div
        data-tauri-drag-region
        class="h-7 w-full shrink-0"
        aria-hidden="true"
      />
    </Show>
  );
}
