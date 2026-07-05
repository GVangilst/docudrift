import type { DriftIssue, DriftSeverity } from './analyzer/types';

export type ScanReport = {
  repo: { owner: string; name: string; defaultBranch: string; commitSha: string };
  scannedAt: string;
  truncated: boolean;
  summary: Record<DriftSeverity, number>;
  findings: DriftIssue[];
};

export type ReportMeta = {
  owner: string;
  name: string;
  defaultBranch: string;
  commitSha: string;
  truncated: boolean;
};

const SEVERITY_ORDER: Record<DriftSeverity, number> = { error: 0, warning: 1, info: 2 };

/** Assembles the API report: findings ordered by severity, plus severity counts. */
export function buildReport(meta: ReportMeta, issues: DriftIssue[]): ScanReport {
  const findings = [...issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  const summary: Record<DriftSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const issue of findings) summary[issue.severity] += 1;

  return {
    repo: {
      owner: meta.owner,
      name: meta.name,
      defaultBranch: meta.defaultBranch,
      commitSha: meta.commitSha,
    },
    scannedAt: new Date().toISOString(),
    truncated: meta.truncated,
    summary,
    findings,
  };
}
