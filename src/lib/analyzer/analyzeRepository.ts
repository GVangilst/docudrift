import { buildTruthModel } from './buildTruthModel';
import { commandDriftDetector } from './detectors/commandDriftDetector';
import { dockerDriftDetector } from './detectors/dockerDriftDetector';
import { fileReferenceDriftDetector } from './detectors/fileReferenceDriftDetector';
import { nodeEngineMismatchDetector } from './detectors/nodeEngineMismatchDetector';
import { packageManagerDriftDetector } from './detectors/packageManagerDriftDetector';
import { extractDocClaims } from './extractDocClaims';
import type { DocClaim, DriftIssue, RepoSnapshot, TruthModel } from './types';

// The registered detector suite. Every detector compares *structured* artifacts
// (scripts, lockfiles, engines, file existence, Docker/compose config) so its
// findings are authoritative. The former env-var-drift detector was removed: it
// required classifying arbitrary source directories as "the app" — an unbounded
// problem that can't be answered from a path + regex, so it produced open-ended
// false positives. See docs/PRODUCT_SPEC.md "Confidence tiers & limitations".
const DETECTORS: ((claims: DocClaim[], truth: TruthModel) => DriftIssue[])[] = [
  commandDriftDetector,
  fileReferenceDriftDetector,
  packageManagerDriftDetector,
  nodeEngineMismatchDetector,
  dockerDriftDetector,
];

/**
 * Runs the full detector suite against a repo snapshot and returns every drift
 * finding. Each detector is isolated: one that throws is skipped rather than
 * failing the whole scan.
 */
export function analyzeRepository(snapshot: RepoSnapshot): DriftIssue[] {
  const truth = buildTruthModel(snapshot);
  const claims = extractDocClaims(snapshot);

  const issues: DriftIssue[] = [];
  for (const detector of DETECTORS) {
    try {
      issues.push(...detector(claims, truth));
    } catch {
      // A misbehaving detector must not fail the whole scan.
    }
  }
  return issues;
}
