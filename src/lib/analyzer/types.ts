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
  files: RepoFile[];
};

/** One occurrence of an env var name found in the repo (example file or source). */
export type EnvVarOccurrence = {
  /** The variable name only — values are never captured. */
  name: string;
  file: string;
  line: number;
  /** The source line, with any `KEY=value` value redacted. */
  snippet: string;
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
  /** Env var names declared in `.env.example`/`.sample`/`.template` files. */
  envVarsFromExamples: EnvVarOccurrence[];
  /** Env var names read in source (process.env.X, import.meta.env.X, etc). */
  envVarsFromCode: EnvVarOccurrence[];
  /** Lockfiles present at the repo root. */
  lockfiles: LockfileInfo[];
  /** Inferred package manager — set only when exactly one manager's lockfile exists. */
  packageManager: PackageManager | null;
  /** Node.js version evidence from package.json, .nvmrc, .node-version, etc. */
  nodeVersionRequirements: NodeVersionRequirement[];
};

/** The kinds of claims extractDocClaims currently knows how to find. */
export type DocClaimKind =
  | 'npm-script'
  | 'file-reference'
  | 'env-var'
  | 'command'
  | 'node-version';

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

/** A claim that documents an environment variable, e.g. "set `DATABASE_URL`". */
export type EnvVarClaim = {
  kind: 'env-var';
  /** The variable name only — values are never captured. */
  name: string;
  /** The reference as written, e.g. "DATABASE_URL" or "DATABASE_URL=". */
  rawText: string;
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

/**
 * A single claim made by the documentation. Detectors check claims like this
 * against the TruthModel.
 */
export type DocClaim =
  | NpmScriptClaim
  | FileReferenceClaim
  | EnvVarClaim
  | PackageCommandClaim
  | NodeVersionClaim;

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
