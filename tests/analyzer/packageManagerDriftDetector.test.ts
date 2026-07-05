import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '@/lib/analyzer/analyzeRepository';
import type { DriftIssue } from '@/lib/analyzer/types';
import { loadFixtureRepo } from '../helpers/loadFixtureRepo';

function pmIssues(name: string): DriftIssue[] {
  return analyzeRepository(loadFixtureRepo(name)).filter(
    (issue) => issue.detectorId === 'package-manager-drift',
  );
}

describe('packageManagerDriftDetector', () => {
  it('does not flag when README npm commands match a package-lock.json', () => {
    expect(pmIssues('pm-npm-consistent')).toHaveLength(0);
  });

  it('flags yarn commands when only package-lock.json exists (medium)', () => {
    const issues = pmIssues('pm-yarn-vs-npm');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].title).toContain('yarn');
    expect(issues[0].title).toContain('package-lock.json');
    // Suggests the npm equivalent.
    expect(issues[0].suggestedFix).toContain('npm install');
  });

  it('flags npm commands when only pnpm-lock.yaml exists (medium)', () => {
    const issues = pmIssues('pm-npm-vs-pnpm');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].title).toContain('npm');
    expect(issues[0].title).toContain('pnpm-lock.yaml');
  });

  it('does not flag when the README explicitly offers alternatives', () => {
    expect(pmIssues('pm-alternatives')).toHaveLength(0);
  });

  it('emits a low-severity ambiguity warning when multiple lockfiles exist', () => {
    const issues = pmIssues('pm-multiple-lockfiles');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('info');
    expect(issues[0].title).toContain('Multiple lockfiles');
  });

  it('does not flag package-manager drift when there is no lockfile', () => {
    expect(pmIssues('pm-no-lockfile')).toHaveLength(0);
  });
});
