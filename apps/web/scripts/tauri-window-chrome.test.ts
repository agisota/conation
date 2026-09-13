import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const confPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../tauri/src-tauri/tauri.conf.json'
);

describe('desktop window chrome', () => {
  it('uses an overlay titlebar so macOS lights sit on content, not a gray bar', () => {
    const conf = JSON.parse(readFileSync(confPath, 'utf8')) as {
      app: {
        windows: Array<{
          hiddenTitle?: boolean;
          titleBarStyle?: string;
          trafficLightPosition?: { x: number; y: number };
        }>;
      };
    };
    const win = conf.app.windows[0];
    expect(win).toBeDefined();
    expect(win?.titleBarStyle).toBe('Overlay');
    expect(win?.hiddenTitle).toBe(true);
    expect(win?.trafficLightPosition).toEqual({ x: 16, y: 10 });
  });
});
