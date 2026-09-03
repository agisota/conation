import { t } from '@app/lib/i18n';
import type { IUser } from '@core/user/types';
import type { EntityData } from '@entity';
import { createSignal } from 'solid-js';

const now = new Date();

/** Returns a Date that is `minutesAgo` minutes before `now`. */
function ago(minutesAgo: number): Date {
  return new Date(now.getTime() - minutesAgo * 60_000);
}

function sandboxCopy(key: string): string {
  return t(`onboarding.sandbox.${key}`);
}

function seedDoc(
  id: string,
  name: string,
  updatedAt: Date,
  fileType = 'md'
): EntityData {
  return {
    type: 'document',
    id,
    name,
    ownerId: 'sandbox',
    fileType,
    createdAt: updatedAt,
    updatedAt,
    frecencyScore: 1,
  };
}
function seedTask(id: string, name: string, updatedAt: Date): EntityData {
  return {
    type: 'document',
    id,
    name,
    ownerId: 'sandbox',
    fileType: 'md',
    subType: { type: 'task', is_completed: false },
    createdAt: updatedAt,
    updatedAt,
    frecencyScore: 1,
  };
}
function seedEmail(
  id: string,
  name: string,
  senderName: string,
  senderEmail: string,
  snippet: string,
  updatedAt: Date,
  isRead = false
): EntityData {
  return {
    type: 'email',
    id,
    name,
    ownerId: 'sandbox',
    isRead,
    isDraft: false,
    isImportant: false,
    done: false,
    senderEmail,
    senderName,
    snippet,
    participants: [],
    createdAt: updatedAt,
    updatedAt,
    frecencyScore: 1,
  };
}
function seedChannel(id: string, name: string, updatedAt: Date): EntityData {
  return {
    type: 'channel',
    id,
    name,
    ownerId: 'sandbox',
    channelType: 'private',
    createdAt: updatedAt,
    updatedAt,
    frecencyScore: 1,
  };
}
function seedProject(id: string, name: string, updatedAt: Date): EntityData {
  return {
    type: 'project',
    id,
    name,
    ownerId: 'sandbox',
    createdAt: updatedAt,
    updatedAt,
    frecencyScore: 1,
  };
}
function seedChat(id: string, name: string, updatedAt: Date): EntityData {
  return {
    type: 'chat',
    id,
    name,
    ownerId: 'sandbox',
    createdAt: updatedAt,
    updatedAt,
    frecencyScore: 1,
  };
}
function seedDM(id: string, name: string, updatedAt: Date): EntityData {
  return {
    type: 'channel',
    id,
    name,
    ownerId: 'sandbox',
    channelType: 'direct_message',
    createdAt: updatedAt,
    updatedAt,
    frecencyScore: 1,
  };
}

