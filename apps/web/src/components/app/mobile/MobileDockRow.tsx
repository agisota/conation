import {
  MobileAskAiButton,
  MobileSearchInput,
} from '@app/features/command/mobile/MobileSearchInput';
import { SearchState } from '@app/features/command/mobile/mobileSearchState';
import { t } from '@app/lib/i18n';
import { globalSplitManager } from '@app/signal/splitLayout';
import { useSettingsState } from '@core/constant/SettingsState';
import { triggerFocusInput } from '@core/directive/focusInput';
import { hapticImpact } from '@core/mobile/haptics';
import CaretUpIcon from '@phosphor/caret-up.svg';
import IconGear from '@phosphor/gear.svg';
import SearchIcon from '@phosphor/magnifying-glass.svg';
import { createElementSize } from '@solid-primitives/resize-observer';
import { cn } from '@ui';
import { createSignal, For, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useSplitLayout } from '../split-layout/layout';
import { MobileDockButton } from './MobileDockButton';
import { MobileDockIsland } from './MobileDockIsland';
import { MobileDrawer } from './MobileDrawer';
import { MobileBottomEdgeFade } from './MobileEdgeFade';
import {
  isMobileNotesDocumentsContent,
  MOBILE_MORE_DESTINATIONS,
  MOBILE_NOTES_DOCUMENTS_CONTENT,
  type MobileDockView,
  useMobileDockViews,
} from './mobile-dock-views';
import {
  type MobileDockNavId,
  useForegroundMobileView,
  useMobileNavNavigate,
} from './use-mobile-nav';

function MoreViewsDrawer(props: {
  views: readonly MobileDockView[];
  isActive: (id: MobileDockNavId) => boolean;
  onNavigate: (id: MobileDockNavId) => void;
}) {
  const { settingsOpen, toggleSettings } = useSettingsState();
  const { openWithSplit } = useSplitLayout();

  const navigateMore = (
    id: (typeof MOBILE_MORE_DESTINATIONS)[number]['id']
  ) => {
    const fgContent = globalSplitManager()?.activeSplit()?.content();
    const isOnNavView =
      fgContent?.type === 'component' || fgContent?.type === 'calendar';
    if (id === 'notes') {
      openWithSplit(MOBILE_NOTES_DOCUMENTS_CONTENT, {
        mergeHistory: isOnNavView,
      });
      return;
    }
    if (id === 'home') {
      openWithSplit(
        { type: 'component', id: 'home' },
        { mergeHistory: isOnNavView }
      );
      return;
    }
    props.onNavigate(id);
  };

  const moreDestinationActive = (
    id: (typeof MOBILE_MORE_DESTINATIONS)[number]['id']
  ) => {
    const content = globalSplitManager()?.activeSplit()?.content();
    if (id === 'notes') return isMobileNotesDocumentsContent(content);
    if (id === 'home') return content?.type === 'component' && content.id === 'home';
    return props.isActive(id);
  };

  return (
    <MobileDrawer
      side="bottom"
      preventScroll={false}
      preventScrollbarShift={false}
      closeOnOutsidePointerStrategy="pointerdown"
    >
      <MobileDrawer.Trigger
        as={MobileDockButton}
        ariaLabel="More views"
        icon={CaretUpIcon}
      />
      <MobileDrawer.Portal>
        <MobileDrawer.Overlay />
        <MobileDrawer.Content aria-label="More views">
          <MobileDrawer.Handle />
          <MobileDrawer.ScrollBody>
            <div class="mx-3 flex flex-col gap-1 px-1">
              <MobileDrawer.Close
                as={MobileDrawer.Item}
                aria-label={t('shell.navigation.settings')}
                class={settingsOpen() ? 'text-accent' : undefined}
                onClick={() => {
                  hapticImpact('light');
                  toggleSettings();
                }}
              >
                <IconGear class="size-4 shrink-0" />
                <span>{t('shell.navigation.settings')}</span>
              </MobileDrawer.Close>
              <div class="-mx-1 h-px shrink-0 bg-edge" />
              <For each={MOBILE_MORE_DESTINATIONS}>
                {(dest) => (
                  <MobileDrawer.Close
                    as={MobileDrawer.Item}
                    aria-label={dest.label}
                    class={
                      moreDestinationActive(dest.id) ? 'text-accent' : undefined
                    }
                    aria-current={
                      moreDestinationActive(dest.id) ? 'page' : undefined
                    }
                    onClick={() => {
                      hapticImpact('light');
                      navigateMore(dest.id);
                    }}
                  >
                    <Dynamic component={dest.icon} class="size-4 shrink-0" />
                    <span>{dest.label}</span>
                  </MobileDrawer.Close>
                )}
              </For>
              <Show when={props.views.length > 0}>
                <div class="-mx-1 h-px shrink-0 bg-edge" />
              </Show>
              <For each={props.views.toReversed()}>
                {(view) => (
                  <MobileDrawer.Close
                    as={MobileDrawer.Item}
                    aria-label={view.label}
                    class={props.isActive(view.id) ? 'text-accent' : undefined}
                    aria-current={props.isActive(view.id) ? 'page' : undefined}
                    onClick={() => {
                      hapticImpact('light');
                      props.onNavigate(view.id);
                    }}
                  >
                    <Dynamic component={view.icon} class="size-4 shrink-0" />
                    <span>{view.label}</span>
                  </MobileDrawer.Close>
                )}
              </For>
              <div class="-mx-1 h-px shrink-0 bg-edge" />
              <MobileDrawer.Close
                aria-label={t('shell.mobile.views')}
                class="flex h-9 shrink-0 items-center px-3 text-sm font-medium text-ink-muted"
                onClick={() => hapticImpact('light')}
              >
                {t('shell.mobile.views')}
              </MobileDrawer.Close>
            </div>
          </MobileDrawer.ScrollBody>
        </MobileDrawer.Content>
      </MobileDrawer.Portal>
    </MobileDrawer>
  );
}

