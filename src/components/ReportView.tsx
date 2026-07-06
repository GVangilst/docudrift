'use client';

import { useState } from 'react';
import type { DriftSeverity } from '@/lib/analyzer/types';
import type { ScanReport } from '@/lib/report';
import { FindingCard } from './FindingCard';
import { SummaryBar } from './SummaryBar';

const SEVERITIES: DriftSeverity[] = ['error', 'warning', 'info'];

type ReportViewProps = {
  report: ScanReport;
  onRescan: () => void;
};

export function ReportView({ report, onRescan }: ReportViewProps) {
  const [active, setActive] = useState<Set<DriftSeverity>>(new Set(SEVERITIES));

  const toggle = (severity: DriftSeverity) =>
    setActive((current) => {
      const next = new Set(current);
      if (next.has(severity)) next.delete(severity);
      else next.add(severity);
      return next;
    });

  const visible = report.findings.filter((finding) => active.has(finding.severity));
  const hasFindings = report.findings.length > 0;

  return (
    <section className="w-full max-w-2xl space-y-5">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <a
            href={`https://github.com/${report.repo.owner}/${report.repo.name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-semibold text-gray-900 hover:underline dark:text-gray-100"
          >
            {report.repo.owner}/{report.repo.name}
          </a>
          <button
            type="button"
            onClick={onRescan}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Re-scan
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {report.repo.defaultBranch} · {report.repo.commitSha.slice(0, 7)} · scanned{' '}
          {new Date(report.scannedAt).toLocaleString()}
        </p>
        {report.truncated && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            This repository is large — its file tree was truncated, so the scan is partial.
          </p>
        )}
        <SummaryBar summary={report.summary} />
      </header>

      {!hasFindings ? (
        <div className="rounded-md border border-gray-200 px-4 py-8 text-center text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
          No drift detected — the docs match the repo. 🎉
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {SEVERITIES.map((severity) => (
              <button
                key={severity}
                type="button"
                aria-pressed={active.has(severity)}
                onClick={() => toggle(severity)}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
                  active.has(severity)
                    ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                    : 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                {severity} ({report.summary[severity]})
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {visible.map((finding) => (
              <FindingCard key={finding.id} finding={finding} />
            ))}
            {visible.length === 0 && (
              <p className="px-1 py-4 text-sm text-gray-500 dark:text-gray-400">
                No findings match the selected severities.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
