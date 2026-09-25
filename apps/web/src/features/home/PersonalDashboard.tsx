import { For, Show, createMemo, createSignal } from 'solid-js';
import type { JSX } from 'solid-js';
import { firstDashboardLayout, presetWidgets, reorderWidget, type DashboardLayout, type DashboardPreset, type DashboardWidget } from './personal-dashboard';
import { savePersonalDashboard, usePersonalDashboardQuery } from './personal-dashboard-query';
import { useDashboardCalendars, useDashboardOccurrences, useDashboardTasks } from './personal-dashboard-sources';
import './personal-dashboard.css';

const labels: Record<DashboardWidget, string> = {
  tasks: 'Мои задачи',
  calendar: 'Календарь',
  transcript: 'Последняя запись разговора',
};
const presetLabels: Record<DashboardPreset, string> = {
  focus: 'Фокус',
  day: 'День',
  blank: 'Пустая доска',
};

function Help(props: { title: string; children: JSX.Element }) {
  return (
    <details class="personal-dashboard-help">
      <summary title={`Справка: ${props.title}`}>Как это работает</summary>
      <div>{props.children}</div>
    </details>
  );
}

function TaskContent(props: { ownerId: string }) {
  const source = useDashboardTasks(props.ownerId);
  return (
    <Show when={!source.loading()} fallback={<p role="status">Загружаем доступные задачи…</p>}>
      <Show when={!source.error()} fallback={
        <p role="alert">Задачи сейчас недоступны. <button type="button" onClick={() => void source.retry()}>Повторить</button></p>
      }>
        <Show when={source.tasks().length > 0} fallback={<p>Доступных незавершённых задач пока нет.</p>}>
          <ul class="personal-dashboard-items">
            <For each={source.tasks()}>{(task) => <li><a href={`/app/tasks/${task.id}`}>{task.name}</a></li>}</For>
          </ul>
        </Show>
      </Show>
    </Show>
  );
}

function CalendarContent(props: { ownerId: string; connected: () => boolean }) {
  const occurrences = useDashboardOccurrences(props.ownerId, props.connected);
  const items = () => occurrences.isSuccess && !occurrences.isPlaceholderData
    ? (occurrences.data?.items ?? []).filter((item) => !item.occurrence.isCancelled).slice(0, 5)
    : [];
  return (
    <Show when={props.connected()} fallback={<p>Не подключено: добавьте календарь в настройках интеграций.</p>}>
      <Show when={!occurrences.isLoading} fallback={<p role="status">Загружаем события…</p>}>
        <Show when={!occurrences.isError} fallback={
          <p role="alert">Не удалось загрузить события. <button type="button" onClick={() => void occurrences.refetch()}>Повторить</button></p>
        }>
          <Show when={items().length > 0} fallback={<p>На ближайшие семь дней событий нет.</p>}>
            <ul class="personal-dashboard-items">
              <For each={items()}>{(item) => <li>{item.event.title}</li>}</For>
            </ul>
          </Show>
        </Show>
      </Show>
    </Show>
  );
}

