import { describe, expect, it } from 'vitest';
import { formatTabTitle } from './tabTitle';

describe('formatTabTitle', () => {
  it('uses the Conation display brand without changing environment prefixes', () => {
    expect(formatTabTitle(undefined)).toMatch(/Conation$/);
    expect(formatTabTitle('Roadmap')).toMatch(/Conation - Roadmap$/);
    expect(formatTabTitle('Roadmap')).not.toContain('Macro');
  });
});
