import { t } from '@app/lib/i18n';
import { useFavoritesQuery } from '@queries/favorites/favorites';
import { cn } from '@ui';
import { createMemo, Show } from 'solid-js';
import type { EntityRef, WidgetOf } from '../schema';
import { TEXT } from '../tokens';
import { List } from './List';

export type PinsProps = Omit<WidgetOf<'pins'>, 'type'>;

/**
 * Pin board over either the viewer's favorites or an explicit entity list.
 * Rows reuse the soup {@link List} widget so pin tiles match list tiles.
 */
export function Pins(props: PinsProps) {
  const favoritesQuery = useFavoritesQuery();

  const entities = createMemo<EntityRef[]>(() => {
    if (props.kind === 'explicit') return props.entities ?? [];
    if (!favoritesQuery.isSuccess) return [];
    return favoritesQuery.data.favorites.map((favorite) => ({
      id: favorite.entityId,
      type: favorite.entityType,
    }));
  });

  return (
    <Show
      when={props.kind === 'explicit' || !favoritesQuery.isPending}
      fallback={
        <div class={cn('px-3 py-6 text-center text-sm', TEXT.tertiary)}>
          {t('common.loading')}
        </div>
      }
    >
      <List
        source={{ kind: 'items', entities: entities() }}
        limit={props.limit}
      />
    </Show>
  );
}
