import { buildTruthModel } from './buildTruthModel';
import { commandDriftDetector } from './detectors/commandDriftDetector';
import { dockerDriftDetector } from './detectors/dockerDriftDetector';
import { envVarDriftDetector } from './detectors/envVarDriftDetector';
import { fileReferenceDriftDetector } from './detectors/fileReferenceDriftDetector';
import { nodeEngineMismatchDetector } from './detectors/nodeEngineMismatchDetector';
import { packageManagerDriftDetector } from './detectors/packageManagerDriftDetector';
import { extractDocClaims } from './extractDocClaims';
import type { DriftIssue, RepoSnapshot } from './types';

/**
 * Runs the full detector suite against a repo snapshot and returns every
 * drift finding. Add new detectors to this list as they're implemented.
 */
export function analyzeRepository(snapshot: RepoSnapshot): DriftIssue[] {
  const truth = buildTruthModel(snapshot);
  const claims = extractDocClaims(snapshot);

  return [
    ...commandDriftDetector(claims, truth),
    ...fileReferenceDriftDetector(claims, truth),
    ...envVarDriftDetector(claims, truth),
    ...packageManagerDriftDetector(claims, truth),
    ...nodeEngineMismatchDetector(claims, truth),
    ...dockerDriftDetector(claims, truth),
  ];
}
