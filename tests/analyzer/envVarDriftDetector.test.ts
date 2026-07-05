import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '@/lib/analyzer/analyzeRepository';
import type { DriftIssue } from '@/lib/analyzer/types';
import { loadFixtureRepo } from '../helpers/loadFixtureRepo';

function envIssues(name: string): DriftIssue[] {
  return analyzeRepository(loadFixtureRepo(name)).filter(
    (issue) => issue.detectorId === 'env-var-drift',
  );
}

describe('envVarDriftDetector', () => {
  it('reports nothing when README, .env.example, and source all agree', () => {
    expect(envIssues('env-all-consistent')).toHaveLength(0);
  });

  it('flags a documented var that is unused (medium) and an example var that is undocumented (low)', () => {
    const issues = envIssues('env-doc-mismatch');
    expect(issues).toHaveLength(2);

    const documentedUnused = issues.find((i) => i.title.includes('MONGO_URI'));
    expect(documentedUnused?.severity).toBe('warning');

    const exampleUndocumented = issues.find((i) => i.title.includes('DATABASE_URL'));
    expect(exampleUndocumented?.severity).toBe('info');
    // No secret value leaks into the evidence snippet.
    expect(exampleUndocumented?.evidence[0].snippet).not.toContain('postgres');
    expect(exampleUndocumented?.evidence[0].snippet).toContain('<redacted>');

    expect(issues.some((i) => i.severity === 'error')).toBe(false);
  });

  it('flags a source-used var that is undocumented and has no example (high)', () => {
    const issues = envIssues('env-code-only');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].title).toContain('STRIPE_SECRET_KEY');
    expect(issues[0].evidence[0].file).toBe('src/payments.js');
  });

  it('flags an example var missing from the README (low)', () => {
    const issues = envIssues('env-example-only');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('info');
    expect(issues[0].title).toContain('AUTH_SECRET');
  });

  it('ignores common vars like NODE_ENV', () => {
    expect(envIssues('env-common-ignored')).toHaveLength(0);
  });

  it('detects process.env["KEY"] bracket access', () => {
    const issues = envIssues('env-bracket-usage');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].title).toContain('DATABASE_URL');
  });

  it('detects import.meta.env.KEY frontend access', () => {
    const issues = envIssues('env-import-meta');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].title).toContain('VITE_API_URL');
  });
});
