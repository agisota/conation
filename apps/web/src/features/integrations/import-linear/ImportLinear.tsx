import { getDateLocale, t } from '@app/lib/i18n';
import { toast } from '@core/component/Toast/Toast';
import { useContacts } from '@core/user';
import { createTask } from '@core/util/create';
import { parseCsv } from '@core/util/csv';
import { linearCsvRecordToMacroTaskDraft } from '@core/util/linearImport';
import { buildSimpleEntityUrl } from '@core/util/url';
import { useQueryClient } from '@queries/client';
import { useUpsertToHistoryMutation } from '@queries/history/history';
import { soupKeys } from '@queries/soup/keys';
import { Button } from '@ui';
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';

type ImportProgress =
  | { type: 'idle' }
  | { type: 'running'; done: number; total: number }
  | { type: 'done'; created: number; skipped: number; failed: number };

function normalize(s: string): string {
  return s.trim();
}

function lower(s: string): string {
  return normalize(s).toLowerCase();
}

function localizeCsvError(error: string): string {
  switch (error) {
    case 'CSV is empty':
      return t('integrations.linear.csv.errors.empty');
    case 'CSV has an unterminated quote':
      return t('integrations.linear.csv.errors.unterminatedQuote');
    case 'CSV is missing a header row':
      return t('integrations.linear.csv.errors.missingHeader');
    case 'CSV contains an empty header column':
      return t('integrations.linear.csv.errors.emptyHeader');
    default:
      return error;
  }
}

function localizeWarning(warning: string): string {
  if (warning === 'Missing Title') {
    return t('integrations.linear.warnings.missingTitle');
  }
  const assigneePrefix = 'Assignee not mapped: ';
  if (warning.startsWith(assigneePrefix)) {
    return t('integrations.linear.warnings.assigneeNotMapped', {
      assignee: warning.slice(assigneePrefix.length),
    });
  }
  return warning;
}

