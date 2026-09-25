import { buildConfig } from '@core/component/LexicalMarkdown/builder/MarkdownConfigBuilder';
import { MarkdownShell } from '@core/component/LexicalMarkdown/builder/MarkdownShell';
import { createSignal, onCleanup } from 'solid-js';
import { MockAppChrome } from '../components/MockAppChrome';
import { HotkeyCallout } from '../components-lib';
import {
  SANDBOX_USERS,
  sandboxToCommandItems,
  setSidebarFilter,
  sidebarFilter,
} from '../sandbox/sandbox-store';
import type { LessonContentProps, LessonDefinition } from '../types';

/** Shared completion state between content and demo panels. */
const [completed, setCompleted] = createSignal(false);

function MarkdownMentionsContent(_props: LessonContentProps) {
  return (
    <div class="flex flex-col gap-8 onboarding-stagger">
      <p class="text-ink-muted mt-2">
        В редакторе можно форматировать текст, упоминать людей и материалы, а
        также добавлять эмодзи. Введите <strong>@</strong>, чтобы кого-нибудь
        упомянуть.
      </p>

      <HotkeyCallout
        keys={['@']}
        label="для упоминания человека или материала"
        completed={completed()}
      />
    </div>
  );
}

function MarkdownMentionsDemo(props: LessonContentProps) {
  const [mentioned, setMentioned] = createSignal(false);

  const previousFilter = sidebarFilter();
  setSidebarFilter(null);

  onCleanup(() => {
    setCompleted(false);
    setSidebarFilter(previousFilter);
  });

  const sandboxEntities = () =>
    sandboxToCommandItems().map((item) => ({
      ...item,
      kind: 'entity' as const,
    }));

  const config = buildConfig('markdown')
    .namespace('onboarding-editor')
    .withMentions({
      entities: sandboxEntities,
      users: () => SANDBOX_USERS,
      disableMentionTracking: true,
      onCreate: () => {
        if (!mentioned()) {
          setMentioned(true);
          setCompleted(true);
          props.onComplete();
        }
      },
    })
    .withEmojis()
    .withHistory()
    .withSkipPreviewFetch();

  return (
    <MockAppChrome scopeId={props.scopeId}>
      <div class="portal-scope h-full flex flex-col px-8 py-6">
        <h1 class="text-3xl font-semibold text-ink mb-4">Заметка на сегодня</h1>
        <MarkdownShell
          class="flex-1 min-h-0 cursor-text"
          config={config}
          placeholder="Начните писать… введите @ для упоминания"
          autofocus
          portalScope="local"
        />
      </div>
    </MockAppChrome>
  );
}

export const markdownMentionsLesson: LessonDefinition = {
  id: 'markdown-mentions',
  title: 'Редактор',
  content: MarkdownMentionsContent,
  demo: MarkdownMentionsDemo,
  order: 50,
};
