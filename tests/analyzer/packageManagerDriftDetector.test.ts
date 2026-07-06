import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '@/lib/analyzer/analyzeRepository';
import type { DriftIssue, RepoSnapshot } from '@/lib/analyzer/types';
import { loadFixtureRepo } from '../helpers/loadFixtureRepo';

function pmIssues(name: string): DriftIssue[] {
  return analyzeRepository(loadFixtureRepo(name)).filter(
    (issue) => issue.detectorId === 'package-manager-drift',
  );
}

function pmIssuesFor(readme: string): DriftIssue[] {
  const snapshot: RepoSnapshot = {
    repo: { owner: 'o', name: 'r' },
    files: [
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'package-lock.json', content: '{}' },
      { path: 'README.md', content: readme },
    ],
    allPaths: ['package.json', 'package-lock.json', 'README.md'],
  };
  return analyzeRepository(snapshot).filter((i) => i.detectorId === 'package-manager-drift');
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

  it('ignores library-install examples (`yarn add pkg`, `npm install -g cli`)', () => {
    // README shows installing published packages, not setting up this repo.
    expect(pmIssuesFor('# x\n\n```bash\nyarn add wind-core\n```\n')).toHaveLength(0);
    expect(pmIssuesFor('# x\n\n```bash\nnpm install -g some-cli\n```\n')).toHaveLength(0);
    expect(pmIssuesFor('# x\n\n```bash\npnpm add lodash\n```\n')).toHaveLength(0);
  });

  it('still flags a genuine setup command in the wrong manager (`yarn install`)', () => {
    const issues = pmIssuesFor('# x\n\n```bash\nyarn install\n```\n');
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('yarn');
  });

  it('treats an inline alternatives comment as offering alternatives (no drift)', () => {
    // solidjs/templates style: "$ npm install # or pnpm install or yarn install".
    const issues = pmIssuesFor('# x\n\n```bash\n$ npm install # or pnpm install or yarn install\n```\n');
    expect(issues).toHaveLength(0);
  });

  it('does not treat a package-manager mention in prose/table as a command', () => {
    // cal.com style: a table cell mentioning "Nodejs/NPM build options".
    const issues = pmIssuesFor('# x\n\n| MAX_OLD_SPACE_SIZE | Needed for Nodejs/NPM build options |\n');
    expect(issues).toHaveLength(0);
  });
});