export default function ImportLinear() {
  const contacts = useContacts();
  const upsertToHistory = useUpsertToHistoryMutation();
  const queryClient = useQueryClient();

  const [fileName, setFileName] = createSignal<string>('');
  const [parseError, setParseError] = createSignal<string>('');
  const [records, setRecords] = createSignal<readonly Record<string, string>[]>(
    []
  );
  const [assigneeMapping, setAssigneeMapping] = createStore<
    Record<string, string>
  >({});
  const [createdIds, setCreatedIds] = createSignal<readonly string[]>([]);
  const [progress, setProgress] = createSignal<ImportProgress>({
    type: 'idle',
  });
  const [isImporting, setIsImporting] = createSignal(false);

  const runningProgress = createMemo(() => {
    const p = progress();
    return p.type === 'running' ? p : null;
  });

  const doneProgress = createMemo(() => {
    const p = progress();
    return p.type === 'done' ? p : null;
  });

  const uniqueAssignees = createMemo(() => {
    const set = new Set<string>();
    for (const r of records()) {
      const a = normalize(r['Assignee'] ?? '');
      if (a) set.add(a);
    }
    return [...set].sort((a, b) => a.localeCompare(b, getDateLocale()));
  });

  const contactOptions = createMemo(() => {
    const cs = contacts();
    return cs
      .map((c) => ({
        id: c.id,
        label:
          c.name && c.name !== c.email ? `${c.name} (${c.email})` : c.email,
        email: c.email,
        name: c.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, getDateLocale()));
  });

  createEffect(() => {
    // Auto-map assignees when possible based on email/name match.
    const current = uniqueAssignees();
    const options = contactOptions();

    for (const a of current) {
      if (assigneeMapping[a] !== undefined) continue;

      const aLower = lower(a);
      const mapped = a.includes('@')
        ? options.find((o) => lower(o.email) === aLower)
        : options.find((o) => lower(o.name) === aLower);

      setAssigneeMapping(a, mapped?.id ?? '');
    }
  });

  const previewDrafts = createMemo(() => {
    const allRows = records();

    const allDrafts = allRows.map((r, index) => {
      const assigneeRaw = normalize(r['Assignee'] ?? '');
      const assigneeUserId = assigneeRaw ? assigneeMapping[assigneeRaw] : '';
      return {
        rowNum: index + 1,
        ...linearCsvRecordToMacroTaskDraft({
          record: r,
          assigneeUserId: assigneeUserId ? assigneeUserId : null,
        }),
      };
    });

    // Show first 20 plus any additional rows with warnings
    return allDrafts.filter((d, i) => i < 20 || d.warnings.length > 0);
  });

  const handleFileChange = async (file: File | undefined) => {
    setCreatedIds([]);
    setProgress({ type: 'idle' });
    setParseError('');
    setRecords([]);

    if (!file) {
      setFileName('');
      return;
    }

    setFileName(file.name);
    const text = await file.text();
    const result = parseCsv(text);
    if (!result.ok) {
      setParseError(result.error);
      return;
    }

    // Linear exports use quoted headers; our parser returns them unquoted already.
    setRecords(result.records);
  };

  const canImport = () =>
    records().length > 0 && !parseError() && !isImporting();

  const runImport = async () => {
    const rows = records();
    if (rows.length === 0) return;

    setIsImporting(true);
    setCreatedIds([]);
    setProgress({ type: 'running', done: 0, total: rows.length });

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const createdList: string[] = [];

    try {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const assigneeRaw = normalize(r['Assignee'] ?? '');
        const assigneeUserId = assigneeRaw ? assigneeMapping[assigneeRaw] : '';

        const draft = linearCsvRecordToMacroTaskDraft({
          record: r,
          assigneeUserId: assigneeUserId ? assigneeUserId : null,
        });

        if (!draft.title) {
          skipped++;
          setProgress({ type: 'running', done: i + 1, total: rows.length });
          continue;
        }

        const id = await createTask({
          title: draft.title,
          content: draft.content,
          propertyValues: draft.propertyValues,
        });

        if (!id) {
          failed++;
        } else {
          created++;
          createdList.push(id);
          upsertToHistory.mutate({ itemId: id, itemType: 'document' });
        }

        setProgress({ type: 'running', done: i + 1, total: rows.length });
      }

      // Refresh soup items so the new tasks appear.
      queryClient.invalidateQueries({ queryKey: soupKeys.astItems._def });

      setCreatedIds(createdList);
      setProgress({ type: 'done', created, skipped, failed });
      toast.success(
        t('integrations.linear.toast.imported', { count: created })
      );
      if (failed > 0) {
        toast.failure(t('integrations.linear.toast.failed', { count: failed }));
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div class="flex flex-col size-full">
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div class="text-lg font-medium text-ink">
            {t('integrations.linear.title')}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setFileName('');
              setParseError('');
              setRecords([]);
              setCreatedIds([]);
              setProgress({ type: 'idle' });
              setAssigneeMapping(reconcile({}));
            }}
          >
            {t('integrations.linear.actions.clear')}
          </Button>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm text-ink-muted">
            {t('integrations.linear.csv.label')}
          </label>
          <label class="inline-flex items-center gap-2 px-4 py-2 bg-accent text-accent-contrast font-medium rounded-md hover:bg-accent-hover transition-colors w-fit">
            <span>{t('integrations.linear.csv.choose')}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleFileChange(e.currentTarget.files?.[0])}
              class="sr-only"
            />
          </label>
          <Show when={fileName()}>
            <div class="text-sm text-ink">
              <span class="text-ink-muted">
                {t('integrations.linear.csv.loaded')}
              </span>{' '}
              {fileName()}
            </div>
          </Show>
          <Show when={parseError()}>
            {(error) => (
              <div class="text-sm text-failure-ink">
                {localizeCsvError(error())}
              </div>
            )}
          </Show>
        </div>

        <Show when={records().length > 0}>
          <div class="flex flex-col gap-2">
            <div class="text-sm text-ink-muted">
              {t('integrations.linear.rows', { count: records().length })}
            </div>

            <Show when={uniqueAssignees().length > 0}>
              <div class="flex flex-col gap-2">
                <div class="text-sm font-medium text-ink">
                  {t('integrations.linear.mapping.title')}
                </div>
                <div class="text-xs text-ink-muted">
                  {t('integrations.linear.mapping.help')}
                </div>

                <div class="flex flex-col gap-2 border border-edge rounded-sm p-2">
                  <For each={uniqueAssignees()}>
                    {(assignee) => (
                      <div class="flex items-center gap-3">
                        <div class="flex-1 min-w-0">
                          <div class="text-sm text-ink truncate">
                            {assignee}
                          </div>
                        </div>
                        <select
                          class="text-sm bg-surface border border-edge rounded-xs px-2 py-1"
                          value={assigneeMapping[assignee] ?? ''}
                          onChange={(e) =>
                            setAssigneeMapping(assignee, e.currentTarget.value)
                          }
                        >
                          <option value="">
                            {t('integrations.linear.mapping.unassigned')}
                          </option>
                          <For each={contactOptions()}>
                            {(o) => <option value={o.id}>{o.label}</option>}
                          </For>
                        </select>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={records().length > 0}>
          <div class="flex flex-col gap-2">
            <div class="text-sm font-medium text-ink">
              {t('integrations.linear.preview.title')}
            </div>
            <div class="border border-edge rounded-sm overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-hover">
                  <tr class="text-left">
                    <th class="p-2">
                      {t('integrations.linear.preview.columns.row')}
                    </th>
                    <th class="p-2">
                      {t('integrations.linear.preview.columns.title')}
                    </th>
                    <th class="p-2">
                      {t('integrations.linear.preview.columns.warnings')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <For each={previewDrafts()}>
                    {(d) => (
                      <tr class="border-t border-edge">
                        <td class="p-2 align-top">
                          <div class="text-ink-muted">{d.rowNum}</div>
                        </td>
                        <td class="p-2 align-top">
                          <div class="text-ink">
                            {d.title ||
                              t('integrations.linear.preview.missingTitle')}
                          </div>
                        </td>
                        <td class="p-2 align-top">
                          <div class="text-xs text-ink-muted">
                            {d.warnings.length > 0
                              ? d.warnings.map(localizeWarning).join(' · ')
                              : '—'}
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        </Show>

        <Show when={createdIds().length > 0}>
          <div class="flex flex-col gap-2">
            <div class="text-sm font-medium text-ink">
              {t('integrations.linear.created.title')}
            </div>
            <div class="flex flex-col gap-1">
              <For each={createdIds()}>
                {(id) => (
                  <a
                    class="text-sm text-link hover:text-link-hover visited:text-link-visited underline underline-offset-2"
                    href={buildSimpleEntityUrl({ type: 'task', id })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {id}
                  </a>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>

      <div class="border-t border-edge p-4 flex items-center gap-3 shrink-0">
        <Button onClick={runImport} disabled={!canImport()}>
          {t('integrations.linear.actions.import')}
        </Button>
        <Show when={runningProgress()}>
          {(p) => (
            <div class="text-sm text-ink-muted">
              {t('integrations.linear.progress.running', {
                done: p().done,
                total: p().total,
              })}
            </div>
          )}
        </Show>
        <Show when={doneProgress()}>
          {(p) => (
            <div class="text-sm text-ink-muted">
              {t('integrations.linear.progress.done', {
                created: p().created,
                skipped: p().skipped,
                failed: p().failed,
              })}
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
