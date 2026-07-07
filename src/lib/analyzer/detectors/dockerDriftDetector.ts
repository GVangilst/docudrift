import { isCommonEnv } from '../envVars';
import type {
  DockerCommandClaim,
  DocClaim,
  DriftIssue,
  EnvVarClaim,
  TruthModel,
} from '../types';

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
 * Ports the repo's images actually listen on: Dockerfile `EXPOSE` plus the
 * container side of each compose port mapping.
 */
function repoContainerPorts(truth: TruthModel): Set<number> {
  return new Set<number>([
    ...truth.docker.exposedPorts,
    ...truth.docker.composePorts.map((mapping) => mapping.container),
  ]);
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
      if (docker.hasComposeFileInTree) continue;
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
      if (docker.hasDockerfileInTree) continue;
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

    if (claim.command === 'run' && claim.ports) {
      // Bare `docker run` isn't flagged, but a `-p H:C` whose container port
      // isn't exposed by the image is drift ("wrong port, not working").
      const targetPorts = repoContainerPorts(truth);
      if (targetPorts.size === 0) continue;
      const exposedList = [...targetPorts].sort((a, b) => a - b).join(', ');

      for (const mapping of claim.ports) {
        if (targetPorts.has(mapping.container)) continue;
        push(`port:${mapping.container}`, {
          id: `${DETECTOR_ID}:port-mismatch:${mapping.container}`,
          detectorId: DETECTOR_ID,
          severity: 'error',
          title: `README maps container port ${mapping.container} but the image exposes ${exposedList}`,
          description: `The README documents \`${claim.raw}\`, which targets container port ${mapping.container}, but the repo's Docker config exposes ${exposedList}.`,
          evidence: [readmeEvidence],
          suggestedFix: `Map one of the exposed ports (${exposedList}), or update the Dockerfile \`EXPOSE\`/compose \`ports\` to include ${mapping.container}.`,
        });
      }
    }
  }

  // Env drift: env vars a compose file needs from the host that aren't documented.
  // Gated on the repo actually using a `.env.example` (so a missing var is real
  // drift, not just a repo that doesn't use the convention), and aggregated into
  // ONE finding per compose file instead of a wall of per-var warnings.
  if (truth.envVarsFromExamples.length > 0) {
    const documented = new Set(
      claims.filter((claim): claim is EnvVarClaim => claim.kind === 'env-var').map((c) => c.name),
    );
    const inExample = new Set(truth.envVarsFromExamples.map((occ) => occ.name));

    for (const { file, keys } of docker.composeRequiredEnv) {
      const missing = keys.filter(
        (key) => !documented.has(key) && !inExample.has(key) && !isCommonEnv(key),
      );
      if (missing.length === 0) continue;
      const list = missing.join(', ');
      push(`compose-env:${file}`, {
        id: `${DETECTOR_ID}:compose-env:${file}`,
        detectorId: DETECTOR_ID,
        severity: 'warning',
        title: `${file} requires ${missing.length} undocumented env var${missing.length === 1 ? '' : 's'}`,
        description: `\`${file}\` needs these env vars from the host, but they are not in the README or any .env example file: ${list}.`,
        evidence: [{ label: file, file, line: 1, snippet: list }],
        suggestedFix: `Add the missing vars to .env.example (and document them): ${list}.`,
      });
    }
  }

  return issues;
}
