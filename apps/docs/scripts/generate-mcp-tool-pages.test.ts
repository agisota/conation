import { describe, expect, test } from 'bun:test';

import { escapeMdxExpressions } from './generate-mcp-tool-pages';

describe('escapeMdxExpressions', () => {
  test('escapes JSON examples in prose', () => {
    expect(
      escapeMdxExpressions(
        'Example: [{"entityType":"email_thread","id":"..."}]',
      ),
    ).toBe('Example: [\\{"entityType":"email_thread","id":"..."\\}]');
  });

  test('escapes JSX-like placeholders in prose', () => {
    expect(
      escapeMdxExpressions(
        'Use conation|<email> and a timestamp from <7-days-ago-ISO>.',
      ),
    ).toBe(
      'Use conation|\\<email\\> and a timestamp from \\<7-days-ago-ISO\\>.',
    );
  });

  test('preserves braces inside inline and fenced code', () => {
    expect(escapeMdxExpressions('Use `<id>` and `{"id":"..."}` here.')).toBe(
      'Use `<id>` and `{"id":"..."}` here.',
    );
    expect(escapeMdxExpressions('```json\n{"id":"..."}\n```')).toBe(
      '```json\n{"id":"..."}\n```',
    );
  });
});
