import { redactEnvValues } from '../envVars';
import type {
  DocClaim,
  DriftIssue,
  EnvVarClaim,
  EnvVarOccurrence,
  TruthModel,
} from '../types';

const DETECTOR_ID = 'env-var-drift';

// Ubiquitous runtime vars that are noise unless the README explicitly documents
// them as required app config.
const COMMON_ENV_VARS = new Set(['NODE_ENV', 'CI', 'PATH', 'HOME', 'PORT']);

/** Keep the first occurrence per name so evidence is stable and deduped. */
function firstByName(occurrences: EnvVarOccurrence[]): Map<string, EnvVarOccurrence> {
  const map = new Map<string, EnvVarOccurrence>();
  for (const occ of occurrences) {
    if (!map.has(occ.name)) map.set(occ.name, occ);
  }
  return map;
}

/**
 * Cross-checks env vars documented in the README against those declared in
 * `.env.example` files and read in source code. Emits one issue per env var:
 *
 * - documented but neither exampled nor used  → warning (medium)
 * - used in source but undocumented + no example → error (high)
 * - in an example but undocumented in README   → info (low)
 *
 * Only variable names are ever surfaced; values are redacted upstream.
 */
export function envVarDriftDetector(claims: DocClaim[], truth: TruthModel): DriftIssue[] {
  const documented = new Map<string, EnvVarClaim>();
  for (const claim of claims) {
    if (claim.kind !== 'env-var') continue;
    if (!documented.has(claim.name)) documented.set(claim.name, claim);
  }

  const examples = firstByName(truth.envVarsFromExamples);
  const code = firstByName(truth.envVarsFromCode);

  const docNames = new Set(documented.keys());
  const exampleNames = new Set(examples.keys());
  const codeNames = new Set(code.keys());

  // A common var is ignorable unless the README clearly documents it.
  const isIgnored = (name: string) => COMMON_ENV_VARS.has(name) && !docNames.has(name);

  const issues: DriftIssue[] = [];

  // Rule A (medium): documented in README, but nothing declares or uses it.
  for (const [name, claim] of documented) {
    if (exampleNames.has(name) || codeNames.has(name)) continue;
    issues.push({
      id: `${DETECTOR_ID}:documented-unused:${name}`,
      detectorId: DETECTOR_ID,
      severity: 'warning',
      title: `README documents \`${name}\` but nothing uses it`,
      description: `The README documents the \`${name}\` environment variable (as \`${claim.rawText}\`), but it is not present in any .env example file and is not read anywhere in source code.`,
      evidence: [
        {
          label: 'README',
          file: claim.source.file,
          line: claim.source.line,
          snippet: redactEnvValues(claim.source.snippet),
        },
      ],
      suggestedFix: `Add \`${name}\` to .env.example and read it in code, or remove it from the README if it is no longer used.`,
    });
  }

  // Rule B (high): read in source, but undocumented and not in any example.
  for (const [name, occ] of code) {
    if (docNames.has(name) || exampleNames.has(name)) continue;
    if (isIgnored(name)) continue;
    issues.push({
      id: `${DETECTOR_ID}:undocumented-usage:${name}`,
      detectorId: DETECTOR_ID,
      severity: 'error',
      title: `Source reads \`${name}\` but it is undocumented`,
      description: `Source code reads the \`${name}\` environment variable, but it is not documented in the README or present in any .env example file.`,
      evidence: [
        {
          label: 'source',
          file: occ.file,
          line: occ.line,
          snippet: redactEnvValues(occ.snippet),
        },
      ],
      suggestedFix: `Document \`${name}\` in the README and add it to .env.example.`,
    });
  }

  // Rule C (low): present in a .env.example, but undocumented in README.
  for (const [name, occ] of examples) {
    if (docNames.has(name)) continue;
    if (isIgnored(name)) continue;
    issues.push({
      id: `${DETECTOR_ID}:example-undocumented:${name}`,
      detectorId: DETECTOR_ID,
      severity: 'info',
      title: `\`${name}\` is in ${occ.file} but not documented`,
      description: `The \`${name}\` environment variable appears in \`${occ.file}\` but is not documented in the README.`,
      evidence: [
        {
          label: 'env-example',
          file: occ.file,
          line: occ.line,
          snippet: redactEnvValues(occ.snippet),
        },
      ],
      suggestedFix: `Document \`${name}\` in the README's configuration/environment section.`,
    });
  }

  return issues;
}
