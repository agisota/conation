import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  nativeAppSchemeForProfile,
  parseConationClientProfile,
} from '../src/lib/core/constant/clientProfile';
import { emailToMacroId, tryMacroId } from '../src/lib/core/user/macroId';
import { buildTauriClientConfig } from './tauri-client-config';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const publicRoot = resolve(webRoot, 'public');
const assetsPath = '%ASSETS_PATH%/';

type Manifest = {
  short_name: string;
  name: string;
  icons: Array<{ src: string }>;
};

type TauriConfig = {
  productName: string;
  identifier: string;
  app: { windows: Array<{ title: string }> };
  plugins: {
    'deep-link': {
      mobile: Array<
        | { scheme: string[]; appLink: boolean }
        | { host: string; pathPrefix: string[] }
      >;
      desktop: { schemes: string[] };
    };
  };
};

describe('Conation rebrand compatibility contract', () => {
  it('keeps browser and PWA display metadata on Conation with resolvable icons', () => {
    const html = readFileSync(resolve(webRoot, 'index.html'), 'utf8');
    const document = new JSDOM(html).window.document;
    const manifest = JSON.parse(
      readFileSync(resolve(publicRoot, 'manifest.json'), 'utf8')
    ) as Manifest;

    expect(
      document.querySelector('meta[name="description"]')?.getAttribute('content')
    ).toBe('Conation — рабочее пространство с искусственным интеллектом');
    expect(document.querySelector('noscript')?.textContent?.trim()).toBe(
      'Для работы Conation необходимо включить JavaScript.'
    );
    expect(html).not.toContain('macro|');

    const browserIconHrefs = Array.from(
      document.querySelectorAll<HTMLLinkElement>(
        'link[rel~="icon"], link[rel="apple-touch-icon"]'
      )
    ).map((link) => link.getAttribute('href'));
    expect(browserIconHrefs).toEqual([
      `${assetsPath}favicon.ico`,
      `${assetsPath}icon.png`,
      `${assetsPath}logo192.png`,
    ]);
    for (const href of browserIconHrefs) {
      expect(
        existsSync(
          resolve(
            publicRoot,
            href!.startsWith(assetsPath)
              ? href!.slice(assetsPath.length)
              : href!
          )
        )
      ).toBe(true);
    }

    expect(manifest.short_name).toBe('Conation');
    expect(manifest.name).toBe('Conation — рабочее пространство');
    expect(manifest.icons.map(({ src }) => src)).toEqual([
      './logo192.png',
      './logo512.png',
    ]);
    for (const { src } of manifest.icons) {
      expect(existsSync(resolve(publicRoot, src))).toBe(true);
    }
  });

  it('keeps Conation display names and standalone native identities', () => {
    const tauri = JSON.parse(
      readFileSync(resolve(webRoot, 'tauri/src-tauri/tauri.conf.json'), 'utf8')
    ) as TauriConfig;

    expect(tauri.productName).toBe('Conation');
    expect(tauri.app.windows).not.toHaveLength(0);
    expect(tauri.app.windows.every(({ title }) => title === 'Conation')).toBe(
      true
    );

    expect(parseConationClientProfile(undefined)).toBe('standalone');
    expect(nativeAppSchemeForProfile('standalone')).toBe('conation');
    expect(tauri.identifier).toBe('dev.conation.app');
    expect(tauri.identifier).not.toBe('com.macro.app.prod');
    expect(tauri.plugins['deep-link'].mobile).toEqual([
      { scheme: ['conation'], appLink: false },
      { host: 'conation.dev', pathPrefix: ['/app'] },
    ]);
    expect(tauri.plugins['deep-link'].desktop.schemes).toEqual(['conation']);
    expect(JSON.stringify(tauri.plugins['deep-link'])).not.toContain('macro');
  });

  it('emits conation| public IDs and rejects macro| principals in standalone profile', () => {
    expect(emailToMacroId('pythia@conation.dev')).toBe(
      'conation|pythia@conation.dev'
    );
    expect(tryMacroId('conation|pythia@conation.dev')).toBe(
      'conation|pythia@conation.dev'
    );
    expect(tryMacroId('macro|pythia@conation.dev')).toBeUndefined();
    expect(tryMacroId('macro|unexpected@example.com')).toBeUndefined();

    const standalone = buildTauriClientConfig({ profile: 'standalone' });
    const serialized = JSON.stringify(standalone);
    expect(serialized).toContain('conation');
    expect(serialized).not.toContain('macro.com');
    expect(serialized).not.toContain('macro://');
    expect(serialized).not.toContain('macro|');
    expect(standalone.plugins['deep-link'].desktop.schemes).toEqual([
      'conation',
    ]);
  });

  it('keeps greenfield auth cookies, refresh header, and JWT token route', () => {
    const jwtScript = readFileSync(
      resolve(webRoot, 'scripts/generate-jwt-from-secrets.ts'),
      'utf8'
    );
    const authClient = readFileSync(
      resolve(webRoot, 'src/lib/service-clients/service-auth/client.ts'),
      'utf8'
    );
    const html = readFileSync(resolve(webRoot, 'index.html'), 'utf8');

    expect(jwtScript).toContain('accessTokenCookie: "conation-access-token"');
    expect(jwtScript).toContain(
      'refreshTokenCookie: "conation-refresh-token"'
    );
    expect(jwtScript).toContain(
      'accessTokenCookie: "dev-conation-access-token"'
    );
    expect(jwtScript).not.toMatch(/macro-access-token|macro_api_token/);
    expect(jwtScript).not.toContain('macro.com');

    expect(authClient).toContain("'/jwt/conation_api_token'");
    expect(authClient).toContain("'x-conation-refresh-token'");
    expect(authClient).not.toContain('/jwt/macro_api_token');
    expect(authClient).not.toContain('x-macro-refresh-token');

    expect(html).toContain('conation-locale');
    expect(html).not.toContain('macro-locale');
  });

  it('keeps Compose and web package identities on Conation', () => {
    const repoRoot = resolve(webRoot, '../..');
    const compose = readFileSync(
      resolve(repoRoot, 'docker/docker-compose.yml'),
      'utf8'
    );
    const databases = readFileSync(
      resolve(repoRoot, 'docker/docker-compose-databases.yml'),
      'utf8'
    );
    const pkg = JSON.parse(
      readFileSync(resolve(webRoot, 'package.json'), 'utf8')
    ) as { name: string };

    expect(compose).toMatch(/^name: conation$/m);
    expect(compose).not.toMatch(/^name: macro$/m);
    expect(databases).toMatch(/^name: conation$/m);
    expect(databases).toContain('name: conation_postgres_data');
    expect(databases).toContain('name: conation_redis_data');
    expect(databases).not.toContain('name: macro_postgres_data');
    expect(pkg.name).toBe('@conation/web');
  });
});
