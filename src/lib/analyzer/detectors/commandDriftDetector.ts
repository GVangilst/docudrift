import type { DocClaim, DriftIssue, TruthModel } from '../types';

const DETECTOR_ID = 'command-drift';

/**
 * Flags README-documented `npm run X` / `npm start` / `npm test` commands
 * that don't correspond to a package.json script. `npm start` is special:
 * npm falls back to running a root `server.js` when there's no "start"
 * script, so that combination is not drift.
 */
export function commandDriftDetector(claims: DocClaim[], truth: TruthModel): DriftIssue[] {
  const scripts = truth.packageJson?.scripts ?? {};
  const issues: DriftIssue[] = [];

  for (const claim of claims) {
    if (claim.kind !== 'npm-script') continue;
    if (Object.prototype.hasOwnProperty.call(scripts, claim.scriptName)) continue;
    if (claim.scriptName === 'start' && truth.hasRootServerJs) continue;

    const missingServerNote =
      claim.scriptName === 'start' ? ' and no root server.js was found' : '';

    issues.push({
      id: `${DETECTOR_ID}:${claim.scriptName}:${claim.source.line}`,
      detectorId: DETECTOR_ID,
      severity: 'error',
      title: `README references \`${claim.command}\` but no matching script exists`,
      description: `The README documents running \`${claim.command}\`, but package.json has no "${claim.scriptName}" script${missingServerNote}.`,
      evidence: [
        {
          label: 'README',
          file: claim.source.file,
          line: claim.source.line,
          snippet: claim.source.snippet,
        },
      ],
      suggestedFix: `Add a "${claim.scriptName}" script to package.json, or update the README command.`,
    });
  }

  return issues;
}
