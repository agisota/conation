import { createSoupState } from '@app/features/next-soup/create-soup-state';
import { t } from '@app/lib/i18n';
import { AnimatedEmailIcon } from '@icon/wide-email';
import { createEffect, createSignal } from 'solid-js';
import { MockAppChrome } from '../components/MockAppChrome';
import { ClickCallout, HotkeyCallout } from '../components-lib';
import { OnboardingEntityList } from '../OnboardingEntityList';
import {
  filteredSandboxEntities,
  sidebarFilter,
} from '../sandbox/sandbox-store';
import type { LessonContentProps, LessonDefinition } from '../types';

function SidebarNavContent(props: LessonContentProps) {
  const [done, setDone] = createSignal(false);
  createEffect(() => {
    if (sidebarFilter() === 'mail') {
      setDone(true);
      props.onComplete();
    }
  });

  return (
    <div class="flex flex-col gap-8 onboarding-stagger">
      <div class="mt-2 text-ink-muted text-base">
        <p>{t('onboarding.lessons.sidebar.description')}</p>
        <p>{t('onboarding.lessons.sidebar.tryEmail')}</p>
      </div>
      <div class="flex flex-col gap-2">
        <HotkeyCallout
          keys={['G', 'E']}
          separator={t('onboarding.callout.then')}
          label=""
          completed={done()}
        />
        <div class="flex items-center gap-3 text-sm text-ink/40">
          <div class="h-px w-8 bg-edge-muted" />
          {t('onboarding.callout.or')}
          <div class="h-px flex-1 bg-edge-muted" />
        </div>
        <ClickCallout
          icon={AnimatedEmailIcon}
          label={t('onboarding.callout.inSidebar')}
          completed={done()}
        />
      </div>
    </div>
  );
}

function SidebarNavDemo(props: LessonContentProps) {
  const soup = createSoupState({ wrapNavigation: true });

  createEffect(() => {
    soup.setRows(
      filteredSandboxEntities().map((e, i) =>
        soup.buildRow({ id: e.id, index: i, original: e })
      )
    );
  });

  return (
    <MockAppChrome highlightId="mail" scopeId={props.scopeId}>
      <OnboardingEntityList soup={soup} />
    </MockAppChrome>
  );
}

export const sidebarNavLesson: LessonDefinition = {
  id: 'sidebar-nav',
  title: 'onboarding.lessons.sidebar.title',
  content: SidebarNavContent,
  demo: SidebarNavDemo,
  order: 5,
};
