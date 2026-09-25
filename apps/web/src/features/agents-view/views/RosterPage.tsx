import { botAssignableChannelOptions } from '@app/features/channel/Bots/botChannelOptions';
import {
  canDeleteBot,
  canManageAgent,
} from '@app/features/channel/Bots/botPermissions';
import {
  MODEL_PRETTYNAME,
  type Model,
} from '@core/component/AI/constant/model';
import { toast } from '@core/component/Toast/Toast';
import {
  CURSOR_BOT_HANDLE,
  CURSOR_BOT_ID,
  CURSOR_BOT_NAME,
} from '@core/constant/cursorAgent';
import {
  MACRO_AGENT_BOT_ID,
  MACRO_AGENT_HANDLE,
  MACRO_AGENT_NAME,
  MACRO_HARNESS_NAME,
} from '@core/constant/macroAgent';
import { useSettingsState } from '@core/constant/SettingsState';
import { useChannelsContext } from '@core/context/channels';
import { useUserId } from '@core/context/user';
import MacroLogo from '@icon/macro-logo.svg';
import CursorIcon from '@icon/wide-cursor-ide.svg';
import CodeIcon from '@phosphor/code.svg';
import CopyIcon from '@phosphor/copy.svg';
import GearIcon from '@phosphor/gear.svg';
import PencilIcon from '@phosphor/pencil-simple.svg';
import PlugsIcon from '@phosphor/plugs.svg';
import PlusIcon from '@phosphor/plus.svg';
import RobotIcon from '@phosphor/robot.svg';
import TrashIcon from '@phosphor/trash.svg';
import XIcon from '@phosphor/x.svg';
import {
  type AgentWithHarnessId,
  useAgentsQuery,
} from '@queries/agents/agents';
import { useCursorApiKeyStatusQuery } from '@queries/auth/cursor-api-key';
import { useHarnessesQuery } from '@queries/harnesses/harnesses';
import { useCurrentTeamQuery, useIsTeamOwner } from '@queries/team/teams';
import type { Harness } from '@service-storage/client';
import {
  createMemo,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { AgentAvatar } from '../components/AgentGlyph';
import { type AgentKind, kindForHarness } from '../core/agent-kind';
import { relativeAge } from '../core/format-age';
import { BYOA_AGENTS, BYOA_DOCS_URL } from '../core/links';
import { runtimeLabel } from '../core/roster';

const KIND = {
  agent: {
    title: 'Агенты',
    desc: 'Создавайте агентов с собственным именем, инструкциями и навыками.',
    cta: 'Создать агента',
    empty: 'Пока нет агентов.',
  },
  coder: {
    title: 'Агенты-разработчики',
    desc: 'Пишут код в выбранном вами репозитории и работают в подключённой среде.',
    cta: 'Создать агента-разработчика',
    empty:
      'Агентов-разработчиков пока нет. Создайте агента или подключите среду.',
  },
} as const satisfies Record<AgentKind, Record<string, string>>;

type Row = {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string;
  kind: AgentKind;
  share: 'system' | 'team' | 'private';
  runtime: string;
  model: string;
  channels: string;
  agent?: AgentWithHarnessId;
  canEdit: boolean;
  canDelete: boolean;
};

const MACRO_ROW: Row = {
  id: MACRO_AGENT_BOT_ID,
  name: MACRO_AGENT_NAME,
  handle: MACRO_AGENT_HANDLE,
  kind: 'agent',
  share: 'system',
  runtime: MACRO_HARNESS_NAME,
  model: 'Модель по умолчанию',
  channels: 'Все каналы',
  canEdit: false,
  canDelete: false,
};

function cursorRow(connected: boolean): Row {
  return {
    id: CURSOR_BOT_ID,
    name: CURSOR_BOT_NAME,
    handle: CURSOR_BOT_HANDLE,
    kind: 'coder',
    share: 'system',
    runtime: connected ? 'Cursor' : 'Cursor · не подключён',
    model: 'Модель Cursor по умолчанию',
    channels: 'Все каналы',
    canEdit: false,
    canDelete: false,
  };
}

/**
 * The settings-style roster inside the workspace: agents on one tab, coders
 * and their runtimes on the other. Editing happens in dialogs the host opens.
 */
export function RosterPage(props: {
  kind: AgentKind;
  onKindChange: (kind: AgentKind) => void;
  onClose: () => void;
  onCreate: (kind: AgentKind) => void;
  onEdit: (agent: AgentWithHarnessId) => void;
  onDelete: (agent: AgentWithHarnessId) => void;
  onPairRuntime: () => void;
  onRemoveRuntime: (harness: Harness) => void;
}) {
  const { openSettings } = useSettingsState();
  const userId = useUserId();
  const agentsQuery = useAgentsQuery();
  const harnessesQuery = useHarnessesQuery();
  const cursorStatus = useCursorApiKeyStatusQuery();
  const currentTeamQuery = useCurrentTeamQuery();
  const isTeamOwner = useIsTeamOwner();
  const channelsContext = useChannelsContext();
  const cursorConnected = () =>
    cursorStatus.isSuccess ? cursorStatus.data.registered : false;
  const harnesses = () => (harnessesQuery.isSuccess ? harnessesQuery.data : []);
  const teamId = () =>
    currentTeamQuery.isSuccess ? currentTeamQuery.data?.team.id : undefined;
  const channelOptions = createMemo(() =>
    botAssignableChannelOptions(channelsContext.channels())
  );

  const rows = createMemo((): Row[] =>
    (agentsQuery.isSuccess ? agentsQuery.data : []).map((agent) => {
      const selected = channelOptions()
        .filter((channel) => agent.channel_ids.includes(channel.id))
        .map((channel) => `#${channel.name}`);
      return {
        id: agent.bot.id,
        name: agent.bot.name,
        handle: agent.bot.handle,
        avatarUrl: agent.bot.avatar_url ?? undefined,
        kind: kindForHarness(agent.harness),
        share: agent.bot.owner?.type === 'team' ? 'team' : 'private',
        runtime: runtimeLabel(
          agent.harness,
          agent.harness_id ?? undefined,
          harnesses()
        ),
        model:
          MODEL_PRETTYNAME[agent.default_model as Model] ?? agent.default_model,
        channels:
          agent.channel_scope === 'all'
            ? 'All channels'
            : selected.length > 0
              ? selected.join(', ')
              : `${agent.channel_ids.length} selected ${agent.channel_ids.length === 1 ? 'channel' : 'channels'}`,
        agent,
        canEdit: canManageAgent(agent.bot, userId(), teamId()),
        canDelete: canDeleteBot(agent.bot, userId(), teamId(), isTeamOwner()),
      };
    })
  );
  const of = (kind: AgentKind, share: Row['share']) =>
    rows().filter((row) => row.kind === kind && row.share === share);
  const teamAgents = () => [MACRO_ROW, ...of('agent', 'team')];
  const privateAgents = () => of('agent', 'private');
  const teamCoders = () => [
    cursorRow(cursorConnected()),
    ...of('coder', 'team'),
  ];
  const privateCoders = () => of('coder', 'private');
  const agentCount = () => teamAgents().length + privateAgents().length;
  const coderCount = () => teamCoders().length + privateCoders().length;
  const copy = () => KIND[props.kind];

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // An open dialog owns Escape.
      if (document.querySelector('.agents-view-portal .overlay')) return;
      props.onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  const copyGuideLink = async () => {
    try {
      await navigator.clipboard.writeText(BYOA_DOCS_URL);
      toast.success('Ссылка скопирована');
    } catch {
      toast.failure('Не удалось скопировать ссылку');
    }
  };

  return (
    <section class="page settings" data-active aria-label="Агенты">
      <div class="wrap">
        <button
          type="button"
          class="icon-btn page-close"
          aria-label="Закрыть"
          title="Закрыть (Esc)"
          onClick={props.onClose}
        >
          <XIcon class="ph" />
        </button>
        <header class="ph-head">
          <div>
            <h1 class="big">{copy().title}</h1>
            <p class="desc">{copy().desc}</p>
          </div>
          <button
            type="button"
            class="cta"
            onClick={() => props.onCreate(props.kind)}
          >
            <PlusIcon class="ph" />
            <span>{copy().cta}</span>
          </button>
        </header>
        <div class="tabs" role="tablist" aria-label="Тип агента">
          <button
            type="button"
            role="tab"
            aria-selected={props.kind === 'agent'}
            onClick={() => props.onKindChange('agent')}
          >
            <RobotIcon class="ph" />
            Агенты
            <span class="n">{agentCount()}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={props.kind === 'coder'}
            onClick={() => props.onKindChange('coder')}
          >
            <CodeIcon class="ph" />
            Агенты-разработчики
            <span class="n">{coderCount()}</span>
          </button>
        </div>

        <Show when={props.kind === 'agent'}>
          <div class="sections" data-kind="agents" role="tabpanel">
            <Section
              title="Агенты команды"
              description="Агенты, доступные команде, включая Macro."
            >
              <Rows
                rows={teamAgents()}
                empty={KIND.agent.empty}
                loading={agentsQuery.isPending}
                onEdit={props.onEdit}
                onDelete={props.onDelete}
              />
            </Section>
            <Section
              title="Личные агенты"
              description="Агенты, доступные только вам."
            >
              <Rows
                rows={privateAgents()}
                empty={KIND.agent.empty}
                loading={agentsQuery.isPending}
                onEdit={props.onEdit}
                onDelete={props.onDelete}
              />
            </Section>
          </div>
        </Show>

        <Show when={props.kind === 'coder'}>
          <div class="sections" data-kind="coders" role="tabpanel">
            <Section
              title="Агенты-разработчики команды"
              description="Агенты-разработчики, доступные команде."
            >
              <Rows
                rows={teamCoders()}
                empty={KIND.coder.empty}
                loading={agentsQuery.isPending}
                onEdit={props.onEdit}
                onDelete={props.onDelete}
              />
            </Section>
            <Section
              title="Личные агенты-разработчики"
              description="Агенты-разработчики, доступные только вам."
            >
              <Rows
                rows={privateCoders()}
                empty={KIND.coder.empty}
                loading={agentsQuery.isPending}
                onEdit={props.onEdit}
                onDelete={props.onDelete}
              />
            </Section>
            <Section
              title="Среды выполнения"
              description="Где работают агенты-разработчики. Встроенные среды всегда доступны; подключённые — пока работает ваш компьютер."
              card={false}
            >
              <div class="scard runtimes">
                <div id="runtimeList">
                  <RuntimeRow
                    icon={<MacroLogo class="ph" />}
                    name={MACRO_HARNESS_NAME}
                    badge="system"
                    sub="Встроенная среда · работает в облаке Macro"
                    connected
                    status="Подключено"
                  >
                    <button
                      type="button"
                      class="icon-btn"
                      aria-label={`Настроить ${MACRO_HARNESS_NAME}`}
                      onClick={() => openSettings('Harness')}
                    >
                      <GearIcon class="ph" />
                    </button>
                  </RuntimeRow>
                  <RuntimeRow
                    icon={<CursorIcon class="ph" />}
                    name="Cursor"
                    badge="system"
                    sub={
                      cursorConnected()
                        ? 'Облачные агенты · подключён ключ Cursor API'
                        : 'Облачные агенты · подключите ключ Cursor API'
                    }
                    connected={cursorConnected()}
                    status={cursorConnected() ? 'Подключено' : 'Не подключено'}
                  >
                    <button
                      type="button"
                      class="icon-btn"
                      aria-label="Настроить Cursor"
                      onClick={() => openSettings('Harness')}
                    >
                      <GearIcon class="ph" />
                    </button>
                  </RuntimeRow>
                  <For each={harnesses()}>
                    {(harness) => (
                      <RuntimeRow
                        icon={<PlugsIcon class="ph" />}
                        name={harness.name}
                        badge={
                          harness.owner.type === 'team' ? 'team' : 'private'
                        }
                        sub={`macrod · подключено ${relativeAge(Date.parse(harness.created_at))}`}
                        connected={harness.connected}
                        status={
                          harness.connected
                            ? 'Подключено'
                            : harness.last_connected_at
                              ? `Отключено · был на связи ${relativeAge(Date.parse(harness.last_connected_at))}`
                              : 'Отключено · ещё не подключалось'
                        }
                      >
                        <button
                          type="button"
                          class="icon-btn neg"
                          aria-label={`Удалить ${harness.name}`}
                          style={{ color: 'var(--red)' }}
                          onClick={() => props.onRemoveRuntime(harness)}
                        >
                          <TrashIcon class="ph" />
                        </button>
                      </RuntimeRow>
                    )}
                  </For>
                </div>
                <div class="byoa footer">
                  <div>
                    <h2>
                      <PlugsIcon class="ph" />
                      <span>
                        Подключите <RotatingWord /> к Macro
                      </span>
                    </h2>
                    <p>
                      Запустите агента на своём компьютере и добавьте его в
                      Macro. Подключите его один раз через <code>macrod</code>:
                      затем его можно будет упоминать в каналах и запускать
                      отсюда, как любого другого агента. Поддерживаются агенты с
                      ACP.
                    </p>
                  </div>
                  <div class="side">
                    <button
                      type="button"
                      class="cta"
                      style={{ 'justify-content': 'center' }}
                      onClick={props.onPairRuntime}
                    >
                      <PlugsIcon class="ph" />
                      Подключить среду
                    </button>
                    <div class="snippet">
                      <span title={BYOA_DOCS_URL}>{BYOA_DOCS_URL}</span>
                      <button
                        type="button"
                        class="icon-btn"
                        aria-label="Скопировать ссылку на руководство"
                        onClick={() => void copyGuideLink()}
                      >
                        <CopyIcon class="ph" />
                      </button>
                    </div>
                    <a
                      class="link-btn"
                      style={{ 'justify-content': 'center' }}
                      href={BYOA_DOCS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Читать руководство macrod
                    </a>
                  </div>
                </div>
              </div>
            </Section>
          </div>
        </Show>
      </div>
    </section>
  );
}

function Section(props: {
  title: string;
  description: string;
  card?: boolean;
  children: JSX.Element;
}) {
  return (
    <div class="section">
      <div class="sh">
        <h2>{props.title}</h2>
        <p>{props.description}</p>
      </div>
      <Show when={props.card !== false} fallback={props.children}>
        <div class="scard">{props.children}</div>
      </Show>
    </div>
  );
}

function Rows(props: {
  rows: Row[];
  empty: string;
  loading: boolean;
  onEdit: (agent: AgentWithHarnessId) => void;
  onDelete: (agent: AgentWithHarnessId) => void;
}) {
  return (
    <Show
      when={props.rows.length > 0}
      fallback={
        <p class="empty-row">
          {props.loading ? 'Загрузка агентов…' : props.empty}
        </p>
      }
    >
      <For each={props.rows}>
        {(row) => (
          <div class="arow">
            <AgentAvatar
              agent={{
                id: row.id,
                botId: row.id,
                name: row.name,
                avatarUrl: row.avatarUrl,
              }}
              coder={row.kind === 'coder'}
            />
            <div class="info">
              <div class="line">
                <span class="nm truncate">{row.name}</span>
                <span class="tag truncate">@{row.handle}</span>
                <span class={row.share === 'system' ? 'badge system' : 'badge'}>
                  {row.share === 'system'
                    ? 'Системный'
                    : row.share === 'team'
                      ? 'Команда'
                      : 'Личный'}
                </span>
              </div>
              <p class="sub truncate">
                {row.kind === 'coder' ? `${row.runtime} · ` : ''}
                {row.model} · {row.channels}
              </p>
            </div>
            <div class="acts">
              <Show when={row.agent && row.canEdit}>
                <button
                  type="button"
                  class="icon-btn"
                  aria-label={`Изменить ${row.name}`}
                  onClick={() => row.agent && props.onEdit(row.agent)}
                >
                  <PencilIcon class="ph" />
                </button>
              </Show>
              <Show when={row.agent && row.canDelete}>
                <button
                  type="button"
                  class="icon-btn neg"
                  aria-label={`Удалить ${row.name}`}
                  onClick={() => row.agent && props.onDelete(row.agent)}
                >
                  <TrashIcon class="ph" />
                </button>
              </Show>
            </div>
          </div>
        )}
      </For>
    </Show>
  );
}

function RuntimeRow(props: {
  icon: JSX.Element;
  name: string;
  badge: 'system' | 'team' | 'private';
  sub: string;
  connected: boolean;
  status: string;
  children: JSX.Element;
}) {
  return (
    <div class="rt">
      <span class="ic">{props.icon}</span>
      <div style={{ 'min-width': 0 }}>
        <div class="nm">
          <span class="truncate">{props.name}</span>
          <span class={props.badge === 'system' ? 'badge system' : 'badge'}>
            {props.badge === 'system'
              ? 'Системный'
              : props.badge === 'team'
                ? 'Команда'
                : 'Личный'}
          </span>
        </div>
        <div class="sub truncate">{props.sub}</div>
      </div>
      <span class={props.connected ? 'conn' : 'conn off'}>{props.status}</span>
      <div class="acts">{props.children}</div>
    </div>
  );
}

/**
 * "Bring your <agent> to Macro": the name rolls through the supported CLIs,
 * and the slot animates to each word's width so the sentence stays tight.
 */
function RotatingWord() {
  const [index, setIndex] = createSignal(0);
  const [phase, setPhase] = createSignal<'idle' | 'out' | 'in'>('idle');
  let host: HTMLSpanElement | undefined;
  let measure: HTMLSpanElement | undefined;

  onMount(() => {
    const fit = (word: string) => {
      if (!host || !measure) return;
      measure.textContent = word;
      host.style.width = `${measure.offsetWidth}px`;
    };
    fit(BYOA_AGENTS[index()] ?? '');
    void document.fonts?.ready.then(() => fit(BYOA_AGENTS[index()] ?? ''));
    if (
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const timer = setInterval(() => {
      if (!host?.offsetParent) return;
      setPhase('out');
      setTimeout(() => {
        const next = (index() + 1) % BYOA_AGENTS.length;
        setIndex(next);
        fit(BYOA_AGENTS[next] ?? '');
        setPhase('in');
        requestAnimationFrame(() => setPhase('idle'));
      }, 380);
    }, 2200);
    onCleanup(() => clearInterval(timer));
  });

  return (
    <span class="rot" ref={host} aria-live="off">
      <span class="measure" ref={measure} />
      <span class={phase() === 'idle' ? 'w' : `w ${phase()}`}>
        {BYOA_AGENTS[index()]}
      </span>
    </span>
  );
}