/**
 * The navigation dock groups as many fixed-size view buttons as fit with More,
 * with Search on its own island.
 * Pressing Search flips the row to the search
 * layout (see MobileDockRow); the current view's button shows in accent.
 */
function MobileNavigationDockRow() {
  const navigate = useMobileNavNavigate();
  const foregroundView = useForegroundMobileView();
  const dockViews = useMobileDockViews();

  const [navRef, setNavRef] = createSignal<HTMLDivElement>();
  const navSize = createElementSize(navRef);
  const visibleCount = () => {
    // The island height and square buttons share the same CSS size. Its width
    // already excludes Search and the gutters; reserve one button for More.
    if (!navSize.height) return 0;
    return Math.max(0, Math.floor(navSize.width / navSize.height) - 1);
  };

  return (
    <div class="flex w-full justify-between gap-(--mobile-chrome-gutter)">
      <MobileDockIsland
        ref={setNavRef}
        class="h-(--mobile-chrome-button-size) min-w-0 flex-1 justify-between"
        style={{
          'max-width': `calc(${dockViews().length + 1} * var(--mobile-chrome-button-size))`,
        }}
      >
        <For each={dockViews().slice(0, visibleCount())}>
          {(button) => (
            <MobileDockButton
              icon={
                foregroundView() === button.id
                  ? (button.iconActive ?? button.icon)
                  : button.icon
              }
              ariaLabel={button.label}
              active={foregroundView() === button.id}
              onClick={() => navigate(button.id)}
            />
          )}
        </For>
        <MoreViewsDrawer
          views={dockViews().slice(visibleCount())}
          isActive={(id) => foregroundView() === id}
          onNavigate={navigate}
        />
      </MobileDockIsland>
      <MobileDockIsland class="shrink-0">
        <MobileDockButton
          icon={SearchIcon}
          ariaLabel={t('common.search')}
          onClick={() => {
            // Focus synchronously inside the tap so iOS lets the keyboard
            // open; the input mounts once opening the session flips the row
            // to the search layout.
            triggerFocusInput(() =>
              document.getElementById('mobile-search-input')
            );
            SearchState.open();
            navigate('search');
          }}
        />
      </MobileDockIsland>
    </div>
  );
}

type MobileDockRowProps = {
  class?: string;
};

/**
 * The bottom-most chrome row. By default it is the navigation dock (see
 * MobileNavigationDockRow); pressing its Search button opens a search session,
 * which swaps in the search row — the search bar ("Search or ask AI...")
 * with the "Ask AI" island — and shows the views pill row in the accessory
 * slot above as the scope switcher (see MobileViewsRow). Pressing the
 * input's X ends the session and restores the navigation dock.
 */
export function MobileDockRow(props: MobileDockRowProps) {
  return (
    <div
      class={cn(
        'flex items-center gap-(--mobile-chrome-gap) px-(--mobile-chrome-gutter)',
        props.class
      )}
    >
      <MobileBottomEdgeFade />
      <Show when={SearchState.isOpen()} fallback={<MobileNavigationDockRow />}>
        <MobileSearchInput />
        <MobileAskAiButton />
      </Show>
    </div>
  );
}
