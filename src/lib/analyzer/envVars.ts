import type { EnvVarOccurrence, RepoFile } from './types';

const SOURCE_EXTENSIONS = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs']);
const ENV_EXAMPLE_RE = /^\.env\.(example|sample|template)$/i;

// Env var read patterns in source code. All capture the variable name only.
const CODE_ENV_PATTERNS = [
  /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /process\.env\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g,
  /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /import\.meta\.env\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g,
];

// A `KEY=` (optionally `export KEY=`) assignment at the start of a line.
const ENV_ASSIGNMENT_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

export function isEnvExampleFile(path: string): boolean {
  return ENV_EXAMPLE_RE.test(basename(path));
}

export function isSourceFile(path: string): boolean {
  const dot = path.lastIndexOf('.');
  return dot !== -1 && SOURCE_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

/**
 * Redacts the value of a `KEY=value` assignment so evidence snippets never
 * surface secret values — only variable names. Non-assignment lines (prose,
 * `process.env.X` reads) are returned unchanged.
 */
export function redactEnvValues(line: string): string {
  return line.replace(
    /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*)\S.*$/,
    '$1<redacted>',
  );
}

/** Extracts env var names declared in a `.env.example`-style file. */
export function extractEnvVarsFromExample(file: RepoFile): EnvVarOccurrence[] {
  const occurrences: EnvVarOccurrence[] = [];

  file.content.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const match = ENV_ASSIGNMENT_RE.exec(line);
    if (!match) return;

    occurrences.push({
      name: match[1],
      file: file.path,
      line: index + 1,
      snippet: redactEnvValues(trimmed),
    });
  });

  return occurrences;
}

/** Extracts env var names read from source code (process.env / import.meta.env). */
export function extractEnvUsagesFromSource(file: RepoFile): EnvVarOccurrence[] {
  const occurrences: EnvVarOccurrence[] = [];

  file.content.split(/\r?\n/).forEach((line, index) => {
    const seenOnLine = new Set<string>();
    for (const pattern of CODE_ENV_PATTERNS) {
      for (const match of line.matchAll(pattern)) {
        const name = match[1];
        if (seenOnLine.has(name)) continue;
        seenOnLine.add(name);
        occurrences.push({
          name,
          file: file.path,
          line: index + 1,
          snippet: redactEnvValues(line.trim()),
        });
      }
    }
  });

  return occurrences;
}