function DashboardCard(props: {
  ownerId: string;
  widget: DashboardWidget;
  index: number;
  count: number;
  connected: () => boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (widget: DashboardWidget) => void;
}) {
  return (
    <section class="personal-dashboard-card" aria-label={labels[props.widget]}>
      <div class="personal-dashboard-card-header">
        <h3>{labels[props.widget]}</h3>
        <div class="personal-dashboard-card-controls">
          <button type="button" title="Переместить выше" aria-label={`Переместить ${labels[props.widget]} выше`}
            disabled={props.index === 0} onClick={() => props.onMove(props.index, -1)}>Вверх</button>
          <button type="button" title="Переместить ниже" aria-label={`Переместить ${labels[props.widget]} ниже`}
            disabled={props.index === props.count - 1} onClick={() => props.onMove(props.index, 1)}>Вниз</button>
          <button type="button" title="Убрать с доски" aria-label={`Убрать ${labels[props.widget]} с доски`}
            onClick={() => props.onRemove(props.widget)}>Убрать</button>
        </div>
      </div>
      <Show when={props.widget === 'tasks'}><TaskContent ownerId={props.ownerId} /></Show>
      <Show when={props.widget === 'calendar'}><CalendarContent ownerId={props.ownerId} connected={props.connected} /></Show>
      <Show when={props.widget === 'transcript'}><p>Не подключено: нет списка завершённых разговоров с проверкой доступа к расшифровке.</p></Show>
      <Help title={labels[props.widget]}>
        <Show when={props.widget === 'tasks'}>Незавершённые задачи, назначенные вам. Источник: доступные вам задачи; порядок — по последнему обновлению. До пяти записей, обновление при открытии.</Show>
        <Show when={props.widget === 'calendar'}>События ваших подключённых календарей на ближайшие семь дней. Источник: календарь и доступные вам события; обновление при открытии.</Show>
        <Show when={props.widget === 'transcript'}>Расшифровка недоступна, пока сервис не предоставит проверенный список завершённых разговоров и отдельную проверку доступа. Никакие чужие записи не отображаются.</Show>
      </Help>
    </section>
  );
}

