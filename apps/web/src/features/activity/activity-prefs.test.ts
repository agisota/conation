import { describe, expect, it } from 'vitest';
import {
  activityPrefsEqual,
  isActivityPrefsConfig,
  parseActivityPrefs,
  toActivityPrefsConfig,
} from './activity-prefs';

describe('isActivityPrefsConfig', () => {
  it('accepts my and space scopes', () => {
    expect(
      isActivityPrefsConfig({
        kind: 'activity-prefs',
        scope: 'my',
        sort: 'newest',
        categories: [],
      })
    ).toBe(true);
    expect(
      isActivityPrefsConfig({
        kind: 'activity-prefs',
        scope: 'space',
      })
    ).toBe(true);
  });

  it('rejects CRM views and unknown scopes', () => {
    expect(isActivityPrefsConfig({ kind: 'crm' })).toBe(false);
    expect(
      isActivityPrefsConfig({ kind: 'activity-prefs', scope: 'team' })
    ).toBe(false);
  });
});

describe('parseActivityPrefs', () => {
  it('defaults missing or invalid payloads', () => {
    expect(parseActivityPrefs(null)).toEqual({
      sort: 'newest',
      categories: [],
    });
    expect(parseActivityPrefs({ kind: 'crm' })).toEqual({
      sort: 'newest',
      categories: [],
    });
  });

  it('keeps oldest sort and known categories, dropping junk', () => {
    expect(
      parseActivityPrefs({
        kind: 'activity-prefs',
        scope: 'my',
        sort: 'oldest',
        categories: ['GraphqlActivityCreated', 'not-a-kind', 12],
      })
    ).toEqual({
      sort: 'oldest',
      categories: ['GraphqlActivityCreated'],
    });
  });
});

describe('activityPrefsEqual', () => {
  it('treats category order as irrelevant', () => {
    expect(
      activityPrefsEqual(
        { sort: 'newest', categories: ['a', 'b'] },
        { sort: 'newest', categories: ['b', 'a'] }
      )
    ).toBe(true);
    expect(
      activityPrefsEqual(
        { sort: 'newest', categories: ['a'] },
        { sort: 'oldest', categories: ['a'] }
      )
    ).toBe(false);
  });
});

describe('toActivityPrefsConfig', () => {
  it('tags My vs Space separately', () => {
    expect(
      toActivityPrefsConfig('space', {
        sort: 'oldest',
        categories: ['GraphqlActivityEdited'],
      })
    ).toEqual({
      kind: 'activity-prefs',
      scope: 'space',
      sort: 'oldest',
      categories: ['GraphqlActivityEdited'],
    });
  });
});
