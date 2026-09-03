import { getConfiguredStandaloneOperatorOrigin } from '@core/constant/clientProfile';
import { AnimatedFileMdIcon } from '@icon/wide-fileMd';
import { AnimatedTaskIcon } from '@icon/wide-task';
import TagIcon from '@phosphor/tag.svg';
import type { Component } from 'solid-js';

/**
 * One "put the agent to work" example: the row's copy plus the prompt it
 * sends. Kept as plain data — these are edited for wording far more often
 * than the behavior around them, which is identical for every example (start
 * a chat with the prompt; see `getting-started.tsx`).
 */
export type AgentExample = {
  id: string;
  icon: Component<{ class?: string }>;
  titleKey: string;
  descriptionKey: string;
  promptKey: string;
  promptValues?: { link: string };
};

/** App links the example prompts ask the agent to include in its reply. */
function appLink(path: string): string {
  if (globalThis.__CONATION_HOSTED_LEGACY__) {
    return `${getConfiguredStandaloneOperatorOrigin()}${path}`;
  }
  return `${getConfiguredStandaloneOperatorOrigin()}${path}`;
}

const MANAGE_TAGS_LINK = appLink('/app/settings/tags');
const TASKS_LIST_LINK = appLink('/app/component/tasks');

export const AGENT_EXAMPLES: AgentExample[] = [
  {
    id: 'example-organize-inbox',
    icon: TagIcon,
    titleKey: 'shell.gettingStarted.examples.organizeInboxTitle',
    descriptionKey: 'shell.gettingStarted.examples.organizeInboxDescription',
    promptKey: 'shell.gettingStarted.examples.organizeInboxPrompt',
    promptValues: { link: MANAGE_TAGS_LINK },
  },
  {
    id: 'example-pull-tasks',
    icon: AnimatedTaskIcon,
    titleKey: 'shell.gettingStarted.examples.pullTasksTitle',
    descriptionKey: 'shell.gettingStarted.examples.pullTasksDescription',
    promptKey: 'shell.gettingStarted.examples.pullTasksPrompt',
    promptValues: { link: TASKS_LIST_LINK },
  },
  {
    id: 'example-weekly-brief',
    icon: AnimatedFileMdIcon,
    titleKey: 'shell.gettingStarted.examples.weeklyBriefTitle',
    descriptionKey: 'shell.gettingStarted.examples.weeklyBriefDescription',
    promptKey: 'shell.gettingStarted.examples.weeklyBriefPrompt',
  },
  {
    id: 'example-auto-tag-tasks',
    icon: TagIcon,
    titleKey: 'shell.gettingStarted.examples.tagTasksTitle',
    descriptionKey: 'shell.gettingStarted.examples.tagTasksDescription',
    promptKey: 'shell.gettingStarted.examples.tagTasksPrompt',
    promptValues: { link: MANAGE_TAGS_LINK },
  },
];
