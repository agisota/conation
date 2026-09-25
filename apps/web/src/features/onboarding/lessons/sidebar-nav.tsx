import { createSoupState } from '@app/features/next-soup/create-soup-state';
import EmailIcon from '@phosphor/envelope.svg';
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
        <p>Переходите между разделами с помощью боковой панели.</p>
        <p>
          Откройте раздел <strong>Почта</strong>.
        </p>
      </div>
      <div class="flex flex-col gap-2">
        <HotkeyCallout
          keys={['G', 'E']}
          separator="затем"
          label=""
          completed={done()}
        />
        <div class="flex items-center gap-3 text-[15px] text-ink/40">
          <div class="h-px w-8 bg-edge-muted" />
          или
          <div class="h-px flex-1 bg-edge-muted" />
        </div>
        <ClickCallout
          icon={EmailIcon}
          label="в боковой панели"
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
  title: 'Навигация по боковой панели',
  content: SidebarNavContent,
  demo: SidebarNavDemo,
  order: 5,
};