// Sorted by updatedAt descending so the "all" view is interleaved by type.
function buildSeedEntities(): EntityData[] {
  return [
    seedChannel('seed_channel_1', sandboxCopy('channels.engineering'), ago(5)),
    seedEmail(
      'seed_email_1',
      sandboxCopy('emails.launchChecklist.name'),
      'Пифия',
      'pythia@conation.dev',
      sandboxCopy('emails.launchChecklist.snippet'),
      ago(35)
    ),
    seedChat(
      'seed_chat_1',
      sandboxCopy('chats.onboardingBrainstorm'),
      ago(90)
    ),
    seedTask('seed_task_1', sandboxCopy('tasks.reviewMockups'), ago(180)),
    seedDM('seed_dm_1', 'Пифия', ago(300)),
    seedDoc('seed_doc_1', sandboxCopy('docs.gettingStarted'), ago(480)),
    seedEmail(
      'seed_email_2',
      sandboxCopy('emails.budgetApproval.name'),
      'Тарс',
      'tars@conation.dev',
      sandboxCopy('emails.budgetApproval.snippet'),
      ago(720)
    ),
    seedChannel('seed_channel_2', sandboxCopy('channels.design'), ago(960)),
    seedChat('seed_chat_2', sandboxCopy('chats.pricingDraft'), ago(60 * 20)),
    seedTask('seed_task_2', sandboxCopy('tasks.releaseNotes'), ago(60 * 26)),
    seedProject(
      'proj_1',
      sandboxCopy('projects.siteRedesign'),
      ago(60 * 28)
    ),
    seedDM('seed_dm_2', 'Тарс', ago(60 * 30)),
    seedDoc('seed_doc_2', sandboxCopy('docs.adr'), ago(60 * 36)),
    seedEmail(
      'seed_email_3',
      sandboxCopy('emails.investorUpdate.name'),
      'Рамзан Кадыров',
      'ramzan.kadyrov@conation.dev',
      sandboxCopy('emails.investorUpdate.snippet'),
      ago(60 * 44),
      true
    ),
    seedChannel(
      'seed_channel_3',
      sandboxCopy('channels.announcements'),
      ago(60 * 52)
    ),
    seedTask('seed_task_3', sandboxCopy('tasks.ciPipeline'), ago(60 * 60)),
    seedChat('seed_chat_3', sandboxCopy('chats.authDebug'), ago(60 * 72)),
    seedDoc('seed_doc_3', sandboxCopy('docs.allHands'), ago(60 * 84)),
    seedDM('seed_dm_3', 'Рамзан Кадыров', ago(60 * 96)),
    seedProject(
      'seed_project_2',
      sandboxCopy('projects.corpPortal'),
      ago(60 * 120)
    ),
    seedEmail(
      'seed_email_4',
      sandboxCopy('emails.contractRenewal.name'),
      'Анна Соколова',
      'anna.sokolova@conation.dev',
      sandboxCopy('emails.contractRenewal.snippet'),
      ago(60 * 144),
      true
    ),
    seedTask(
      'seed_task_4',
      sandboxCopy('tasks.loginRegression'),
      ago(60 * 168)
    ),
    seedChannel(
      'seed_channel_4',
      sandboxCopy('channels.product'),
      ago(60 * 200)
    ),
    seedChat(
      'seed_chat_4',
      sandboxCopy('chats.feedbackSummary'),
      ago(60 * 240)
    ),
    seedDoc(
      'seed_doc_4',
      sandboxCopy('docs.interviews'),
      ago(60 * 288),
      'canvas'
    ),
    seedDM('seed_dm_4', 'Анна Соколова', ago(60 * 336)),
    seedDoc('doc_basic_1', sandboxCopy('docs.meetingNotes'), ago(60 * 360)),
    seedEmail(
      'seed_email_5',
      sandboxCopy('emails.designReview.name'),
      'Елена Морозова',
      'elena.morozova@conation.dev',
      sandboxCopy('emails.designReview.snippet'),
      ago(60 * 400),
      true
    ),
    seedTask('seed_task_5', sandboxCopy('tasks.updateDeps'), ago(60 * 480)),
    seedChannel(
      'seed_channel_5',
      sandboxCopy('channels.support'),
      ago(60 * 560)
    ),
    seedChat(
      'seed_chat_5',
      sandboxCopy('chats.paymentsReview'),
      ago(60 * 650)
    ),
    seedDoc('seed_doc_5', sandboxCopy('docs.api'), ago(60 * 750), 'py'),
    seedDM('seed_dm_5', 'Дмитрий Волков', ago(60 * 840)),
    seedProject(
      'seed_project_3',
      sandboxCopy('projects.mobileApp'),
      ago(60 * 960)
    ),
    seedTask(
      'seed_task_6',
      sandboxCopy('tasks.userResearch'),
      ago(60 * 1100)
    ),
    seedTask('seed_task_7', sandboxCopy('tasks.q1Budget'), ago(60 * 1200)),
    seedDoc('seed_doc_6', sandboxCopy('docs.brand'), ago(60 * 1300)),
    seedChat(
      'seed_chat_6',
      sandboxCopy('chats.competitorResearch'),
      ago(60 * 1500)
    ),
    seedEmail(
      'seed_email_6',
      sandboxCopy('emails.q1Planning.name'),
      'Иван Петров',
      'ivan.petrov@conation.dev',
      sandboxCopy('emails.q1Planning.snippet'),
      ago(60 * 1700),
      true
    ),
    seedChannel(
      'seed_channel_6',
      sandboxCopy('channels.general'),
      ago(60 * 1900)
    ),
  ];
}

const [entities, setEntities] = createSignal<EntityData[]>(buildSeedEntities());

let entityCounter = 0;

// -- Sidebar filter --

export type SandboxSidebarFilter =
  | 'agents'
  | 'mail'
  | 'documents'
  | 'tasks'
  | 'channels'
  | 'folders'
  | 'empty'
  | null;

const [sidebarFilter, setSidebarFilter] =
  createSignal<SandboxSidebarFilter>('empty');

export { setSidebarFilter, sidebarFilter };

function matchesFilter(
  entity: EntityData,
  filter: SandboxSidebarFilter
): boolean {
  if (!filter) return true;
  switch (filter) {
    case 'empty':
      return false;
    case 'agents':
      return entity.type === 'chat';
    case 'mail':
      return entity.type === 'email';
    case 'documents':
      return entity.type === 'document' && entity.subType?.type !== 'task';
    case 'tasks':
      return entity.type === 'document' && entity.subType?.type === 'task';
    case 'channels':
      return entity.type === 'channel';
    case 'folders':
      return entity.type === 'project';
    default:
      return true;
  }
}

function sandboxEntities() {
  return entities();
}

export function filteredSandboxEntities() {
  const filter = sidebarFilter();
  if (!filter) return entities();
  return entities().filter((e) => matchesFilter(e, filter));
}

export function addSandboxEntity(entity: EntityData) {
  setEntities((prev) => [entity, ...prev]);
}

function _removeSandboxEntity(id: string) {
  setEntities((prev) => prev.filter((e) => e.id !== id));
}

export type SandboxEntityType =
  | 'md'
  | 'snippet'
  | 'email'
  | 'task'
  | 'channel'
  | 'chat'
  | 'canvas'
  | 'project'
  | 'code';