/** Owner-keyed Home island: unmounting A disposes A's draft and source subscriptions. */
export function PersonalDashboard(props: { ownerId: string }) {
  const query = usePersonalDashboardQuery(props.ownerId);
  const calendars = useDashboardCalendars(props.ownerId);
  const [draft, setDraft] = createSignal<DashboardLayout | null>(null);
  const [acknowledged, setAcknowledged] = createSignal<DashboardLayout | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal('');
  const [announcement, setAnnouncement] = createSignal('');
  const [editedAfterRead, setEditedAfterRead] = createSignal(false);
  const connected = () => calendars.isSuccess && (calendars.data?.length ?? 0) > 0;
  const baseline = createMemo(() => {
    const fromServer = query.isPending ? null : (query.data ?? null);
    const local = acknowledged();
    return local && (!fromServer || local.revision >= fromServer.revision) ? local : fromServer;
  });
  const layout = () => draft() ?? baseline() ?? firstDashboardLayout();
  const ready = () => query.isSuccess || acknowledged() !== null || editedAfterRead();
  const dirty = () => draft() !== null;

  const change = (next: DashboardLayout) => {
    if (query.isSuccess) setEditedAfterRead(true);
    setDraft(next);
    setSaveError('');
  };
  const choosePreset = (preset: DashboardPreset) => {
    change({ ...layout(), preset, widgets: [...presetWidgets[preset]] });
    setAnnouncement(`Пресет «${presetLabels[preset]}» выбран. Изменения не сохранены.`);
  };
  const move = (index: number, direction: -1 | 1) => {
    const widgets = reorderWidget(layout().widgets, index, direction);
    if (widgets === layout().widgets) return;
    change({ ...layout(), widgets });
    setAnnouncement('Раздел перемещён. Изменения не сохранены.');
  };
  const remove = (widget: DashboardWidget) => {
    change({ ...layout(), widgets: layout().widgets.filter((item) => item !== widget) });
    setAnnouncement(`${labels[widget]} убран с доски. Изменения не сохранены.`);
  };
  const add = (widget: DashboardWidget) => {
    change({ ...layout(), widgets: [...layout().widgets, widget] });
    setAnnouncement(`${labels[widget]} добавлен на доску. Изменения не сохранены.`);
  };
  const save = async () => {
    if (saving() || !ready() || !dirty()) return;
    const current = draft();
    if (!current) return;
    const next = { ...current, revision: (baseline()?.revision ?? 0) + 1 };
    setSaving(true);
    setSaveError('');
    try {
      const saved = await savePersonalDashboard(props.ownerId, next);
      setAcknowledged(saved);
      if (draft() === current) setDraft(null);
      else setDraft((newer) => newer && { ...newer, revision: saved.revision });
      setAnnouncement('Личная доска сохранена.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      setSaveError(reason.includes('409')
        ? 'Доска изменена в другом окне. Обновите данные и повторите сохранение своего порядка.'
        : 'Не удалось сохранить доску. Ваши изменения остались здесь; повторите попытку.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section class="personal-dashboard" aria-labelledby="personal-dashboard-title">
      <header class="personal-dashboard-top">
        <div><h2 id="personal-dashboard-title">Личная доска</h2><p>Ваш порядок задач и событий хранится в аккаунте. Ассистент остаётся ниже.</p></div>
        <Show when={dirty()}><span class="personal-dashboard-unsaved">Не сохранено</span></Show>
      </header>
      <p class="sr-only" aria-live="polite">{announcement()}</p>
      <Show when={!query.isPending} fallback={<p role="status">Загружаем личную доску…</p>}>
        <Show when={ready()} fallback={
          <div role="alert" class="personal-dashboard-error">Не удалось прочитать личную доску. Мы не заменили её пустой. <button type="button" onClick={() => void query.refetch()}>Повторить загрузку</button></div>
        }>
          <Show when={query.isError}><p role="alert" class="personal-dashboard-error">Не удалось обновить доску. Ваш несохранённый порядок сохранён в этом окне. <button type="button" onClick={() => void query.refetch()}>Повторить загрузку</button></p></Show>
          <div class="personal-dashboard-editor">
            <fieldset><legend>Пресет</legend><div class="personal-dashboard-actions">
              <For each={(['focus', 'day', 'blank'] as const)}>{(preset) =>
                <button type="button" aria-pressed={layout().preset === preset} disabled={preset === 'day' && !connected()}
                  title={preset === 'day' && !connected() ? 'Подключите календарь, чтобы выбрать этот пресет' : `Применить пресет «${presetLabels[preset]}»`}
                  onClick={() => choosePreset(preset)}>{presetLabels[preset]}</button>
              }</For>
            </div></fieldset>
            <fieldset><legend>Добавить раздел</legend><div class="personal-dashboard-actions">
              <For each={(['tasks', 'calendar'] as const)}>{(widget) =>
                <Show when={!layout().widgets.includes(widget)}>
                  <button type="button" disabled={widget === 'calendar' && !connected()}
                    title={widget === 'calendar' && !connected() ? 'Сначала подключите календарь' : `Добавить ${labels[widget]}`}
                    onClick={() => add(widget)}>{labels[widget]}</button>
                </Show>
              }</For>
            </div></fieldset>
          </div>
          <Show when={calendars.isError}><p role="alert" class="personal-dashboard-error">Не удалось проверить подключение календаря. <button type="button" onClick={() => void calendars.refetch()}>Повторить</button></p></Show>
          <Show when={layout().widgets.length > 0} fallback={<p class="personal-dashboard-empty">На доске пока нет разделов. Выберите пресет или добавьте задачу.</p>}>
            <div class="personal-dashboard-grid"><For each={layout().widgets}>{(widget) =>
              <DashboardCard ownerId={props.ownerId} widget={widget} index={layout().widgets.indexOf(widget)} count={layout().widgets.length}
                connected={connected} onMove={move} onRemove={remove} />
            }</For></div>
          </Show>
          <Show when={saveError()}><p role="alert" class="personal-dashboard-error">{saveError()}</p></Show>
          <div class="personal-dashboard-save"><button type="button" disabled={!dirty() || saving() || !query.isSuccess}
            onClick={() => void save()}>{saving() ? 'Сохраняем…' : 'Сохранить порядок'}</button>
            <span>{dirty() ? 'Изменения станут доступны на других устройствах после сохранения.' : 'Все изменения сохранены.'}</span>
          </div>
        </Show>
      </Show>
    </section>
  );
}
