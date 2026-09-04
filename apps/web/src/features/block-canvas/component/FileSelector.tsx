import { t } from '@app/lib/i18n';
import {
  EntityIcon,
  type EntityWithValidIcon,
} from '@core/component/EntityIcon';
import { useEntityMention } from '@core/component/LexicalMarkdown/component/menu/MentionsMenu/hooks/useEntityMention';
import { OldMenu } from '@core/component/OldMenu';
import type { EntityBucket, EntityItem } from '@core/context/quickAccess';
import { onKeyDownClick, onKeyUpClick } from '@core/util/click';
import FileText from '@phosphor-icons/core/regular/file-text.svg?component-solid';
import { Dropdown } from '@ui';
import { createSignal, Show } from 'solid-js';
import { VList } from 'virtua/solid';
import { Tools } from '../constants';
import type { EntityMentionNode } from '../model/CanvasModel';
import { selectedFileSignal } from '../operation/file';
import { useSelect } from '../operation/select';
import { useToolManager } from '../signal/toolManager';

const CANVAS_ENTITY_BUCKETS: EntityBucket[] = [
  'document',
  'note',
  'task',
  'snippet',
  'chat',
  'project',
  'channel',
  'dm',
  'email',
];

function bucketToEntityType(
  bucket: EntityBucket
): EntityMentionNode['entityType'] {
  switch (bucket) {
    case 'chat':
      return 'chat';
    case 'project':
      return 'project';
    case 'channel':
    case 'dm':
      return 'channel';
    case 'email':
      return 'email';
    default:
      return 'document';
  }
}

function entityName(item: EntityItem): string {
  const name = item.data.name;
  if (name) return name;
  if (item.bucket === 'email') return t('canvas.files.emailFallback');
  return item.id;
}

function ItemOption(props: { item: EntityItem }) {
  const setSelectedFile = selectedFileSignal.set;
  const toolManager = useToolManager();
  const select = useSelect();

  const selectEntity = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    select.abort();
    setSelectedFile({
      type: bucketToEntityType(props.item.bucket),
      id: props.item.id,
    });
    toolManager.setSelectedTool(Tools.File);
  };

  return (
    <div
      class="w-72 flex flex-row rounded hover:bg-hover hover-transition-bg p-2 text-sm select-none items-center"
      onmousedown={selectEntity}
      onKeyDown={onKeyDownClick(selectEntity)}
      onKeyUp={onKeyUpClick(selectEntity)}
      ontouchstart={selectEntity}
      tabIndex={0}
    >
      <EntityIcon
        targetType={
          (props.item.bucket === 'dm'
            ? 'channel'
            : props.item.bucket) as EntityWithValidIcon
        }
        size={'sm'}
      />
      <div class="ml-2 line-clamp-1 text-ellipsis">
        {entityName(props.item)}
      </div>
    </div>
  );
}

export function FileSelector() {
  const [fileSelectorOpen, setFileSelectorOpen] = createSignal(false);
  const [search, setSearch] = createSignal('');
  const { focusCanvas } = useToolManager();
  const { entities } = useEntityMention({
    buckets: CANVAS_ENTITY_BUCKETS,
    searchTerm: search,
  });

  return (
    <Dropdown open={fileSelectorOpen()} onOpenChange={setFileSelectorOpen}>
      <Dropdown.Trigger
        variant="ghost"
        size="icon-md"
        label={t('canvas.tools.file')}
        tabIndex={-1}
      >
        <FileText />
      </Dropdown.Trigger>
      <Dropdown.Content onCloseAutoFocus={focusCanvas}>
        <Dropdown.Group>
          <OldMenu width="lg">
            <div class="w-full p-1">
              <input
                class="mb-1 w-full rounded border border-border bg-transparent px-2 py-1 text-sm"
                value={search()}
                onInput={(event) => setSearch(event.currentTarget.value)}
                placeholder={t('canvas.files.search')}
              />
              <Show
                when={entities().length > 0}
                fallback={
                  <div class="p-4 text-center text-sm">
                    {t('canvas.files.empty')}
                  </div>
                }
              >
                <VList
                  data={entities()}
                  style={{ height: '320px', 'overflow-x': 'hidden' }}
                  bufferSize={10 * 40}
                >
                  {(item) => (
                    <Dropdown.Item>
                      <ItemOption item={item} />
                    </Dropdown.Item>
                  )}
                </VList>
              </Show>
            </div>
          </OldMenu>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
}
