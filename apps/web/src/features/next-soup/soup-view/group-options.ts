import { t } from '@app/lib/i18n';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';

export type GroupOptionId =
  | 'none'
  | 'date'
  | 'entity_type'
  | 'project'
  | `property:${string}`;

export interface GroupOption {
  value: GroupOptionId;
  label: string;
}

const GROUP_OPTIONS = [
  {
    value: 'none',
    get label() {
      return t('soup.group.none');
    },
  },
  {
    value: 'date',
    get label() {
      return t('soup.group.date');
    },
  },
  {
    value: 'entity_type',
    get label() {
      return t('soup.group.type');
    },
  },
  {
    value: 'project',
    get label() {
      return t('soup.group.project');
    },
  },
  {
    value: `property:${SYSTEM_PROPERTY_IDS.STATUS}`,
    get label() {
      return t('soup.fields.status');
    },
  },
  {
    value: `property:${SYSTEM_PROPERTY_IDS.PRIORITY}`,
    get label() {
      return t('soup.fields.priority');
    },
  },
  {
    value: `property:${SYSTEM_PROPERTY_IDS.ASSIGNEES}`,
    get label() {
      return t('soup.fields.assignee');
    },
  },
  {
    value: 'project',
    get label() {
      return t('soup.group.project');
    },
  },
  {
    value: 'date',
    get label() {
      return t('soup.group.date');
    },
  },
] as const satisfies GroupOption[];

const _buildGroupOptions = (
  keys: (typeof GROUP_OPTIONS)[number]['value'][]
) => {
  const options = [];

  for (const key of keys) {
    const option = GROUP_OPTIONS.find((o) => o.value === key);

    if (!option) continue;

    options.push(option);
  }

  return options;
};

const _DEFAULT_GROUP_OPTIONS: GroupOption[] = [
  {
    value: 'none',
    get label() {
      return t('soup.group.none');
    },
  },
  {
    value: 'entity_type',
    get label() {
      return t('soup.group.type');
    },
  },
  {
    value: 'project',
    get label() {
      return t('soup.group.project');
    },
  },
];

export const TASK_GROUP_OPTIONS: GroupOption[] = [
  {
    value: 'none',
    get label() {
      return t('soup.group.none');
    },
  },
  {
    value: `property:${SYSTEM_PROPERTY_IDS.STATUS}`,
    get label() {
      return t('soup.fields.status');
    },
  },
  {
    value: `property:${SYSTEM_PROPERTY_IDS.PRIORITY}`,
    get label() {
      return t('soup.fields.priority');
    },
  },
  {
    value: `property:${SYSTEM_PROPERTY_IDS.ASSIGNEES}`,
    get label() {
      return t('soup.fields.assignee');
    },
  },
  {
    value: 'project',
    get label() {
      return t('soup.group.project');
    },
  },
  {
    value: 'date',
    get label() {
      return t('soup.group.date');
    },
  },
];

export const COMPANY_GROUP_OPTIONS: GroupOption[] = [
  {
    value: 'none',
    get label() {
      return t('soup.group.none');
    },
  },
  {
    value: `property:${SYSTEM_PROPERTY_IDS.STAGE}`,
    get label() {
      return t('soup.fields.stage');
    },
  },
  {
    value: `property:${SYSTEM_PROPERTY_IDS.COMPANY_OWNER}`,
    get label() {
      return t('common.owner');
    },
  },
];

export const TAG_VIEW_GROUP_OPTIONS: GroupOption[] = [
  {
    value: 'none',
    get label() {
      return t('soup.group.none');
    },
  },
  {
    value: 'entity_type',
    get label() {
      return t('soup.group.type');
    },
  },
  {
    value: 'project',
    get label() {
      return t('soup.group.project');
    },
  },
  {
    value: 'date',
    get label() {
      return t('soup.group.date');
    },
  },
];

const _EMAIL_GROUP_OPTIONS: GroupOption[] = [
  {
    value: 'none',
    get label() {
      return t('soup.group.none');
    },
  },
  {
    value: 'date',
    get label() {
      return t('soup.group.date');
    },
  },
  {
    value: 'project',
    get label() {
      return t('soup.group.project');
    },
  },
];

const _INBOX_GROUP_OPTIONS: GroupOption[] = [
  {
    value: 'none',
    get label() {
      return t('soup.group.none');
    },
  },
  {
    value: 'date',
    get label() {
      return t('soup.group.date');
    },
  },
  {
    value: 'entity_type',
    get label() {
      return t('soup.group.type');
    },
  },
  {
    value: 'project',
    get label() {
      return t('soup.group.project');
    },
  },
];
