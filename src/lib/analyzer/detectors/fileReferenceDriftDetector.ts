import { closestMatch } from '../fuzzyMatch';
import type { DocClaim, DriftIssue, TruthModel } from '../types';

const DETECTOR_ID = 'file-reference-drift';

/** Suggest a correction only when the nearest path is a plausibly-close typo. */
function suggestionFor(path: string, filePaths: string[]): string | null {
  const match = closestMatch(path, filePaths);
  if (!match || match.distance === 0) return null;

  const threshold = Math.max(2, Math.ceil(path.length * 0.34));
  return match.distance <= threshold ? match.value : null;
}

/**
 * Flags README references to file paths that don't exist in the repo. `npm`
 * commands and other non-path text are filtered out upstream in
 * extractDocClaims; URLs and package names never become file-reference claims,
 * which keeps this detector free of those false positives.
 */
export function fileReferenceDriftDetector(
  claims: DocClaim[],
  truth: TruthModel,
): DriftIssue[] {
  const existing = new Set(truth.filePaths);
  const issues: DriftIssue[] = [];

  for (const claim of claims) {
    if (claim.kind !== 'file-reference') continue;
    if (existing.has(claim.path)) continue;

    const suggestedPath = suggestionFor(claim.path, truth.filePaths);

    issues.push({
      id: `${DETECTOR_ID}:${claim.path}:${claim.source.line}`,
      detectorId: DETECTOR_ID,
      // "medium" in the product spec maps to warning in our severity model.
      severity: 'warning',
      title: `README references \`${claim.rawText}\` but that path does not exist`,
      description: suggestedPath
        ? `The README references \`${claim.rawText}\`, but no file exists at \`${claim.path}\`. The closest existing path is \`${suggestedPath}\`.`
        : `The README references \`${claim.rawText}\`, but no file exists at \`${claim.path}\`.`,
      evidence: [
        {
          label: 'README',
          file: claim.source.file,
          line: claim.source.line,
          snippet: claim.source.snippet,
        },
      ],
      suggestedFix: suggestedPath
        ? `Update the reference to \`${suggestedPath}\`, or add the missing file \`${claim.path}\`.`
        : `Add the missing file \`${claim.path}\`, or remove the reference.`,
    });
  }

  return issues;
}
