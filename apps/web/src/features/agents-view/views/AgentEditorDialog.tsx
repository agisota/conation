import { botAssignableChannelOptions } from '@app/features/channel/Bots/botChannelOptions';
import {
  addMcpServer,
  catalogEntryToMcpServer,
  removeMcpServer,
} from '@app/features/settings/agentMcpServers';
import { useChannelsContext } from '@core/context/channels';
import { PipedreamConnectorIcon } from '@core/pipedream/ConnectorIcon';
import { createPipedreamCatalogSearch } from '@core/pipedream/catalog';
import { usePipedreamMcpFlag } from '@core/pipedream/flag';
import MacroLogo from '@icon/macro-logo.svg';
import CursorIcon from '@icon/wide-cursor-ide.svg';
import CheckIcon from '@phosphor/check.svg';
import MagnifyingGlassIcon from '@phosphor/magnifying-glass.svg';
import PlugsIcon from '@phosphor/plugs.svg';
import PlusIcon from '@phosphor/plus.svg';
import TrashIcon from '@phosphor/trash.svg';
import XIcon from '@phosphor/x.svg';
import type {
  AgentWithHarnessId,
  CreateAgentParams,
} from '@queries/agents/agents';
import { useAgentModelsQueries } from '@queries/agents/models';
import { usePipedreamConnectedSlugs } from '@queries/pipedream-connectors';
import type { AgentMcpServer } from '@service-storage/generated/schemas/agentMcpServer';
import type { AgentMcpServers } from '@service-storage/generated/schemas/agentMcpServers';
import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { AgentIcon, CodeMark } from '../components/AgentGlyph';
import { ArtifactDialog } from '../components/ArtifactDialog';
import { Segmented } from '../components/Segmented';
import { type AgentKind, isCoderHarness } from '../core/agent-kind';
import type { ConnectedRuntime } from '../queries/connected-runtimes';

