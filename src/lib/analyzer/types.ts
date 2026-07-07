/**
 * A single file as fetched from a repository (GitHub API in production,
 * a local fixture directory in tests). Paths are root-relative, posix-style.
 */
export type RepoFile = {
  path: string;
  content: string;
};

/**
 * The raw, unparsed contents of a repository at one commit. This is the
 * input to the analyzer — everything downstream is derived from it.
 */
export type RepoSnapshot = {
  repo: {
    owner: string;
    name: string;
  };
  /** Files whose content was fetched (a bounded "key files" set in production). */
  files: RepoFile[];
  /**
   * Every file path in the repo (the full tree), used for existence checks like
   * dead-link and lockfile detection. When omitted, the paths of `files` are
   * used — fixtures load every file, so the two coincide there.
   */
  allPaths?: string[];
};

/** A JavaScript package manager DocuDrift understands. */
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

/** A lockfile found in the repo and the package manager it implies. */
export type LockfileInfo = {
  file: string;
  manager: PackageManager;
};

/** Where a Node.js version requirement was found in the repo. */
export type NodeVersionSource =
  | 'engines.node'
  | 'volta.node'
  | '.nvmrc'
  | '.node-version'
  | '.tool-versions';

/** One piece of Node.js version evidence from repo config (not documentation). */
export type NodeVersionRequirement = {
  source: NodeVersionSource;
  file: string;
  /** The raw version/range string, e.g. ">=20", "20.11.1", "18". */
  raw: string;
  line: number;
};

/** A published port mapping, `host:container` (host is null for a bare port). */
export type PortMapping = { host: number | null; container: number };

/** Docker-related files and parsed config present in the repo. */
export type DockerInfo = {
  hasDockerfile: boolean;
  dockerfilePaths: string[];
  hasComposeFile: boolean;
  composeFilePaths: string[];
  /**
   * Whether ANY Dockerfile/compose file exists anywhere in the repo tree,
   * including tooling/example paths. Used only for the "README documents docker
   * but no such file exists" existence checks — a README that says
   * `cd dockers/examples/standalone && docker-compose up` is satisfied by a
   * compose file there, even though that path is excluded from port/env drift.
   */
  hasDockerfileInTree: boolean;
  hasComposeFileInTree: boolean;
  /** Container ports declared via Dockerfile `EXPOSE`. */
  exposedPorts: number[];
  /** Port mappings declared in compose `ports:` blocks. */
  composePorts: PortMapping[];
};

/**
 * Facts about the repository derived from non-documentation sources
 * (package.json, file existence, etc). This is "reality" — what doc claims
 * are checked against.
 */
export type TruthModel = {
  packageJson: {
    scripts: Record<string, string>;
    engines: Record<string, string>;
    version: string | null;
    license: string | null;
  } | null;
  hasRootServerJs: boolean;
  rootFiles: string[];
  /** Every file path in the repo, root-relative and posix-style. */
  filePaths: string[];
  /** Lockfiles present at the repo root. */
  lockfiles: LockfileInfo[];
  /** Inferred package manager — set only when exactly one manager's lockfile exists. */
  packageManager: PackageManager | null;
  /** Node.js version evidence from package.json, .nvmrc, .node-version, etc. */
  nodeVersionRequirements: NodeVersionRequirement[];
  /** Docker/compose files present in the repo. */
  docker: DockerInfo;
};

/** The kinds of claims extractDocClaims currently knows how to find. */
export type DocClaimKind =
  | 'npm-script'
  | 'file-reference'
  | 'command'
  | 'node-version'
  | 'docker-command';

/** Where a claim was found in the documentation. */
export type DocClaimSource = {
  file: string;
  line: number;
  snippet: string;
};

/** A claim that a given npm script exists, e.g. "run `npm run build`". */
export type NpmScriptClaim = {
  kind: 'npm-script';
  /** The full command text as it appears in the doc, e.g. "npm run build". */
  command: string;
  /** The package.json script name this claim depends on, e.g. "build". */
  scriptName: string;
  source: DocClaimSource;
};

/** A claim that references a repository file path, e.g. "see `src/App.jsx`". */
export type FileReferenceClaim = {
  kind: 'file-reference';
  /** The reference exactly as written in the doc, e.g. "./src/App.jsx". */
  rawText: string;
  /** The normalized, repo-relative path the reference points to. */
  path: string;
  source: DocClaimSource;
};

/** A claim that documents a package-manager command, e.g. "run `yarn install`". */
export type PackageCommandClaim = {
  kind: 'command';
  /** The package manager the command invokes. */
  packageManager: PackageManager;
  /** The command as written, e.g. "yarn install" or "npm run dev". */
  command: string;
  source: DocClaimSource;
};

/** A claim that documents a required Node.js version, e.g. "Requires Node >=18". */
export type NodeVersionClaim = {
  kind: 'node-version';
  /** The full matched text, e.g. "Node >=18" or "nvm use 20". */
  raw: string;
  /** The version/range token as written, e.g. ">=18", "18", "20.11.1", "18.x". */
  version: string;
  source: DocClaimSource;
};

/** The kind of Docker command a doc references. */
export type DockerCommandKind = 'build' | 'run' | 'compose';

/** A claim that documents a Docker command, e.g. "run `docker compose up`". */
export type DockerCommandClaim = {
  kind: 'docker-command';
  command: DockerCommandKind;
  /** The command as written, e.g. "docker build -f Dockerfile.dev .". */
  raw: string;
  /** For `docker build -f <file>`, the specified Dockerfile path. */
  dockerfile?: string;
  /** Port mappings from `docker run -p H:C` flags. */
  ports?: PortMapping[];
  /** Env keys from `docker run -e KEY` flags. */
  envKeys?: string[];
  source: DocClaimSource;
};

/**
 * A single claim made by the documentation. Detectors check claims like this
 * against the TruthModel.
 */
export type DocClaim =
  | NpmScriptClaim
  | FileReferenceClaim
  | PackageCommandClaim
  | NodeVersionClaim
  | DockerCommandClaim;

export type DriftSeverity = 'error' | 'warning' | 'info';

/** One piece of evidence backing a DriftIssue — where to look to verify it. */
export type DriftEvidence = {
  label: string;
  file: string;
  line: number;
  snippet: string;
};

/** One detected instance of documentation drift. */
export type DriftIssue = {
  id: string;
  detectorId: string;
  severity: DriftSeverity;
  title: string;
  description: string;
  evidence: DriftEvidence[];
  suggestedFix: string;
};
