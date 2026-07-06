import type { ScanReport } from '@/lib/report';

/** A sample report with one finding of each severity, for UI tests. */
export const sampleReport: ScanReport = {
  repo: { owner: 'acme', name: 'widget', defaultBranch: 'main', commitSha: 'abcdef1234567890' },
  scannedAt: '2026-07-05T12:00:00.000Z',
  truncated: false,
  summary: { error: 1, warning: 1, info: 1 },
  findings: [
    {
      id: 'command-drift:build:14',
      detectorId: 'command-drift',
      severity: 'error',
      title: 'README references `npm run build` but no matching script exists',
      description: 'The README documents running `npm run build`, but package.json has no "build" script.',
      evidence: [{ label: 'README', file: 'README.md', line: 14, snippet: 'npm run build' }],
      suggestedFix: 'Add a "build" script to package.json, or update the README command.',
    },
    {
      id: 'package-manager-drift:yarn-vs-npm',
      detectorId: 'package-manager-drift',
      severity: 'warning',
      title: "README uses yarn but the repo's lockfile is package-lock.json",
      description: 'The README documents `yarn install` (yarn), but the only lockfile is package-lock.json.',
      evidence: [{ label: 'README', file: 'README.md', line: 8, snippet: 'yarn install' }],
      suggestedFix: 'Use the npm equivalent, e.g. `npm install`.',
    },
    {
      id: 'env-var-drift:example-undocumented:AUTH_SECRET',
      detectorId: 'env-var-drift',
      severity: 'info',
      title: '`AUTH_SECRET` is in .env.example but not documented',
      description: 'The `AUTH_SECRET` environment variable appears in `.env.example` but is not documented in the README.',
      evidence: [{ label: 'env-example', file: '.env.example', line: 1, snippet: 'AUTH_SECRET=<redacted>' }],
      suggestedFix: "Document `AUTH_SECRET` in the README's configuration section.",
    },
  ],
};

export const emptyReport: ScanReport = {
  repo: { owner: 'acme', name: 'clean', defaultBranch: 'main', commitSha: '0000000abcdef' },
  scannedAt: '2026-07-05T12:00:00.000Z',
  truncated: false,
  summary: { error: 0, warning: 0, info: 0 },
  findings: [],
};