const SAMPLE_NAME_KEYS: Record<SandboxEntityType, string> = {
  md: 'onboarding.sandbox.sample.md',
  snippet: 'onboarding.sandbox.sample.snippet',
  email: 'onboarding.sandbox.sample.email',
  task: 'onboarding.sandbox.sample.task',
  channel: 'onboarding.sandbox.sample.channel',
  chat: 'onboarding.sandbox.sample.chat',
  canvas: 'onboarding.sandbox.sample.canvas',
  project: 'onboarding.sandbox.sample.project',
  code: 'onboarding.sandbox.sample.code',
};

export function createSandboxEntity(type: SandboxEntityType): EntityData {
  entityCounter++;
  const id = `sandbox_${type}_${entityCounter}`;
  const base = {
    id,
    name: t(SAMPLE_NAME_KEYS[type]),
    ownerId: 'sandbox',
    createdAt: new Date(),
    updatedAt: new Date(),
    frecencyScore: 1,
  };

  switch (type) {
    case 'md':
      return { ...base, type: 'document', fileType: 'md' };
    case 'snippet':
      return {
        ...base,
        type: 'document',
        fileType: 'md',
        subType: { type: 'snippet' },
      };
    case 'canvas':
      return { ...base, type: 'document', fileType: 'canvas' };
    case 'code':
      return { ...base, type: 'document', fileType: 'py' };
    case 'task':
      return {
        ...base,
        type: 'document',
        fileType: 'md',
        subType: { type: 'task', is_completed: false },
      };
    case 'email':
      return {
        ...base,
        type: 'email',
        isRead: false,
        isDraft: true,
        isImportant: false,
        done: false,
        senderEmail: 'you@conation.dev',
        senderName: t('onboarding.sandbox.sample.you'),
        snippet: '',
        participants: [],
      };
    case 'channel':
      return { ...base, type: 'channel', channelType: 'private' };
    case 'chat':
      return { ...base, type: 'chat' };
    case 'project':
      return { ...base, type: 'project' };
  }
}

export function resetSandbox() {
  entityCounter = 0;
  setEntities(buildSeedEntities());
  setSidebarFilter('empty');
}

// -- Command menu helpers --

type EntityBucketType =
  | 'note'
  | 'task'
  | 'snippet'
  | 'email'
  | 'channel'
  | 'chat'
  | 'project'
  | 'dm'
  | 'document';

function entityToBucket(entity: EntityData): EntityBucketType {
  switch (entity.type) {
    case 'document':
      if (entity.subType?.type === 'task') return 'task';
      if (entity.subType?.type === 'snippet') return 'snippet';
      return 'note';
    case 'email':
      return 'email';
    case 'channel':
      return entity.channelType === 'direct_message' ? 'dm' : 'channel';
    case 'chat':
      return 'chat';
    case 'project':
      return 'project';
    default:
      return 'note';
  }
}

// -- Sandbox contacts --

export const SANDBOX_USERS: IUser[] = [
  { id: 'user_1', name: 'Пифия', email: 'pythia@conation.dev' },
  { id: 'user_2', name: 'Тарс', email: 'tars@conation.dev' },
  { id: 'user_3', name: 'Рамзан Кадыров', email: 'ramzan.kadyrov@conation.dev' },
  { id: 'user_4', name: 'Анна Соколова', email: 'anna.sokolova@conation.dev' },
  { id: 'user_5', name: 'Дмитрий Волков', email: 'dmitry.volkov@conation.dev' },
  { id: 'user_6', name: 'Елена Морозова', email: 'elena.morozova@conation.dev' },
  { id: 'user_7', name: 'Иван Петров', email: 'ivan.petrov@conation.dev' },
  { id: 'user_8', name: 'Мария Кузнецова', email: 'maria.kuznetsova@conation.dev' },
  { id: 'user_9', name: 'Сергей Новиков', email: 'sergey.novikov@conation.dev' },
  { id: 'user_10', name: 'Ольга Смирнова', email: 'olga.smirnova@conation.dev' },
  { id: 'user_11', name: 'Павел Орлов', email: 'pavel.orlov@conation.dev' },
  { id: 'user_12', name: 'Наталья Фёдорова', email: 'natalia.fedorova@conation.dev' },
  { id: 'user_13', name: 'Артём Белов', email: 'artem.belov@conation.dev' },
  { id: 'user_14', name: 'Юлия Лебедева', email: 'yulia.lebedeva@conation.dev' },
  { id: 'user_15', name: 'Никита Егоров', email: 'nikita.egorov@conation.dev' },
];

export function sandboxToCommandItems() {
  return sandboxEntities().map((entity) => ({
    id: entity.id,
    kind: 'entity' as const,
    bucket: entityToBucket(entity),
    searchText: entity.name,
    sortTimestamp:
      entity.updatedAt instanceof Date
        ? entity.updatedAt.getTime()
        : new Date(entity.updatedAt ?? Date.now()).getTime(),
    timestamps: { updatedAt: entity.updatedAt ?? null },
    data: entity,
  }));
}
