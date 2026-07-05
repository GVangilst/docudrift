import { coerce, intersects, major, satisfies, subset, validRange } from 'semver';
import type {
  DocClaim,
  DriftIssue,
  DriftSeverity,
  NodeVersionClaim,
  NodeVersionRequirement,
  TruthModel,
} from '../types';

const DETECTOR_ID = 'node-engine-mismatch';

// Repo config sources that pin a single concrete Node version.
const PINNED_SOURCES = new Set(['.nvmrc', '.node-version', 'volta.node', '.tool-versions']);

type DocSpec =
  | { type: 'version'; version: string; label: string }
  | { type: 'range'; range: string; label: string };

/** Interprets a documented version token into a concrete version or a semver range. */
function interpretDocVersion(token: string): DocSpec | null {
  const label = token.trim();
  const compact = label.replace(/\s+/g, '');
  if (!compact) return null;

  // "18+" → ">=18"
  if (compact.endsWith('+')) {
    const range = `>=${compact.slice(0, -1).replace(/^v/i, '')}`;
    return validRange(range) ? { type: 'range', range, label } : null;
  }
  // "18.x" style range
  if (/\.x$/i.test(compact)) {
    const range = compact.replace(/^v/i, '');
    return validRange(range) ? { type: 'range', range, label } : null;
  }
  // Leading operator, e.g. ">=18", "^18", "~20"
  const op = /^(>=|<=|>|<|\^|~)(.+)$/.exec(compact);
  if (op) {
    const range = `${op[1]}${op[2].replace(/^v/i, '')}`;
    return validRange(range) ? { type: 'range', range, label } : null;
  }
  // Bare version, e.g. "18", "20.11.1"
  const coerced = coerce(compact);
  return coerced ? { type: 'version', version: coerced.version, label } : null;
}

type Comparison = { severity: DriftSeverity; reason: string } | null;

/** Compares a documented Node version against a package.json engines.node range. */
function compareToEngines(spec: DocSpec, enginesRange: string): Comparison {
  if (spec.type === 'version') {
    if (satisfies(spec.version, enginesRange)) return null;
    return {
      severity: 'error',
      reason: `Node ${spec.label} cannot satisfy engines.node "${enginesRange}"`,
    };
  }

  if (!intersects(spec.range, enginesRange)) {
    return {
      severity: 'error',
      reason: `documented range "${spec.range}" cannot satisfy engines.node "${enginesRange}"`,
    };
  }
  if (subset(spec.range, enginesRange)) return null; // doc is stricter or equal — fine
  if (subset(enginesRange, spec.range)) {
    return {
      severity: 'warning',
      reason: `documented range "${spec.range}" is less strict than engines.node "${enginesRange}"`,
    };
  }
  return {
    severity: 'info',
    reason: `documented range "${spec.range}" only partially overlaps engines.node "${enginesRange}"`,
  };
}

/** Compares a documented Node version against a concrete pinned version (.nvmrc etc). */
function compareToPinned(spec: DocSpec, pinnedRaw: string): Comparison {
  const pinned = coerce(pinnedRaw);
  if (!pinned) return null;

  if (spec.type === 'version') {
    const docVersion = coerce(spec.version);
    if (docVersion && major(docVersion) === major(pinned)) return null;
    return {
      severity: 'warning',
      reason: `documented Node ${spec.label} conflicts with pinned Node ${pinned.version}`,
    };
  }

  if (satisfies(pinned.version, spec.range)) return null;
  return {
    severity: 'warning',
    reason: `pinned Node ${pinned.version} does not satisfy documented "${spec.range}"`,
  };
}

function docSuggestedFix(
  engines: NodeVersionRequirement | null,
  pinned: NodeVersionRequirement | null,
): string {
  if (engines) return `Update the README to match package.json engines.node ("${engines.raw}").`;
  if (pinned) return `Update the README to match ${pinned.file} (Node ${pinned.raw}).`;
  return `Align the README's Node version with the repository's Node configuration.`;
}

/**
 * Flags README/doc Node version claims that conflict with the repo's Node
 * version config (package.json engines.node/volta, .nvmrc, .node-version,
 * .tool-versions), and flags repo config files that disagree with each other.
 * Uses semver range comparison. Never executes node/npm/nvm.
 */
export function nodeEngineMismatchDetector(claims: DocClaim[], truth: TruthModel): DriftIssue[] {
  const requirements = truth.nodeVersionRequirements;
  if (requirements.length === 0) return []; // No repo evidence → don't flag.

  const engines = requirements.find((req) => req.source === 'engines.node') ?? null;
  const pinned = requirements.find((req) => PINNED_SOURCES.has(req.source)) ?? null;

  const issues: DriftIssue[] = [];

  // Repo-internal ambiguity: engines.node and a pinned version disagree.
  if (engines && pinned) {
    const enginesRange = validRange(engines.raw);
    const pinnedVersion = coerce(pinned.raw);
    if (enginesRange && pinnedVersion && !satisfies(pinnedVersion.version, enginesRange)) {
      issues.push({
        id: `${DETECTOR_ID}:repo-config-ambiguity`,
        detectorId: DETECTOR_ID,
        severity: 'warning',
        title: `package.json engines.node and ${pinned.file} disagree`,
        description: `package.json engines.node is "${engines.raw}", but ${pinned.file} pins Node ${pinned.raw}, which does not satisfy it.`,
        evidence: [
          {
            label: 'package.json',
            file: engines.file,
            line: engines.line,
            snippet: `engines.node: ${engines.raw}`,
          },
          { label: pinned.file, file: pinned.file, line: pinned.line, snippet: pinned.raw },
        ],
        suggestedFix: `Align package.json engines.node and ${pinned.file} so they agree, then update the README to match.`,
      });
    }
  }

  const docClaims = claims.filter(
    (claim): claim is NodeVersionClaim => claim.kind === 'node-version',
  );
  const seen = new Set<string>();

  for (const claim of docClaims) {
    const spec = interpretDocVersion(claim.version);
    if (!spec) continue;

    const dedupeKey = spec.type === 'version' ? `v:${spec.version}` : `r:${spec.range}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    // Prefer engines.node (authoritative, can be high severity); otherwise a
    // pinned version file (capped at medium).
    let comparison: Comparison = null;
    let against: NodeVersionRequirement | null = null;
    if (engines) {
      const enginesRange = validRange(engines.raw);
      if (enginesRange) {
        comparison = compareToEngines(spec, enginesRange);
        against = engines;
      }
    } else if (pinned) {
      comparison = compareToPinned(spec, pinned.raw);
      against = pinned;
    }

    if (!comparison || !against) continue;

    const repoDescription =
      against.source === 'engines.node'
        ? `package.json engines.node is "${against.raw}"`
        : `${against.file} pins Node ${against.raw}`;

    issues.push({
      id: `${DETECTOR_ID}:doc:${dedupeKey}`,
      detectorId: DETECTOR_ID,
      severity: comparison.severity,
      title: `README Node version (${spec.label}) conflicts with ${against.file}`,
      description: `The README documents Node ${spec.label} (as "${claim.raw}"), but ${repoDescription} — ${comparison.reason}.`,
      evidence: [
        {
          label: 'README',
          file: claim.source.file,
          line: claim.source.line,
          snippet: claim.source.snippet,
        },
        {
          label: against.file,
          file: against.file,
          line: against.line,
          snippet:
            against.source === 'engines.node' ? `engines.node: ${against.raw}` : against.raw,
        },
      ],
      suggestedFix: docSuggestedFix(engines, pinned),
    });
  }

  return issues;
}
