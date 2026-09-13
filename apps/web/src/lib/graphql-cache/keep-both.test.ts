/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearKeepBoth,
  isUnmergeableConflict,
  listKeepBoth,
  recordKeepBoth,
} from './keep-both';

afterEach(() => {
  clearKeepBoth();
});

describe('isUnmergeableConflict', () => {
  it('detects HTTP 409 and GraphQL CONFLICT codes', () => {
    expect(isUnmergeableConflict({ response: { status: 409 } })).toBe(true);
    expect(isUnmergeableConflict({ networkError: { status: 412 } })).toBe(true);
    expect(
      isUnmergeableConflict({
        graphQLErrors: [{ extensions: { code: 'CONFLICT' } }],
      })
    ).toBe(true);
    expect(
      isUnmergeableConflict({
        graphQLErrors: [{ extensions: { code: 'VERSION_MISMATCH' } }],
      })
    ).toBe(true);
    expect(isUnmergeableConflict(new Error('network timeout'))).toBe(false);
  });
});

describe('recordKeepBoth', () => {
  it('stores local and remote snapshots before a rollback would drop them', () => {
    expect(
      recordKeepBoth({
        transactionId: 'tx-1',
        query: 'mutation UpdateDoc',
        operationName: 'UpdateDoc',
        variables: { id: 'doc-1', title: 'local' },
        local: { title: 'local' },
        remote: { title: 'remote' },
        error: 'CONFLICT',
        recordedAt: 1,
      })
    ).toBe(true);
    expect(listKeepBoth()).toEqual([
      {
        transactionId: 'tx-1',
        query: 'mutation UpdateDoc',
        operationName: 'UpdateDoc',
        variables: { id: 'doc-1', title: 'local' },
        local: { title: 'local' },
        remote: { title: 'remote' },
        error: 'CONFLICT',
        recordedAt: 1,
      },
    ]);
  });
});
