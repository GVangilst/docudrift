import { buildTruthModel } from './buildTruthModel';
import { commandDriftDetector } from './detectors/commandDriftDetector';
import { dockerDriftDetector } from './detectors/dockerDriftDetector';
import { envVarDriftDetector } from './detectors/envVarDriftDetector';
import { fileReferenceDriftDetector } from './detectors/fileReferenceDriftDetector';
import { nodeEngineMismatchDetector } from './detectors/nodeEngineMismatchDetector';
import { packageManagerDriftDetector } from './detectors/packageManagerDriftDetector';
import { extractDocClaims } from './extractDocClaims';
import type { DocClaim, DriftIssue, RepoSnapshot, TruthModel } from './types';

/** The registered detector suite, run in order. */
const DETECTORS: ((claims: DocClaim[], truth: TruthModel) => DriftIssue[])[] = [
  commandDriftDetector,
  fileReferenceDriftDetector,
  envVarDriftDetector,
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
