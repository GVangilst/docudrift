import type { DockerCommandClaim, DocClaim, DriftIssue, TruthModel } from '../types';

const DETECTOR_ID = 'docker-drift';
const COMPOSE_FILE_NAMES = 'docker-compose.yml, docker-compose.yaml, compose.yml, or compose.yaml';

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

function dockerfileExists(file: string, truth: TruthModel): boolean {
  return (
    truth.filePaths.includes(file) ||
    truth.docker.dockerfilePaths.some((path) => basename(path) === file)
  );
}

/**
 * Flags README/doc Docker commands that reference Docker files the repo doesn't
 * have: `docker build` with no Dockerfile, `docker build -f X` where X is
 * missing, and `docker compose up` / `docker-compose up` with no compose file.
 * Bare `docker run` is not flagged (the image may come from a registry). Never
 * runs Docker or builds images.
 */
export function dockerDriftDetector(claims: DocClaim[], truth: TruthModel): DriftIssue[] {
  const dockerClaims = claims.filter(
    (claim): claim is DockerCommandClaim => claim.kind === 'docker-command',
  );

  const issues: DriftIssue[] = [];
  const seen = new Set<string>();
  const { docker } = truth;

  const push = (dedupeKey: string, issue: DriftIssue) => {
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    issues.push(issue);
  };

  for (const claim of dockerClaims) {
    const readmeEvidence = {
      label: 'README',
      file: claim.source.file,
      line: claim.source.line,
      snippet: claim.source.snippet,
    };

    if (claim.command === 'compose') {
      if (docker.hasComposeFile) continue;
      push(`compose`, {
        id: `${DETECTOR_ID}:compose-missing`,
        detectorId: DETECTOR_ID,
        severity: 'error',
        title: `README documents \`${claim.raw}\` but no Compose file exists`,
        description: `The README documents \`${claim.raw}\`, but the repo has no Compose file (expected one of: ${COMPOSE_FILE_NAMES}).`,
        evidence: [readmeEvidence],
        suggestedFix: `Add a Compose file (e.g. docker-compose.yml), or remove/update the compose instruction in the README.`,
      });
      continue;
    }

    if (claim.command === 'build' && claim.dockerfile) {
      if (dockerfileExists(claim.dockerfile, truth)) continue;
      const evidence = [readmeEvidence];
      if (docker.hasDockerfile) {
        evidence.push({
          label: 'repo',
          file: docker.dockerfilePaths[0],
          line: 1,
          snippet: docker.dockerfilePaths[0],
        });
      }
      push(`build:${claim.dockerfile}`, {
        id: `${DETECTOR_ID}:dockerfile-missing:${claim.dockerfile}`,
        detectorId: DETECTOR_ID,
        severity: 'error',
        title: `README documents \`${claim.raw}\` but \`${claim.dockerfile}\` does not exist`,
        description: `The README documents \`${claim.raw}\`, but \`${claim.dockerfile}\` is not present in the repo${
          docker.hasDockerfile ? ` (found: ${docker.dockerfilePaths.join(', ')})` : ''
        }.`,
        evidence,
        suggestedFix: docker.hasDockerfile
          ? `Change the README to use \`${docker.dockerfilePaths[0]}\`, or add \`${claim.dockerfile}\`.`
          : `Add \`${claim.dockerfile}\`, or update the Docker build instruction in the README.`,
      });
      continue;
    }

    if (claim.command === 'build') {
      if (docker.hasDockerfile) continue;
      push(`build`, {
        id: `${DETECTOR_ID}:dockerfile-missing`,
        detectorId: DETECTOR_ID,
        severity: 'error',
        title: `README documents \`${claim.raw}\` but no Dockerfile exists`,
        description: `The README documents \`${claim.raw}\`, but the repo has no Dockerfile.`,
        evidence: [readmeEvidence],
        suggestedFix: `Add a Dockerfile, or remove/update the Docker build instruction in the README.`,
      });
      continue;
    }

    // `docker run` alone is not flagged — the image may be pulled from a registry.
  }

  return issues;
}
