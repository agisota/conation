import {
  ACTIVITY_FILTER_CATEGORIES,
  type ActivitySort,
} from './activity-feed-query';

/** Account-persisted activity filter/sort, keyed separately for My vs Space. */
export type ActivityViewScope = 'my' | 'space';

export type ActivityPrefsConfig = {
  kind: 'activity-prefs';
  scope: ActivityViewScope;
  sort: ActivitySort;
  categories: string[];
};

export const ACTIVITY_PREFS_VIEW_NAME: Record<ActivityViewScope, string> = {
  my: 'activity-prefs:my',
  space: 'activity-prefs:space',
};

const SCOPES = new Set<ActivityViewScope>(['my', 'space']);
const CATEGORY_SET = new Set<string>(ACTIVITY_FILTER_CATEGORIES);

export function isActivityViewScope(
  value: unknown
): value is ActivityViewScope {
  return typeof value === 'string' && SCOPES.has(value as ActivityViewScope);
}

export function isActivityPrefsConfig(
  value: unknown
): value is ActivityPrefsConfig {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.kind === 'activity-prefs' && isActivityViewScope(record.scope);
}

/** Defaults when nothing is stored yet. Selected heatmap day is not persisted. */
export function defaultActivityPrefs(): {
  sort: ActivitySort;
  categories: string[];
} {
  return { sort: 'newest', categories: [] };
}

export function parseActivityPrefs(value: unknown): {
  sort: ActivitySort;
  categories: string[];
} {
  const defaults = defaultActivityPrefs();
  if (!isActivityPrefsConfig(value)) return defaults;
  const sort: ActivitySort = value.sort === 'oldest' ? 'oldest' : 'newest';
  const categories = Array.isArray(value.categories)
    ? value.categories.filter(
        (category): category is string =>
          typeof category === 'string' && CATEGORY_SET.has(category)
      )
    : [];
  return { sort, categories };
}

export function activityPrefsEqual(
  a: { sort: ActivitySort; categories: readonly string[] },
  b: { sort: ActivitySort; categories: readonly string[] }
): boolean {
  if (a.sort !== b.sort) return false;
  if (a.categories.length !== b.categories.length) return false;
  const other = new Set(b.categories);
  return a.categories.every((category) => other.has(category));
}

export function toActivityPrefsConfig(
  scope: ActivityViewScope,
  prefs: { sort: ActivitySort; categories: readonly string[] }
): ActivityPrefsConfig {
  return {
    kind: 'activity-prefs',
    scope,
    sort: prefs.sort,
    categories: [...prefs.categories],
  };
}
