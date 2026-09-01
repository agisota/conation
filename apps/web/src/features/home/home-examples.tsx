import { t } from '@app/lib/i18n';
import { useChatInputContext } from '@core/component/AI/context';
import { isMobile } from '@core/mobile/isMobile';
import { AnimatedEmailIcon } from '@icon/wide-email';
import { AnimatedFileMdIcon } from '@icon/wide-fileMd';
import { AnimatedSearchIcon } from '@icon/wide-search';
import XIcon from '@phosphor/x.svg';
import { createSignal, For, type JSX, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { replaceHomeComposerSelection } from './home-composer-selection';
import type { HomePreferences } from './home-prefs';

type HomeExample = {
  icon: (props: { class?: string; triggerAnimation?: boolean }) => JSX.Element;
  titleKey: string;
  descriptionKey: string;
  prompt: string;
};

const HOME_EXAMPLES: HomeExample[] = [
  {
    icon: AnimatedFileMdIcon,
    titleKey: 'shell.home.examples.draftDocumentTitle',
    descriptionKey: 'shell.home.examples.draftDocumentDescription',
    prompt: 'Help me draft a document about ',
  },
  {
    icon: AnimatedEmailIcon,
    titleKey: 'shell.home.examples.draftEmailTitle',
    descriptionKey: 'shell.home.examples.draftEmailDescription',
    prompt: 'Help me draft an email to ',
  },
  {
    icon: AnimatedSearchIcon,
    titleKey: 'shell.home.examples.researchTitle',
    descriptionKey: 'shell.home.examples.researchDescription',
    prompt: 'Research and summarize everything we have about ',
  },
];

/**
 * Dismissible example-prompt cards. Clicking one loads the prompt prefix into
 * the home composer. Hidden on mobile.
 */
export function HomeExamples(props: { preferences: HomePreferences }) {
  const input = useChatInputContext();
  const [hovered, setHovered] = createSignal<number | null>(null);

  return (
    <Show when={!isMobile() && !props.preferences.isDismissed('examples')}>
      <section>
        <div class="mb-2 flex items-center justify-between px-1">
          <span class="text-sm text-ink-muted">
            {t('shell.home.examples.title')}
          </span>
          <button
            type="button"
            class="rounded-md p-1 text-ink-extra-muted transition-colors hover:bg-hover hover:text-ink-muted"
            aria-label={t('shell.home.examples.dismiss')}
            onClick={() => props.preferences.dismiss('examples')}
          >
            <XIcon class="size-3.5" />
          </button>
        </div>
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <For each={HOME_EXAMPLES}>
            {(example, i) => (
              <button
                type="button"
                class="group flex flex-col gap-1 rounded-xl border border-edge-muted bg-active p-3 text-left transition-colors hover:bg-hover"
                onClick={() =>
                  replaceHomeComposerSelection(input, example.prompt)
                }
                onMouseEnter={() => setHovered(i())}
                onMouseLeave={() =>
                  setHovered((prev) => (prev === i() ? null : prev))
                }
              >
                <div class="flex items-center gap-2">
                  <Dynamic
                    component={example.icon}
                    triggerAnimation={hovered() === i()}
                    class="size-4 shrink-0 text-ink-muted transition-colors group-hover:text-accent"
                  />
                  <span class="text-sm font-medium text-ink">
                    {t(example.titleKey)}
                  </span>
                </div>
                <span class="truncate text-xs text-ink-muted">
                  {t(example.descriptionKey)}
                </span>
              </button>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}
