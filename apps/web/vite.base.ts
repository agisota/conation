import { exec, execSync } from 'node:child_process';
import { unwatchFile, watchFile } from 'node:fs';
import { resolve } from 'node:path';
import tailwind from '@tailwindcss/vite';
import { Features } from 'lightningcss';
import type { Plugin, UserConfigFn } from 'vite';
import solid from 'vite-plugin-solid';
import solidSvg from 'vite-plugin-solid-svg';
import wasm from 'vite-plugin-wasm';
import tsconfigpaths from 'vite-tsconfig-paths';
// @ts-ignore
import { version } from './package.json';
import { keepImportMetaDev } from './scripts/keep-import-meta-dev';
import {
  parseConationClientProfile,
  validateStandaloneOperatorOriginInput,
  validateStandaloneServiceUrlInput,
} from './src/lib/core/constant/clientProfile';

function readShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

const shortSha = readShortSha();
const appVersion = `${version}+${shortSha}`;

function readGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  } catch {
    return '';
  }
}

function readGitBranchAsync(): Promise<string> {
  return new Promise((res) => {
    exec('git rev-parse --abbrev-ref HEAD', (err, stdout) => {
      res(err ? '' : stdout.trim());
    });
  });
}

function gitBranchHmrPlugin(): Plugin {
  return {
    name: 'git-branch-hmr',
    apply: 'serve',
    configureServer(server) {
      let gitDir: string;
      try {
        gitDir = execSync('git rev-parse --absolute-git-dir').toString().trim();
      } catch {
        return;
      }
      const headPath = resolve(gitDir, 'HEAD');
      const emit = () => {
        readGitBranchAsync().then((branch) => {
          server.ws.send({
            type: 'custom',
            event: 'git-branch:update',
            data: branch,
          });
        });
      };
      watchFile(headPath, { interval: 100 }, emit);
      server.ws.on('connection', emit);
      server.httpServer?.once('close', () => unwatchFile(headPath));
    },
  };
}

export const createAppViteConfig = (): UserConfigFn => {
  return ({ command, mode }) => {
    const ENV_MODE = process.env.MODE ?? mode;
    const NO_MINIFY = process.env.NO_MINIFY === 'true';
    const clientProfile = parseConationClientProfile(
      process.env.VITE_CONATION_CLIENT_PROFILE
    );
    const standaloneOriginDefault =
      command === 'serve'
        ? process.env.VITE_LOCAL_BACKEND_ORIGIN === 'same-origin'
          ? 'http://localhost:8090'
          : process.env.VITE_LOCAL_BACKEND_ORIGIN || 'http://localhost:8090'
        : 'same-origin';
    const operatorOrigin = validateStandaloneBuildOriginInput(
      process.env.VITE_CONATION_OPERATOR_ORIGIN ?? standaloneOriginDefault
    );
    const aiEditingWorkerOrigin =
      process.env.VITE_AI_EDITING_WORKER_URL
        ? validateStandaloneServiceUrlInput(
            process.env.VITE_AI_EDITING_WORKER_URL
          )
        : undefined;
    const generateSourceMaps = process.env.VITE_CONATION_SOURCEMAPS === 'true';

    return {
      base: command === 'serve' ? '/' : '/app',
      assetsInclude: ['**/*.glb'],
      css: {
        preprocessorMaxWorkers: true,
        transformer: 'lightningcss',
        lightningcss: {
          include: Features.VendorPrefixes,
        },
      },
      plugins: [
        // solidDevtools({ autoname: true }),
        solid(),
        wasm(),
        tailwind(),
        solidSvg({ defaultAsComponent: true }),
        tsconfigpaths({
          root: './',
        }),
        gitBranchHmrPlugin(),
      ],
      define: defineEnv(
        ENV_MODE,
        command,
        clientProfile,
        operatorOrigin,
        aiEditingWorkerOrigin
      ),
      clearScreen: false,
      worker: {
        format: 'es',
        plugins: () => [
          tsconfigpaths({
            root: './',
          }),
        ],
        rollupOptions: {
          output: {
            format: 'es',
            chunkFileNames: '[name]-[hash].js',
            entryFileNames: '[name]-[hash].js',
          },
        },
      },
      mode: ENV_MODE,
      build: {
        cssMinify: 'lightningcss',
        // target older safari to avoid lightningcss using text-decoration shorthand:
        // https://developer.mozilla.org/en-US/docs/Web/CSS/text-decoration#browser_compatibility
        cssTarget: ['esnext', 'safari15'],
        target: 'esnext',
        outDir: 'dist',
        emptyOutDir: true,
        minify: !NO_MINIFY,
        rollupOptions: {
          input: {
            app: resolve(__dirname, 'index.html'),
          },
          // KaTeX and PDF.js are now reachable through lazy boundaries. Let
          // Rollup place them naturally; forcing named chunks hoists shared
          // CommonJS helpers into those chunks and makes the entry preload
          // otherwise-lazy code.
          output: NO_MINIFY
            ? {
                // remove hashes from output paths
                // https://github.com/vitejs/vite/issues/378
                entryFileNames: `assets/[name].js`,
                chunkFileNames: `assets/[name].js`,
                assetFileNames: `assets/[name].[ext]`,
              }
            : {
                format: 'es',
                chunkFileNames: '[name]-[hash].js',
                entryFileNames: '[name]-[hash].js',
              },
        },
        assetsInlineLimit: (filePath) => {
          if (filePath.includes('.wasm')) return false;
          if (filePath.includes('/lok/')) return false;
        },
        // Bundles omit source maps unless explicitly requested: they expose
        // source and push Rollup over Node's default heap on this application.
        sourcemap: generateSourceMaps,
      },
      esbuild: {
        supported: {
          'top-level-await': true,
        },
        jsx: 'automatic',
        jsxImportSource: 'solid-js',
      },
      optimizeDeps: {
        include: [
          'vscode-textmate',
          'vscode-oniguruma',
          // 'solid-devtools/setup',
          'libheif-js/wasm-bundle',
          // Prebundle lazy spreadsheet worker dependencies before the first
          // use, which would otherwise reload the page and discard its draft.
          '@ironcalc/wasm',
          'exceljs',
          'fflate',
          'saxes',
        ],
        // loro-crdt is a wasm singleton. The app imports it directly (esbuild
        // pre-bundles a copy) while the linked `@loro-mirror/core` workspace
        // source imports it through vite-plugin-wasm — two module evaluations,
        // two wasm memories. A LoroDoc from one instance handed to a Mirror on
        // the other yields cross-instance container handles → `index out of
        // bounds` panics in dev only. Excluding it from pre-bundling collapses
        // everyone onto the single plugin-handled instance.
        exclude: ['loro-crdt'],
        esbuildOptions: {
          target: 'esnext',
        },
      },
      resolve: {
        alias: [
          // Nix injects its Tauri API alias here inside the sandboxed build.
          // NIX_TAURI_ALIAS
        ],
        dedupe: [
          // Keep Loro resolution here: tsconfig path aliases cache a versioned
          // URL that goes stale when Vite rebuilds dependencies, splitting the
          // app and workspace packages across separate WASM instances.
          'loro-crdt',
          'solid-js',
          '@codingame/monaco-vscode-api',
          '@codingame/monaco-vscode-*-common',
        ],
      },
      server: {
        port: Number(process.env.PORT || 3000),
        host: '0.0.0.0',
        strictPort: true,
        // LAN / Tailscale / public-IP access from a MacBook browser.
        allowedHosts: true,
        hmr: {
          protocol: 'ws',
          host: process.env.TAURI_DEV_HOST || 'localhost',
        },
        cors: true,
        watch: {
          usePolling: true,
          interval: 100,
          ignored: /(^|[\\/])target([\\/]|$)/,
        },
        fs: {
          allow: [
            // Allow serving files from the workspace root
            resolve(__dirname, '../..'),
          ],
        },
      },
      preview: {
        port: Number(process.env.PORT || 3000),
        host: '0.0.0.0',
        strictPort: true,
        allowedHosts: true,
        cors: true,
      },
    };
  };
};

