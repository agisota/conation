import { describe, expect, it } from 'vitest';
import { shouldApplyBrandVersion } from './BrandProvider';

describe('installation brand version updates', () => {
  it('accepts only a newer version so delayed public reads cannot restore stale branding', () => {
    expect(shouldApplyBrandVersion(8, 9)).toBe(true);
    expect(shouldApplyBrandVersion(9, 9)).toBe(false);
    expect(shouldApplyBrandVersion(9, 8)).toBe(false);
    expect(shouldApplyBrandVersion(9, Number.NaN)).toBe(false);
  });
});
