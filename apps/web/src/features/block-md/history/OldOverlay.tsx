import { t } from '@app/lib/i18n';
import { useSplitLayout } from '@components/app/split-layout/layout';
import { toast } from '@core/component/Toast/Toast';
import GitFork from '@phosphor-icons/core/regular/git-fork.svg?component-solid';
import XIcon from '@phosphor-icons/core/regular/x.svg?component-solid';
import { storageServiceClient } from '@service-storage/client';
import { Button, Hotkey } from '@ui';
import { createSignal, Show } from 'solid-js';
import { useMarkdownName } from '../component/MarkdownNameProvider';
import { useMarkdownDocument } from '../context/markdown-document-context';
import { useHistory } from './HistoryContext';

const nameForkedDocument = (name: string) =>
  t('markdown.history.forkedName', { name });

export function OldOverlay() {
  const history = useHistory();
  const { documentId } = useMarkdownDocument();
  const { displayName } = useMarkdownName();
  const { insertSplit } = useSplitLayout();
  const [forking, setForking] = createSignal(false);

  const handleFork = async () => {
    if (forking()) return;
    const ms = history.selectedAt()?.getTime();
    const vid = history.isLive()
      ? undefined
      : ms
        ? (history.versionIdAt(ms) ?? undefined)
        : undefined;
    if (!history.isLive() && !vid) return;
    setForking(true);
    const res = await storageServiceClient.copyDocument({
      documentId: documentId(),
      documentName: nameForkedDocument(displayName() ?? ''),
      syncServiceVersion: vid,
    });
    setForking(false);
    if (res.isErr()) {
      toast.failure(t('markdown.history.forkFailed'));
      return;
    }
    insertSplit({ type: 'md', id: res.value.documentId }, 'fork');
    history.exit();
  };

  return (
    <Show when={history.isOpen()}>
      <div class="flex w-full items-center gap-2 bg-alert-bg px-3 py-2 text-xs text-alert-ink">
        <span class="flex items-center gap-1 flex-1">
          {t('markdown.history.viewing')}{' '}
          <Hotkey shortcut="escape" theme="current" />{' '}
          {t('markdown.history.toExit')}
        </span>
        <Button variant="outline" size="sm" onClick={history.exit}>
          <XIcon />
          {t('markdown.history.exit')}
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={handleFork}
          disabled={
            forking() ||
            (!history.isLive() &&
              (history.loading.doc() ||
                !history.versionIdAt(history.selectedAt()?.getTime() ?? 0)))
          }
        >
          <GitFork class="size-3.5 shrink-0" />
          {forking()
            ? t('markdown.history.forking')
            : t('markdown.history.fork')}
        </Button>
      </div>
    </Show>
  );
}
