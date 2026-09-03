import { describe, expect, it } from 'vitest';
import { documentCognitionBase, services } from './services';

describe('OpenAPI service metadata', () => {
  it('uses local schema sources without retaining managed legacy endpoints', () => {
    const serialized = JSON.stringify({ services, documentCognitionBase });

    expect(serialized).not.toContain('macro.com');
    expect(serialized).not.toContain('macroverse.workers.dev');
    expect(services).toHaveLength(13);
    expect(services.every((service) => service.local.startsWith('http://'))).toBe(
      true
    );
  });
});
