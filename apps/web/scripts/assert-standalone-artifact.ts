import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const TEXTUAL_ARTIFACT_EXTENSIONS = new Set([
  '.css',
  '.csv',
  '.htm',
  '.html',
  '.js',
  '.json',
  '.map',
  '.md',
  '.mjs',
  '.svg',
  '.txt',
  '.webmanifest',
  '.xml',
]);

export const STANDALONE_FORBIDDEN_LITERALS = [
  'macro.com',
  'macroverse.workers.dev',
  'macro://',
  '__MACRO_BUNDLE_BUILD__',
] as const;

function containsForbiddenUrlHost(contents: string, host: string): boolean {
  const escaped = host.replace(/\./g, '\\.');
  // Scheme or protocol-relative URL with a host-label boundary. Bare suffix
  // denylists, emails, and substrings like macromolecule must not match.
  return new RegExp(
    `(?:[a-z][a-z0-9+.-]*:)?//(?:[^/\\s"'<>@]*@)?(?:[^/\\s"'<>]*\\.)?${escaped}(?=[/:?#\\s"'<>]|$)`,
  ).test(contents);
}

export function findForbiddenStandaloneLiterals(contents: string): string[] {
  return STANDALONE_FORBIDDEN_LITERALS.filter((literal) =>
    literal === 'macro.com' || literal === 'macroverse.workers.dev'
      ? containsForbiddenUrlHost(contents, literal)
      : contents.includes(literal)
  );
}

/** Whether a release artifact is text that can contain an embedded endpoint. */
export function isTextualStandaloneArtifact(path: string): boolean {
  return TEXTUAL_ARTIFACT_EXTENSIONS.has(extname(path).toLowerCase());
}

function artifactFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return artifactFiles(path);
    return isTextualStandaloneArtifact(path) ? [path] : [];
  });
}

if (import.meta.main) {
  const directory = process.argv[2] ?? 'dist';
  const findings = artifactFiles(directory).flatMap((path) =>
    findForbiddenStandaloneLiterals(readFileSync(path, 'utf8')).map(
      (literal) => `${path}: ${literal}`
    )
  );
  if (findings.length > 0) {
    throw new Error(
      `standalone artifact contains managed compatibility values:\n${findings.join('\n')}`
    );
  }
  console.log(`Standalone artifact check passed (${directory})`);
}
