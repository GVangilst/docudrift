import type { DockerInfo, PortMapping, RepoSnapshot } from './types';

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

/**
 * Parses a `host:container`, `ip:host:container`, or bare `container` port spec
 * (quotes and `/tcp` suffix tolerated). The last numeric segment is the
 * container port; the one before it, if any, is the host port. Non-numeric
 * segments (e.g. `${PORT}`) are ignored.
 */
export function parsePortMapping(spec: string): PortMapping | null {
  const cleaned = spec.trim().replace(/^['"]|['"]$/g, '').replace(/\/(tcp|udp)$/i, '');
  const numbers = cleaned
    .split(':')
    .map((part) => (/^\d+$/.test(part) ? Number(part) : null))
    .filter((n): n is number => n !== null);

  if (numbers.length === 0) return null;
  return {
    container: numbers[numbers.length - 1],
    host: numbers.length >= 2 ? numbers[numbers.length - 2] : null,
  };
}

function parseExposedPorts(content: string): number[] {
  const ports: number[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*EXPOSE\s+(.+)$/i.exec(line);
    if (!match) continue;
    for (const token of match[1].trim().split(/\s+/)) {
      const port = /^(\d+)(?:\/(?:tcp|udp))?$/i.exec(token);
      if (port) ports.push(Number(port[1]));
    }
  }
  return ports;
}

/**
 * Best-effort parse of a compose file's `ports:` mappings and the env keys it
 * needs from the host. Not a full YAML parser — it tracks `ports:` and
 * `environment:` blocks by indentation, which covers standard compose files.
 */
function parseCompose(content: string): { ports: PortMapping[]; requiredEnvKeys: string[] } {
  const ports: PortMapping[] = [];
  const requiredEnvKeys = new Set<string>();

  // `${VAR}` / `${VAR:-default}` interpolation references the host env.
  for (const match of content.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?-[^}]*)?\}/g)) {
    requiredEnvKeys.add(match[1]);
  }

  let inPorts = false;
  let portsIndent = 0;
  let inEnv = false;
  let envIndent = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '');
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;

    if (inPorts && indent <= portsIndent) inPorts = false;
    if (inEnv && indent <= envIndent) inEnv = false;

    const portsHeader = /^(\s*)ports:\s*$/.exec(line);
    if (portsHeader) {
      inPorts = true;
      portsIndent = portsHeader[1].length;
      inEnv = false;
      continue;
    }
    const envHeader = /^(\s*)environment:\s*$/.exec(line);
    if (envHeader) {
      inEnv = true;
      envIndent = envHeader[1].length;
      inPorts = false;
      continue;
    }

    if (inPorts) {
      const item = /^\s*-\s*(.+)$/.exec(line);
      if (item) {
        const mapping = parsePortMapping(item[1]);
        if (mapping) ports.push(mapping);
      }
      continue;
    }

    if (inEnv) {
      // List form: `- KEY` (required from host) or `- KEY=value` (set inline).
      const listItem = /^\s*-\s*([A-Za-z_][A-Za-z0-9_]*)(=?)/.exec(line);
      if (listItem) {
        if (listItem[2] !== '=') requiredEnvKeys.add(listItem[1]);
        continue;
      }
      // Map form: `KEY:` (empty → required) or `KEY: value` (set inline).
      const mapItem = /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
      if (mapItem && mapItem[2].trim() === '') requiredEnvKeys.add(mapItem[1]);
    }
  }

  return { ports, requiredEnvKeys: [...requiredEnvKeys] };
}

/** Collects Docker/compose file evidence and parsed port/env config from the repo. */
export function collectDockerInfo(snapshot: RepoSnapshot): DockerInfo {
  const dockerfilePaths: string[] = [];
  const composeFilePaths: string[] = [];
  const exposedPorts: number[] = [];
  const composePorts: PortMapping[] = [];
  const requiredEnvKeys = new Set<string>();

  for (const file of snapshot.files) {
    if (isDockerfile(file.path)) {
      dockerfilePaths.push(file.path);
      exposedPorts.push(...parseExposedPorts(file.content));
    } else if (isComposeFile(file.path)) {
      composeFilePaths.push(file.path);
      const parsed = parseCompose(file.content);
      composePorts.push(...parsed.ports);
      parsed.requiredEnvKeys.forEach((key) => requiredEnvKeys.add(key));
    }
  }

  return {
    hasDockerfile: dockerfilePaths.length > 0,
    dockerfilePaths,
    hasComposeFile: composeFilePaths.length > 0,
    composeFilePaths,
    exposedPorts,
    composePorts,
    requiredEnvKeys: [...requiredEnvKeys],
  };
}
