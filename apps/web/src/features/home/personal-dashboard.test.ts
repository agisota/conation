import { expect, it } from 'vitest';
import type { View } from '@service-storage/generated/schemas/view';
import { firstDashboardLayout, parsePersonalDashboard, readPersonalDashboard, reorderWidget } from './personal-dashboard';

const view = (owner: string, config: unknown): View => ({
  id: crypto.randomUUID(),
  userId: owner,
  name: 'dashboard:personal',
  config,
  createdAt: '2026-09-24T00:00:00Z',
  updatedAt: '2026-09-24T00:00:00Z',
});

it('does not expose another owner’s layout even when the server response is mis-scoped', () => {
  expect(() => readPersonalDashboard([view('a', firstDashboardLayout())], 'b')).toThrow(/другому аккаунту/);
});

it('rejects ambiguous or unsupported stored layouts rather than choosing and overwriting one', () => {
  const valid = view('a', firstDashboardLayout());
  expect(() => readPersonalDashboard([valid, valid], 'a')).toThrow(/несколько/);
  expect(() => parsePersonalDashboard({ ...firstDashboardLayout(), teamDefault: true })).toThrow(/не поддерживается/);
  expect(() => parsePersonalDashboard({ ...firstDashboardLayout(), widgets: ['tasks', 'tasks'] })).toThrow(/не поддерживается/);
  expect(() => parsePersonalDashboard({ ...firstDashboardLayout(), version: 2 })).toThrow(/не поддерживается/);
});

it('moves exactly the selected widget while preserving the unique catalog', () => {
  expect(reorderWidget(['tasks', 'calendar'], 0, 1)).toEqual(['calendar', 'tasks']);
  expect(reorderWidget(['tasks', 'calendar'], 0, -1)).toEqual(['tasks', 'calendar']);
});