function getAssetsPath(mode: string, command: string): string {
  switch (mode) {
    case 'development':
      return command === 'serve' ? '/local' : '/dev';
    case 'staging':
      return '/staging';
    default:
      return '/';
  }
}

function defineEnv(
  mode: string,
  command: string,
  clientProfile: 'standalone',
  operatorOrigin: string,
  aiEditingWorkerOrigin: string | undefined
) {
  // `vite build` compiles DEV from NODE_ENV, not MODE. Local-backend static
  // bundles already set VITE_LOCAL_BACKEND_ORIGIN (stack up);
  // keep DEV so those artifacts match `just run_local` (vite serve).
  const keepDev = keepImportMetaDev({
    command,
    mode,
    localBackendOrigin: process.env.VITE_LOCAL_BACKEND_ORIGIN,
  });
  return {
    __CONATION_HOSTED_LEGACY__: false,
    'globalThis.__CONATION_HOSTED_LEGACY__': false,
    'import.meta.env.__APP_VERSION__': JSON.stringify(appVersion),
    'import.meta.env.ASSETS_PATH': JSON.stringify(getAssetsPath(mode, command)),
    'import.meta.env.__LOCAL_DOCKER__': process.env.LOCAL_DOCKER === 'true',
    'import.meta.env.__LOCAL_JWT__': JSON.stringify(process.env.LOCAL_JWT),
    'import.meta.env.__GIT_BRANCH__': JSON.stringify(
      command === 'serve' ? readGitBranch() : ''
    ),
    'import.meta.env.VITE_CONATION_CLIENT_PROFILE':
      JSON.stringify(clientProfile),
    'import.meta.env.VITE_CONATION_OPERATOR_ORIGIN':
      JSON.stringify(operatorOrigin),
    'import.meta.env.VITE_AI_EDITING_WORKER_URL': JSON.stringify(
      aiEditingWorkerOrigin
    ),
    ...(keepDev
      ? {
          'import.meta.env.DEV': true,
          'import.meta.env.PROD': false,
        }
      : {}),
  };
}

function validateStandaloneBuildOriginInput(
  configured: string | undefined
): 'same-origin' | string {
  const origin = validateStandaloneOperatorOriginInput(configured);
  if (origin === 'same-origin') return origin;
  const hostname = new URL(origin).hostname.toLowerCase();
  const managedLegacySuffix = 'macro.com';
  if (
    hostname === managedLegacySuffix ||
    hostname.endsWith(`.${managedLegacySuffix}`)
  ) {
    throw new Error(
      `Standalone Conation cannot target managed legacy host ${hostname}`
    );
  }
  const managedWorkerSuffix = 'macroverse.workers.dev';
  if (
    hostname === managedWorkerSuffix ||
    hostname.endsWith(`.${managedWorkerSuffix}`)
  ) {
    throw new Error(
      `Standalone Conation cannot target managed legacy host ${hostname}`
    );
  }
  return origin;
}
