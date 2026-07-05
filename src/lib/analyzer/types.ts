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
};

/** The kinds of claims extractDocClaims currently knows how to find. */
export type DocClaimKind = 'npm-script';

/**
 * A single claim made by the documentation, e.g. "run `npm run build`".
 * Detectors check claims like this against the TruthModel.
 */
export type DocClaim = {
  kind: DocClaimKind;
  /** The full command text as it appears in the doc, e.g. "npm run build". */
  command: string;
  /** The package.json script name this claim depends on, e.g. "build". */
  scriptName: string;
  source: {
    file: string;
    line: number;
    snippet: string;
  };
};

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
