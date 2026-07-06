'use client';

import { useState } from 'react';
import type { DriftIssue } from '@/lib/analyzer/types';
import { renderInlineCode } from '@/lib/inlineCode';
import { SeverityBadge } from './SeverityBadge';

export function FindingCard({ finding }: { finding: DriftIssue }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyFix = async () => {
    try {
      await navigator.clipboard.writeText(finding.suggestedFix);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context); ignore.
    }
  };

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <SeverityBadge severity={finding.severity} />
        <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
          {renderInlineCode(finding.title)}
        </span>
        <span className="mt-0.5 text-gray-400" aria-hidden>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {renderInlineCode(finding.description)}
          </p>

          <div className="space-y-2">
            {finding.evidence.map((evidence, index) => (
              <div key={index} className="rounded border border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between border-b border-gray-200 px-3 py-1.5 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <span className="font-medium">{evidence.label}</span>
                  <span className="font-mono">
                    {evidence.file}:{evidence.line}
                  </span>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-200">
                  {evidence.snippet}
                </pre>
              </div>
            ))}
          </div>

          <div className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/40">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Suggested fix
              </span>
              <button
                type="button"
                onClick={copyFix}
                className="text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {renderInlineCode(finding.suggestedFix)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
