import type { DockerInfo, RepoSnapshot } from './types';

// Dockerfile, dockerfile, Dockerfile.dev, Dockerfile.prod, etc.
const DOCKERFILE_RE = /^Dockerfile(\.[A-Za-z0-9_.-]+)?$/i;
const COMPOSE_FILES = new Set([
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
]);

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

export function isDockerfile(path: string): boolean {
  return DOCKERFILE_RE.test(basename(path));
}

export function isComposeFile(path: string): boolean {
  return COMPOSE_FILES.has(basename(path).toLowerCase());
}

/** Collects Docker/compose file evidence from the repo. */
export function collectDockerInfo(snapshot: RepoSnapshot): DockerInfo {
  const dockerfilePaths: string[] = [];
  const composeFilePaths: string[] = [];

  for (const file of snapshot.files) {
    if (isDockerfile(file.path)) dockerfilePaths.push(file.path);
    else if (isComposeFile(file.path)) composeFilePaths.push(file.path);
  }

  return {
    hasDockerfile: dockerfilePaths.length > 0,
    dockerfilePaths,
    hasComposeFile: composeFilePaths.length > 0,
    composeFilePaths,
  };
}
