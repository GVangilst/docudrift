import { getRootFile } from './repoSnapshot';
import type { NodeVersionRequirement, RepoSnapshot } from './types';

/** Returns the first non-blank, non-comment line of a version file. */
function firstMeaningfulLine(content: string): string | null {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    return trimmed;
  }
  return null;
}

/**
 * Collects Node.js version evidence from repository config only — never from
 * README/docs (those stay as DocClaim). Sources: package.json engines.node and
 * volta.node, .nvmrc, .node-version, and `nodejs` lines in .tool-versions.
 */
export function collectNodeVersionRequirements(
  snapshot: RepoSnapshot,
  enginesNode: string | null,
  voltaNode: string | null,
): NodeVersionRequirement[] {
  const requirements: NodeVersionRequirement[] = [];

  if (enginesNode?.trim()) {
    requirements.push({
      source: 'engines.node',
      file: 'package.json',
      raw: enginesNode.trim(),
      line: 1,
    });
  }

  if (voltaNode?.trim()) {
    requirements.push({
      source: 'volta.node',
      file: 'package.json',
      raw: voltaNode.trim(),
      line: 1,
    });
  }

  const nvmrc = getRootFile(snapshot, '.nvmrc');
  const nvmrcValue = nvmrc ? firstMeaningfulLine(nvmrc.content) : null;
  if (nvmrcValue) {
    requirements.push({ source: '.nvmrc', file: '.nvmrc', raw: nvmrcValue, line: 1 });
  }

  const nodeVersion = getRootFile(snapshot, '.node-version');
  const nodeVersionValue = nodeVersion ? firstMeaningfulLine(nodeVersion.content) : null;
  if (nodeVersionValue) {
    requirements.push({
      source: '.node-version',
      file: '.node-version',
      raw: nodeVersionValue,
      line: 1,
    });
  }

  const toolVersions = getRootFile(snapshot, '.tool-versions');
  if (toolVersions) {
    toolVersions.content.split(/\r?\n/).forEach((line, index) => {
      const match = /^\s*nodejs\s+([^\s#]+)/i.exec(line);
      if (match) {
        requirements.push({
          source: '.tool-versions',
          file: '.tool-versions',
          raw: match[1],
          line: index + 1,
        });
      }
    });
  }

  return requirements;
}