function slugTag(value: string): string {
  return value
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Create or edit an agent: identity and settings on the left, instructions
 * on the right. A coder is an agent bound to a coding runtime, so the Coder
 * switch decides whether the Runtime list shows and what the save sends.
 */
export function AgentEditorDialog(props: {
  agent?: AgentWithHarnessId;
  initialKind: AgentKind;
  runtimes: readonly ConnectedRuntime[];
  currentTeamId?: string;
  canShareWithTeam: boolean;
  canMakePrivate: boolean;
  pending: boolean;
  onClose: () => void;
  onSave: (agent: CreateAgentParams) => Promise<boolean>;
  onDelete?: () => void;
}) {
  const isNew = () => props.agent === undefined;
  const coderRuntimes = () =>
    props.runtimes.filter((runtime) => runtime.id !== 'in-memory');
  const [coder, setCoder] = createSignal(
    props.agent
      ? isCoderHarness(props.agent.harness)
      : props.initialKind === 'coder'
  );
  const noun = () => (coder() ? 'агента-разработчика' : 'агента');
  const [name, setName] = createSignal(props.agent?.bot.name ?? '');
  const [tag, setTag] = createSignal(props.agent?.bot.handle ?? '');
  const [tagEdited, setTagEdited] = createSignal(props.agent !== undefined);
  const [avatarUrl, setAvatarUrl] = createSignal<string | undefined>(
    props.agent?.bot.avatar_url ?? undefined
  );
  const [instructions, setInstructions] = createSignal(
    props.agent?.instructions ?? ''
  );
  const [harnessId, setHarnessId] = createSignal(
    props.agent?.harness_id ??
      props.agent?.harness ??
      (coder() ? coderRuntimes()[0]?.id : 'in-memory') ??
      ''
  );
  let avatarInput: HTMLInputElement | undefined;

  // Model discovery per runtime, so switching runtimes swaps the catalog.
  const modelQueries = useAgentModelsQueries(() =>
    props.runtimes.map((runtime) => runtime.target)
  );
  const runtime = () =>
    props.runtimes.find((candidate) => candidate.id === harnessId());
  const modelQueryFor = (id: string) => {
    const index = props.runtimes.findIndex((candidate) => candidate.id === id);
    return index >= 0 ? modelQueries[index] : undefined;
  };
  const modelDataFor = (id: string) => {
    const query = modelQueryFor(id);
    return query?.isSuccess ? query.data : undefined;
  };
  const preferredModelId = (id: string) => {
    const data = modelDataFor(id);
    if (data?.status === 'unsupported') return 'default';
    if (data?.status !== 'available') return '';
    const current = data.currentModel;
    if (
      current &&
      (data.models.length === 0 ||
        data.models.some((model) => model.id === current))
    ) {
      return current;
    }
    return data.models[0]?.id ?? '';
  };
  const [defaultModelId, setDefaultModelId] = createSignal(
    props.agent?.default_model ?? ''
  );
  const selectedDefaultModelId = () =>
    defaultModelId() || preferredModelId(harnessId());
  const modelOptions = () => {
    const data = modelDataFor(harnessId());
    if (data?.status !== 'available') return [];
    const selected = selectedDefaultModelId();
    const saved =
      props.agent?.default_model === selected &&
      (props.agent.harness_id ?? props.agent.harness) === harnessId();
    if (!selected || data.models.some((model) => model.id === selected)) {
      return data.models;
    }
    return [
      ...data.models,
      {
        id: selected,
        name: `${selected} (${saved ? 'сохранена, ' : ''}недоступна)`,
        description: undefined,
        group: undefined,
      },
    ];
  };

  const changeRuntime = (id: string) => {
    setHarnessId(id);
    setDefaultModelId(preferredModelId(id));
  };
  const setCoderMode = (on: boolean) => {
    if (on && coderRuntimes().length === 0) return;
    setCoder(on);
    changeRuntime(on ? (coderRuntimes()[0]?.id ?? '') : 'in-memory');
  };

  const [channelMode, setChannelMode] = createSignal<'all' | 'selected'>(
    props.agent?.channel_scope ?? 'all'
  );
  const [selectedChannelIds, setSelectedChannelIds] = createSignal<string[]>(
    props.agent?.channel_ids ?? []
  );
  const channelsContext = useChannelsContext();
  const channels = createMemo(() =>
    botAssignableChannelOptions(channelsContext.channels())
  );
  const toggleChannel = (id: string) =>
    setSelectedChannelIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );

  const [share, setShare] = createSignal<'private' | 'team'>(
    props.agent?.bot.owner?.type === 'team' ? 'team' : 'private'
  );

  const pipedreamMcp = usePipedreamMcpFlag();
  const connections = usePipedreamConnectedSlugs();
  const [mcp, setMcp] = createSignal<AgentMcpServers>(
    props.agent?.mcp ?? { scope: 'owner_connections' }
  );
  const picked = (): AgentMcpServer[] => {
    const current = mcp();
    return current.scope === 'selected' ? current.servers : [];
  };
  // Picks survive a round trip through "All my MCPs", so comparing the two
  // does not throw the list away.
  let remembered: AgentMcpServer[] = picked();
  const setMcpScope = (scope: AgentMcpServers['scope']) => {
    if (scope === 'selected')
      setMcp({ scope: 'selected', servers: remembered });
    else {
      remembered = picked();
      setMcp({ scope: 'owner_connections' });
    }
  };
  const setPicked = (servers: AgentMcpServer[]) => {
    remembered = servers;
    setMcp({ scope: 'selected', servers });
  };
  const pickedSlugs = createMemo<ReadonlySet<string>>(
    () => new Set(picked().map((server) => server.app_slug))
  );
  const catalog = createPipedreamCatalogSearch(pickedSlugs);

  const handleNameInput = (value: string) => {
    setName(value);
    if (!tagEdited()) setTag(slugTag(value));
  };
  const handleAvatar = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') setAvatarUrl(reader.result);
    });
    reader.readAsDataURL(file);
  };

  const canSave = () =>
    !props.pending &&
    name().trim().length > 0 &&
    tag().trim().length > 0 &&
    runtime() !== undefined &&
    selectedDefaultModelId().length > 0 &&
    (channelMode() === 'all' || selectedChannelIds().length > 0) &&
    (mcp().scope === 'owner_connections' || picked().length > 0) &&
    (share() === 'private' ? props.canMakePrivate : props.canShareWithTeam);

  const submit = async () => {
    const current = runtime();
    if (!canSave() || !current) return;
    const owner = props.agent?.bot.owner;
    const saved = await props.onSave({
      avatarUrl: avatarUrl(),
      channelIds: channelMode() === 'all' ? [] : selectedChannelIds(),
      channelScope: channelMode(),
      defaultModel: selectedDefaultModelId(),
      handle: slugTag(tag()),
      // Paired macrod runtimes send the 'macrod' slug plus their uuid;
      // built-ins send their own slug with no runtime id.
      harness: current.kind === 'macrod' ? 'macrod' : current.id,
      harnessId: current.kind === 'macrod' ? current.id : undefined,
      name: name().trim(),
      instructions: instructions().trim(),
      mcp: mcp(),
      teamId:
        share() === 'team'
          ? owner?.type === 'team'
            ? owner.team_id
            : props.currentTeamId
          : undefined,
    });
    if (saved) props.onClose();
  };

  const glyphAgent = () => ({
    id: props.agent?.bot.id ?? 'new',
    name: name() || 'Агент',
  });

  return (
    <ArtifactDialog
      class="xwide fixed"
      label={`${isNew() ? 'Создать' : 'Изменить'} ${noun()}`}
      onClose={props.onClose}
    >
      <div class="dh">
        <span class="t">
          <AgentIcon agent={glyphAgent()} />
          {isNew() ? 'Создать' : 'Изменить'} {noun()}
        </span>
        <span class="hr">
          <Segmented
            name="share"
            value={share()}
            options={[
              {
                value: 'private',
                label: 'Личный',
                icon: 'lock',
                disabled: !props.canMakePrivate,
              },
              {
                value: 'team',
                label: 'Команда',
                icon: 'team',
                disabled: !props.canShareWithTeam,
              },
            ]}
            onChange={setShare}
          />
          <button
            type="button"
            class="icon-btn"
            aria-label="Закрыть"
            data-close
          >
            <XIcon class="ph" />
          </button>
        </span>
      </div>
      <div class="db">
        <div class="cols agent">
          <div class="colL">
            <div class="avrow" style={{ border: 0, padding: 0 }}>
              <span class="avw">
                <button
                  type="button"
                  class="bigav"
                  aria-label="Изменить аватар"
                  onClick={() => avatarInput?.click()}
                >
                  <Show
                    when={avatarUrl()}
                    fallback={<AgentIcon agent={glyphAgent()} />}
                  >
                    {(url) => (
                      <img
                        src={url()}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          'object-fit': 'cover',
                          'border-radius': 'inherit',
                        }}
                      />
                    )}
                  </Show>
                </button>
                <CodeMark hidden={!coder()} />
              </span>
              <input
                ref={avatarInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) =>
                  handleAvatar(event.currentTarget.files?.[0])
                }
              />
              <div style={{ 'min-width': 0, flex: 1 }}>
                <input
                  class="sinput"
                  aria-label="Имя агента"
                  placeholder="Имя агента"
                  style={{ 'font-weight': 500 }}
                  value={name()}
                  onInput={(event) =>
                    handleNameInput(event.currentTarget.value)
                  }
                />
                <span class="tagin" style={{ 'margin-top': '6px' }}>
                  <span class="at">@</span>
                  <input
                    aria-label="Короткое имя"
                    placeholder="короткое-имя"
                    value={tag()}
                    onInput={(event) => {
                      setTagEdited(true);
                      setTag(slugTag(event.currentTarget.value));
                    }}
                  />
                </span>
              </div>
            </div>

            <Show when={coder()}>
              <div class="divider" />
              <p class="grp-h">Среда выполнения</p>
              <div
                class="plist"
                role="radiogroup"
                aria-label="Среда выполнения"
              >
                <For
                  each={coderRuntimes()}
                  fallback={
                    <p class="empty">
                      Подключите Cursor или среду выполнения, затем вернитесь
                      сюда.
                    </p>
                  }
                >
                  {(candidate) => (
                    <button
                      type="button"
                      class="prow"
                      role="radio"
                      aria-checked={harnessId() === candidate.id}
                      onClick={() => changeRuntime(candidate.id)}
                    >
                      <span class="cb rd" />
                      <Show
                        when={candidate.kind === 'macrod'}
                        fallback={
                          <Show
                            when={candidate.id === 'cursor'}
                            fallback={<MacroLogo class="ph" />}
                          >
                            <CursorIcon class="ph" />
                          </Show>
                        }
                      >
                        <PlugsIcon class="ph" />
                      </Show>
                      <span class="truncate">{candidate.name}</span>
                      <span class="meta">
                        <Show
                          when={candidate.kind === 'macrod'}
                          fallback={
                            candidate.id === 'cursor' ? 'облако' : 'встроенная'
                          }
                        >
                          <span class={candidate.connected ? 'on' : 'off'}>
                            {candidate.connected
                              ? 'Подключено'
                              : 'Не подключено'}
                          </span>
                        </Show>
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <div class="srow">
              <span class="lab">Модель по умолчанию</span>
              <Show
                when={modelQueryFor(harnessId())}
                fallback={
                  <span class="sinput sm" style={{ color: 'var(--ink-muted)' }}>
                    Модели недоступны
                  </span>
                }
              >
                {(query) => (
                  <Switch>
                    <Match when={query().isPending}>
                      <select
                        class="sinput sm"
                        aria-label="Default model"
                        disabled
                      >
                        <option>Загрузка моделей…</option>
                      </select>
                    </Match>
                    <Match when={query().isError}>
                      <span
                        style={{ 'font-size': '12px', color: 'var(--red)' }}
                      >
                        Could not load models.{' '}
                        <button
                          type="button"
                          class="link-btn"
                          onClick={() => void query().refetch()}
                        >
                          Retry
                        </button>
                      </span>
                    </Match>
                    <Match
                      when={modelDataFor(harnessId())?.status !== 'available'}
                    >
                      <span
                        class="sinput sm"
                        style={{ color: 'var(--ink-muted)' }}
                      >
                        Выбрана средой выполнения
                      </span>
                    </Match>
                    <Match when={true}>
                      <select
                        class="sinput sm"
                        aria-label="Default model"
                        value={selectedDefaultModelId()}
                        onChange={(event) =>
                          setDefaultModelId(event.currentTarget.value)
                        }
                      >
                        <For each={modelOptions()}>
                          {(model) => (
                            <option value={model.id}>{model.name}</option>
                          )}
                        </For>
                      </select>
                    </Match>
                  </Switch>
                )}
              </Show>
            </div>

            <Show when={pipedreamMcp()}>
              <div class="divider" />
              <div class="grp-row">
                <p class="grp-h">Подключения</p>
                <Segmented
                  name="mcp"
                  value={mcp().scope}
                  options={[
                    { value: 'owner_connections', label: 'Все мои интеграции' },
                    { value: 'selected', label: 'Выбранные интеграции' },
                  ]}
                  onChange={setMcpScope}
                />
              </div>
              <Show
                when={mcp().scope === 'selected'}
                fallback={
                  <p
                    style={{
                      margin: 0,
                      'font-size': '12px',
                      color: 'var(--ink-disabled)',
                    }}
                  >
                    Агент сможет использовать все приложения, подключённые
                    запускающим его пользователем.
                  </p>
                }
              >
                <div class="picker">
                  <div class="csearch">
                    <MagnifyingGlassIcon class="ph" />
                    <input
                      placeholder="Поиск интеграций…"
                      aria-label="Поиск интеграций"
                      value={catalog.searchInput()}
                      onInput={(event) =>
                        catalog.onSearchInput(event.currentTarget.value)
                      }
                    />
                  </div>
                  <Show when={catalog.searchInput().trim().length > 0}>
                    <div class="results" aria-label="Connector results">
                      <Show
                        when={
                          !catalog.query.isPending &&
                          catalog.entries().length === 0
                        }
                      >
                        <div class="empty">Совпадений не найдено.</div>
                      </Show>
                      <For each={catalog.entries()}>
                        {(entry) => (
                          <button
                            type="button"
                            class="crow"
                            onClick={() => {
                              setPicked(
                                addMcpServer(
                                  picked(),
                                  catalogEntryToMcpServer(entry)
                                )
                              );
                              catalog.onSearchInput('');
                            }}
                          >
                            <span class="mk">
                              <PipedreamConnectorIcon
                                appSlug={entry.app_slug}
                                class="size-4"
                              />
                            </span>
                            <span style={{ 'min-width': 0 }}>
                              <span class="nm truncate">
                                {entry.display_name}
                              </span>
                              <span class="ds truncate">
                                {entry.description}
                              </span>
                            </span>
                            <span class="add">
                              <PlusIcon class="ph" />
                            </span>
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                  <div class="picked">
                    <For
                      each={picked()}
                      fallback={
                        <p class="none">
                          Пока приложения не выбраны. Найдите нужные выше —
                          подключить аккаунт можно позже.
                        </p>
                      }
                    >
                      {(server) => (
                        <div class="crow">
                          <span class="mk">
                            <PipedreamConnectorIcon
                              appSlug={server.app_slug}
                              class="size-5"
                            />
                          </span>
                          <span style={{ 'min-width': 0 }}>
                            <span class="nm truncate">
                              {server.server_name}
                            </span>
                            <span class="ds truncate">
                              {connections.ready()
                                ? connections.slugs().has(server.app_slug)
                                  ? 'Подключено'
                                  : 'Не подключено'
                                : ''}
                            </span>
                          </span>
                          <button
                            type="button"
                            class="icon-btn"
                            aria-label={`Remove ${server.server_name}`}
                            onClick={() =>
                              setPicked(
                                removeMcpServer(picked(), server.app_slug)
                              )
                            }
                          >
                            <XIcon class="ph" />
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </Show>

            <div class="divider" />
            <div class="grp-row">
              <p class="grp-h">Каналы</p>
              <Segmented
                name="ch"
                value={channelMode()}
                options={[
                  { value: 'all', label: 'Все каналы' },
                  { value: 'selected', label: 'Выбрать каналы' },
                ]}
                onChange={setChannelMode}
              />
            </div>
            <Show when={channelMode() === 'selected'}>
              <div class="plist scroll" aria-label="Каналы">
                <For
                  each={channels()}
                  fallback={<p class="empty">Нет доступных каналов.</p>}
                >
                  {(channel) => (
                    <button
                      type="button"
                      class="prow"
                      role="checkbox"
                      aria-checked={selectedChannelIds().includes(channel.id)}
                      onClick={() => toggleChannel(channel.id)}
                    >
                      <span class="cb">
                        <CheckIcon class="ph" />
                      </span>
                      <span class="mk">#</span>
                      <span class="truncate">{channel.name}</span>
                      <span class="meta" />
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <div class="divider" />
            <div class="srow">
              <span class="lab">
                Агент-разработчик
                <small>
                  {coderRuntimes().length === 0
                    ? 'Подключите Cursor или среду выполнения, чтобы создать агента-разработчика'
                    : 'Пишет код в репозитории и работает в выбранной среде'}
                </small>
              </span>
              <button
                type="button"
                class="switch"
                role="switch"
                aria-checked={coder()}
                aria-disabled={
                  coderRuntimes().length === 0 && !coder() ? true : undefined
                }
                style={
                  coderRuntimes().length === 0 && !coder()
                    ? { opacity: 0.7 }
                    : undefined
                }
                onClick={() => setCoderMode(!coder())}
              >
                <span class="trk" />
                <span class="sw-l">{coder() ? 'Вкл.' : 'Выкл.'}</span>
              </button>
            </div>
          </div>

          <div class="colR">
            <div class="mdwrap">
              <div class="mdbar">
                <span class="lbl">Инструкции</span>
              </div>
              <textarea
                class="always"
                aria-label="Инструкции"
                spellcheck={false}
                placeholder="Вы — …"
                value={instructions()}
                onInput={(event) => setInstructions(event.currentTarget.value)}
              />
            </div>
          </div>
        </div>
      </div>
      <div class="df">
        <Show when={!isNew() && props.onDelete} fallback={<span />}>
          {(onDelete) => (
            <button type="button" class="btn danger" onClick={onDelete()}>
              <TrashIcon class="ph" />
              Удалить <span class="noun">{noun()}</span>
            </button>
          )}
        </Show>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" class="btn quiet" data-close>
            Отмена
          </button>
          <button
            type="button"
            class="btn"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-contrast)',
            }}
            disabled={!canSave()}
            onClick={() => void submit()}
          >
            {props.pending
              ? isNew()
                ? 'Создание…'
                : 'Сохранение…'
              : isNew()
                ? `Создать ${noun()}`
                : 'Сохранить изменения'}
          </button>
        </div>
      </div>
    </ArtifactDialog>
  );
}
