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
  /** Every file path in the repo, root-relative and posix-style. */
  filePaths: string[];
};

/** The kinds of claims extractDocClaims currently knows how to find. */
export type DocClaimKind = 'npm-script' | 'file-reference';

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

/**
 * A single claim made by the documentation. Detectors check claims like this
 * against the TruthModel.
 */
export type DocClaim = NpmScriptClaim | FileReferenceClaim;

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
