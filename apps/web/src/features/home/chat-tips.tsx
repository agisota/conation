import { LIST_VIEW_DOCS_URL } from '@app/constants/docs-links';
import { t } from '@app/lib/i18n';
import { useSettingsState } from '@core/constant/SettingsState';
import ArrowUpRightIcon from '@phosphor/arrow-up-right.svg';
import AtIcon from '@phosphor/at.svg';
import BookOpenIcon from '@phosphor/book-open.svg';
import ChevronRightIcon from '@phosphor/caret-right.svg';
import PaperPlaneTiltIcon from '@phosphor/paper-plane-tilt.svg';
import PlugsConnectedIcon from '@phosphor/plugs-connected.svg';
import PuzzlePieceIcon from '@phosphor/puzzle-piece.svg';
import { Hotkey } from '@ui';
import { SetupRow } from './home-rows';

/**
 * First-run chat tips in the shared home row style: @mentions, background
 * sends, tool/agent connections, and the agent docs.
 */
export function ChatTipsSection() {
  const { openSettings } = useSettingsState();

  return (
    <section>
      <div class="mb-2 flex items-center px-1">
        <span class="text-sm text-ink-muted">{t('shell.home.tips.title')}</span>
      </div>
      <div class="flex flex-col gap-2">
        <SetupRow
          icon={<AtIcon class="size-4" />}
          title={t('shell.home.tips.mentionTitle')}
          desc={t('shell.home.tips.mentionDescription')}
        />
        <SetupRow
          icon={<PaperPlaneTiltIcon class="size-4" />}
          title={t('shell.home.tips.backgroundTitle')}
          desc={
            <>
              {t('shell.home.tips.backgroundPrefix')}
              <Hotkey shortcut="meta+enter" theme="subtle" />
              {t('shell.home.tips.backgroundSuffix')}
            </>
          }
        />
        <SetupRow
          icon={<PlugsConnectedIcon class="size-4" />}
          title={t('shell.home.tips.connectToolsTitle')}
          desc={t('shell.home.tips.connectToolsDescription')}
          trailing={
            <ChevronRightIcon class="size-4 shrink-0 text-ink-extra-muted" />
          }
          onActivate={() => openSettings('Connected')}
        />
        <SetupRow
          icon={<PuzzlePieceIcon class="size-4" />}
          title={t('shell.home.tips.connectAgentsTitle')}
          desc={t('shell.home.tips.connectAgentsDescription')}
          trailing={
            <ChevronRightIcon class="size-4 shrink-0 text-ink-extra-muted" />
          }
          onActivate={() => openSettings('Agent')}
        />
        <SetupRow
          icon={<BookOpenIcon class="size-4" />}
          title={t('shell.home.tips.learnAgentTitle')}
          desc={t('shell.home.tips.learnAgentDescription')}
          trailing={
            <ArrowUpRightIcon class="size-4 shrink-0 text-ink-extra-muted" />
          }
          href={LIST_VIEW_DOCS_URL.agents}
        />
      </div>
    </section>
  );
}
