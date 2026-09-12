import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)), '../..');

const ROX_REDIS_UI_PORTS = ['8001', '8002', '8003'] as const;
const CONATION_REDIS_UI_HOST = '8005';

function publishedHostPorts(compose: string, service: string): string[] {
  const match = compose.match(
    new RegExp(`(?:^|\\n)  ${service}:\\n([\\s\\S]*?)(?=\\n  [a-z]|\\n[a-z]|$)`)
  );
  expect(match, `service ${service} present`).toBeTruthy();
  return [...(match?.[1].matchAll(/["'](\d+):\d+["']/g) ?? [])].map(
    ([, host]) => host
  );
}

describe('rox-coexistence compose port overlays (conation/overlay leftover)', () => {
  it.each([
    'docker/docker-compose.override-ports.yml',
    'docker/docker-compose.ports-databases.yml',
  ])('%s publishes Redis Stack UI on 8005, outside rox 8001-8003', (rel) => {
    const compose = readFileSync(resolve(repoRoot, rel), 'utf8');
    const redisHosts = publishedHostPorts(compose, 'redis');
    expect(redisHosts).toContain(CONATION_REDIS_UI_HOST);
    for (const occupied of ROX_REDIS_UI_PORTS) {
      expect(redisHosts).not.toContain(occupied);
    }
  });
});
