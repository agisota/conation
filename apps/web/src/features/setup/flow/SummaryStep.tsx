import { FEATURED_MCP_SERVERS } from '@core/component/AI/constant/mcpServers';
import GmailIcon from '@icon/mcp-gmail.svg';
import SpinnerIcon from '@phosphor/spinner-gap.svg';
import { useContacts } from '@queries/contacts/contacts';
import { getBackfillProgress } from '@queries/email/backfill';
import { useEmailLinksQuery } from '@queries/email/link';
import {
  type ImportEntity,
  type ImportRun,
  useImportQuery,
  useRetryGatherMutation,
} from '@queries/import';
import { createMemo, For, Match, Show, Switch } from 'solid-js';
import { ImportEntityPill } from '../ImportEntityPill';
import {
  FailureNote,
  ImportCard,
  PillGrid,
  SkeletonPills,
} from '../primitives';
import { SOURCE_SECTIONS, type SourceSection } from '../selection';
import { ContinueButton } from './shared';

/** What's landing in the workspace: auto-import owns the accepting, so the
 * cards just render live progress (gateway pushes + polling). */
export function SummaryStep(props: { onContinue: () => void }) {
  const importQuery = useImportQuery();
  const retryGather = useRetryGatherMutation();
  const linksQuery = useEmailLinksQuery();
  const contacts = useContacts();

  // No ownership filter — shared links carry the owner's macro_id.
  const links = createMemo(() => linksQuery.data?.links ?? []);

  // Undefined until any inbox reports backfill progress.
  const emailProgress = createMemo(() => {
    let completed = 0;
    let total = 0;
    let any = false;
    for (const link of links()) {
      const progress = getBackfillProgress(link.id);
      if (progress) {
        any = true;
        completed += progress.completed;
        total += progress.total;
      }
    }
    return any ? { completed, total } : undefined;
  });

  const sliceFor = (definition: SourceSection) => ({
    run: importQuery.data?.runs.find((run) => run.source === definition.source),
    entities: (importQuery.data?.entities ?? []).filter(
      (entity) =>
        entity.source === definition.source && entity.status !== 'discarded'
    ),
  });

  const visibleSections = createMemo(() =>
    SOURCE_SECTIONS.filter((definition) => {
      const slice = sliceFor(definition);
      return slice.run !== undefined || slice.entities.length > 0;
    })
  );

  const anythingToShow = () =>
    links().length > 0 || visibleSections().length > 0;

  return (
    <div class="flex flex-col gap-3">
      <Show when={links().length > 0}>
        <ImportCard
          icon={<GmailIcon />}
          title="Почта и контакты"
          connected
          status={
            <span class="flex items-center gap-1.5">
              <Show
                when={emailProgress()}
                fallback={<>почта обрабатывается в фоновом режиме</>}
              >
                {(progress) => (
                  <>
                    Обработано цепочек писем:{' '}
                    {progress().completed.toLocaleString()} из{' '}
                    {progress().total.toLocaleString()}
                  </>
                )}
              </Show>
              <Show when={contacts().length > 0}>
                <span>
                  · найдено контактов: {contacts().length.toLocaleString()}
                </span>
              </Show>
              <SpinnerIcon class="size-3 shrink-0 animate-spin" />
            </span>
          }
        />
      </Show>

      <For each={visibleSections()}>
        {(definition) => (
          <AutoImportCard
            definition={definition}
            run={sliceFor(definition).run}
            entities={sliceFor(definition).entities}
            onRetryGather={() => retryGather.mutate(definition.source)}
          />
        )}
      </For>

      <Show when={!anythingToShow()}>
        <p class="py-4 text-[15px] text-ink-extra-muted">
          Пока ничего не добавлено. Позже можно попросить помощника добавить
          нужные материалы.
        </p>
      </Show>
      <ContinueButton onClick={props.onContinue} />
    </div>
  );
}

interface StatusCounts {
  staged: number;
  importing: number;
  imported: number;
}
const IMPORT_NOUNS: Record<string, string> = {
  linear: 'задач',
  notion: 'документов',
  slack: 'каналов',
};

/** One source's card: no accept toggle (auto-import owns accepting), the
 * blurb narrates gathering → importing → in your workspace. */
function AutoImportCard(props: {
  definition: SourceSection;
  run: ImportRun | undefined;
  entities: ImportEntity[];
  onRetryGather: () => void;
}) {
  const noun = IMPORT_NOUNS[props.definition.source] ?? 'материалов';
  const server = createMemo(() =>
    FEATURED_MCP_SERVERS.find(
      (candidate) => candidate.server_name === props.definition.serverName
    )
  );
  const serverIcon = () => {
    const found = server();
    return found ? <found.icon /> : undefined;
  };
  const counts = createMemo<StatusCounts>(() => {
    const tally: StatusCounts = { staged: 0, importing: 0, imported: 0 };
    for (const entity of props.entities) {
      if (entity.status === 'staged') tally.staged += 1;
      else if (entity.status === 'importing') tally.importing += 1;
      else if (entity.status === 'imported') tally.imported += 1;
    }
    return tally;
  });
  const gathering = () => props.run?.status === 'running';
  const importing = () =>
    props.run?.status === 'importing' || counts().importing > 0;

  return (
    <ImportCard
      icon={serverIcon()}
      title={props.definition.serverName}
      count={props.entities.length || undefined}
      connected
      status={
        <Switch>
          <Match when={props.run?.status === 'failed'}>
            <FailureNote
              message={`Не удалось проверить данные в ${props.definition.serverName}.`}
              onRetry={() => props.onRetryGather()}
            />
          </Match>
          <Match when={gathering()}>
            <span class="flex items-center gap-1.5">
              Ищем в {props.definition.serverName} {noun} для импорта…
              <SpinnerIcon class="size-3 shrink-0 animate-spin" />
            </span>
          </Match>
          <Match when={importing()}>
            <span class="flex items-center gap-1.5">
              Добавляем {noun} в рабочее пространство…
              <SpinnerIcon class="size-3 shrink-0 animate-spin" />
            </span>
          </Match>
          <Match when={counts().imported > 0}>
            В рабочее пространство добавлено: {counts().imported} {noun} из{' '}
            {props.definition.serverName}.
          </Match>
          <Match when={counts().staged > 0}>
            <span class="flex items-center gap-1.5">
              Найдено: {counts().staged} {noun}. Скоро начнём импорт…
              <SpinnerIcon class="size-3 shrink-0 animate-spin" />
            </span>
          </Match>
          <Match when={true}>
            В {props.definition.serverName} новых материалов нет.
          </Match>
        </Switch>
      }
    >
      <Show when={props.entities.length > 0 || gathering()}>
        <PillGrid>
          <For each={props.entities}>
            {(entity) => (
              <ImportEntityPill entity={entity} icon={serverIcon()} />
            )}
          </For>
          <Show when={gathering()}>
            <SkeletonPills count={props.entities.length > 0 ? 3 : 6} />
          </Show>
        </PillGrid>
      </Show>
    </ImportCard>
  );
}
