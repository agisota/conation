import type {
  GroupOption,
  GroupOptionId,
} from '@app/features/next-soup/soup-view/group-options';
import { t } from '@app/lib/i18n';
import StackSimpleIcon from '@phosphor/stack-simple.svg';
import { Dropdown, SingleSelectCheck, Tooltip } from '@ui';
import { type Component, For, Show } from 'solid-js';

interface GroupDropdownProps {
  value: () => GroupOptionId;
  onChange: (value: GroupOptionId) => void;
  options: GroupOption[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideLabel?: boolean;
}

export const GroupDropdown: Component<GroupDropdownProps> = (props) => {
  return (
    <Dropdown
      open={props.open}
      onOpenChange={props.onOpenChange}
      placement="bottom-start"
    >
      <Tooltip label={t('soup.filters.group')}>
        <Dropdown.Trigger
          depth={2}
          class="bg-surface"
          aria-label={props.hideLabel ? t('soup.filters.group') : undefined}
        >
          <StackSimpleIcon />
          <Show when={!props.hideLabel}>
            <span>{t('soup.filters.group')}</span>
          </Show>
        </Dropdown.Trigger>
      </Tooltip>
      <Dropdown.Content class="shadow-menu">
        <Dropdown.Group>
          <For each={props.options}>
            {(option) => (
              <Dropdown.Item onSelect={() => props.onChange(option.value)}>
                <span class="flex-1 truncate">{option.label}</span>
                <SingleSelectCheck active={props.value() === option.value} />
              </Dropdown.Item>
            )}
          </For>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
};
