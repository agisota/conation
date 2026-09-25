import type { IUser } from '@core/user/types';
import type { EntityData } from '@entity';
import {
  MOCK_DOCUMENT_BASIC,
  MOCK_PROJECT_1,
} from '@entity/mocks/mockEntityData';
import { createSignal } from 'solid-js';

const now = new Date();

/** Returns a Date that is `minutesAgo` minutes before `now`. */
function ago(minutesAgo: number): Date {
  return new Date(now.getTime() - minutesAgo * 60_000);
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
const SEED_ENTITIES: EntityData[] = [
  seedChannel('seed_channel_1', 'разработка', ago(5)),
  seedEmail(
    'seed_email_1',
    'Re: План запуска',
    'Sarah Chen',
    'sarah@example.com',
    'Посмотрела план — перед запуском в пятницу нужно согласовать ещё несколько пунктов.',
    ago(35)
  ),
  seedChat('seed_chat_1', 'Идеи: настройка рабочего пространства', ago(90)),
  seedTask('seed_task_1', 'Проверить макеты', ago(180)),
  seedDM('seed_dm_1', 'Sarah Chen', ago(300)),
  seedDoc('seed_doc_1', 'План развития продукта: 3-й квартал', ago(480)),
  seedEmail(
    'seed_email_2',
    'Нужно согласовать бюджет',
    'Marcus Lee',
    'marcus@example.com',
    'Договоры с поставщиками на 4-й квартал готовы. Чтобы не задерживать процесс, нужно согласовать их до конца дня в четверг.',
    ago(720)
  ),
  seedChannel('seed_channel_2', 'дизайн', ago(960)),
  seedChat('seed_chat_2', 'Черновик: текст страницы тарифов', ago(60 * 20)),
  seedTask('seed_task_2', 'Написать заметки к выпуску', ago(60 * 26)),
  MOCK_PROJECT_1,
  seedDM('seed_dm_2', 'Marcus Lee', ago(60 * 30)),
  seedDoc('seed_doc_2', 'Запись о решении по архитектуре', ago(60 * 36)),
  seedEmail(
    'seed_email_3',
    'Обновление для инвесторов: 3-й квартал',
    'Jordan Rivera',
    'jordan@example.com',
    'Прикладываю черновик презентации для проверки. Ключевые показатели: ARR вырос на 34%, отток снизился до 2,1%.',
    ago(60 * 44),
    true
  ),
  seedChannel('seed_channel_3', 'объявления', ago(60 * 52)),
  seedTask('seed_task_3', 'Настроить конвейер CI', ago(60 * 60)),
  seedChat(
    'seed_chat_3',
    'Разбор: срок действия токена авторизации',
    ago(60 * 72)
  ),
  seedDoc('seed_doc_3', 'Заметки со встречи всей команды', ago(60 * 84)),
  seedDM('seed_dm_3', 'Jordan Rivera', ago(60 * 96)),
  seedProject('seed_project_2', 'Редизайн сайта', ago(60 * 120)),
  seedEmail(
    'seed_email_4',
    'Продление договора — требуется действие',
    'Alex Kim',
    'alex@example.com',
    'Годовая подписка продлится через 7 дней. Подтвердите платёжные данные, чтобы не потерять доступ.',
    ago(60 * 144),
    true
  ),
  seedTask('seed_task_4', 'Исправить ошибку на странице входа', ago(60 * 168)),
  seedChannel('seed_channel_4', 'продукт', ago(60 * 200)),
  seedChat(
    'seed_chat_4',
    'Кратко: отзывы клиентов за 3-й квартал',
    ago(60 * 240)
  ),
  seedDoc('seed_doc_4', 'Итоги интервью с клиентами', ago(60 * 288), 'canvas'),
  seedDM('seed_dm_4', 'Priya Patel', ago(60 * 336)),
  MOCK_DOCUMENT_BASIC,
  seedEmail(
    'seed_email_5',
    'Комментарии к дизайну',
    'Emily Zhang',
    'emily@example.com',
    'Выглядит отлично! Оставила несколько комментариев к навигации и мобильной версии.',
    ago(60 * 400),
    true
  ),
  seedTask('seed_task_5', 'Обновить зависимости', ago(60 * 480)),
  seedChannel('seed_channel_5', 'разное', ago(60 * 560)),
  seedChat('seed_chat_5', 'Проверка кода: модуль платежей', ago(60 * 650)),
  seedDoc('seed_doc_5', 'Справочник API', ago(60 * 750), 'py'),
  seedDM('seed_dm_5', 'Alex Kim', ago(60 * 840)),
  seedProject(
    'seed_project_3',
    'Мобильное приложение: версия 2',
    ago(60 * 960)
  ),
  seedTask(
    'seed_task_6',
    'Назначить встречи для исследования пользователей',
    ago(60 * 1100)
  ),
  seedTask('seed_task_7', 'Проверить бюджет за 1-й квартал', ago(60 * 1200)),
  seedDoc('seed_doc_6', 'Руководство по бренду', ago(60 * 1300)),
  seedChat('seed_chat_6', 'Исследование: анализ конкурентов', ago(60 * 1500)),
  seedEmail(
    'seed_email_6',
    'Планирование: 1-й квартал',
    'Alice Johnson',
    'alice@example.com',
    'Отправляю повестку к встрече в четверг. Подготовьте три главных приоритета.',
    ago(60 * 1700),
    true
  ),
  seedChannel('seed_channel_6', 'основной', ago(60 * 1900)),
];

const [entities, setEntities] = createSignal<EntityData[]>([...SEED_ENTITIES]);

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

const SAMPLE_NAMES: Record<SandboxEntityType, string> = {
  md: 'Мой документ',
  snippet: 'Мой фрагмент',
  email: 'Мой черновик письма',
  task: 'Моя задача',
  channel: 'Моё сообщение',
  chat: 'Мой диалог с помощником',
  canvas: 'Моя доска',
  project: 'Моя папка',
  code: 'Мой файл с кодом',
};

export function createSandboxEntity(type: SandboxEntityType): EntityData {
  entityCounter++;
  const id = `sandbox_${type}_${entityCounter}`;
  const base = {
    id,
    name: SAMPLE_NAMES[type],
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
        senderEmail: 'you@example.com',
        senderName: 'Вы',
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
  setEntities([...SEED_ENTITIES]);
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
  { id: 'user_1', name: 'Sarah Chen', email: 'sarah@example.com' },
  { id: 'user_2', name: 'Marcus Lee', email: 'marcus@example.com' },
  { id: 'user_3', name: 'Jordan Rivera', email: 'jordan@example.com' },
  { id: 'user_4', name: 'Alex Kim', email: 'alex@example.com' },
  { id: 'user_5', name: 'Priya Patel', email: 'priya@example.com' },
  { id: 'user_6', name: 'David Okafor', email: 'david@example.com' },
  { id: 'user_7', name: 'Emily Zhang', email: 'emily@example.com' },
  { id: 'user_8', name: 'Carlos Ruiz', email: 'carlos@example.com' },
  { id: 'user_9', name: 'Aisha Mohammed', email: 'aisha@example.com' },
  { id: 'user_10', name: 'Tom Brennan', email: 'tom@example.com' },
  { id: 'user_11', name: 'Yuki Tanaka', email: 'yuki@example.com' },
  { id: 'user_12', name: 'Fatima Al-Hassan', email: 'fatima@example.com' },
  { id: 'user_13', name: 'Liam Murphy', email: 'liam@example.com' },
  { id: 'user_14', name: 'Sofia Andersson', email: 'sofia@example.com' },
  { id: 'user_15', name: 'Raj Gupta', email: 'raj@example.com' },
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
