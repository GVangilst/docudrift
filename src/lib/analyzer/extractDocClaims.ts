import { findRootFileCaseInsensitive } from './repoSnapshot';
import type { DocClaim, RepoSnapshot } from './types';

const RUN_SCRIPT_RE = /\bnpm\s+run(?:-script)?\s+([a-zA-Z0-9_:.-]+)/g;
const START_RE = /\bnpm\s+start\b/;
const TEST_RE = /\bnpm\s+test\b/;

/**
 * Extracts claims the README makes about how to run the project (currently
 * just "this npm script exists"). Detectors compare these against the
 * TruthModel.
 */
export function extractDocClaims(snapshot: RepoSnapshot): DocClaim[] {
  const readme = findRootFileCaseInsensitive(snapshot, 'README.md');
  if (!readme) return [];

  const claims: DocClaim[] = [];
  const lines = readme.content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const scriptNamesOnThisLine = new Set<string>();

    const addClaim = (scriptName: string, command: string) => {
      if (scriptNamesOnThisLine.has(scriptName)) return;
      scriptNamesOnThisLine.add(scriptName);
      claims.push({
        kind: 'npm-script',
        command,
        scriptName,
        source: {
          file: readme.path,
          line: lineNumber,
          snippet: line.trim(),
        },
      });
    };

    for (const match of line.matchAll(RUN_SCRIPT_RE)) {
      addClaim(match[1], match[0].trim());
    }
    if (START_RE.test(line)) {
      addClaim('start', 'npm start');
    }
    if (TEST_RE.test(line)) {
      addClaim('test', 'npm test');
    }
  });

  return claims;
}
