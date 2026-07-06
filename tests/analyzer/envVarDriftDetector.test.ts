import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '@/lib/analyzer/analyzeRepository';
import type { DriftIssue, RepoSnapshot } from '@/lib/analyzer/types';
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

  it('flags a documented var that is unused (medium); an example-only var is not flagged', () => {
    const issues = envIssues('env-doc-mismatch');
    // MONGO_URI documented but unused → warning. DATABASE_URL is in .env.example
    // (which is documentation), so it is intentionally not flagged.
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('MONGO_URI');
    expect(issues[0].severity).toBe('warning');
    expect(issues.some((i) => i.title.includes('DATABASE_URL'))).toBe(false);
  });

  it('flags a source-used var that is undocumented and has no example (high)', () => {
    const issues = envIssues('env-code-only');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].title).toContain('STRIPE_SECRET_KEY');
    expect(issues[0].evidence[0].file).toBe('src/payments.js');
  });

  it('does not flag an env var that is only in .env.example (example is the docs)', () => {
    // .env.example IS the documentation, so a var present there but not repeated
    // in the README is not drift.
    expect(envIssues('env-example-only')).toHaveLength(0);
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

  it('does not treat SCREAMING_CASE filenames (PRODUCT_SPEC.md) as env vars', () => {
    expect(envIssues('env-filename-not-var')).toHaveLength(0);
  });

  it('ignores env reads in comments and placeholder names, but keeps real ones', () => {
    const issues = envIssues('env-comment-placeholder');
    // process.env.FOO (comment) and process.env.X (placeholder) are ignored;
    // only the real process.env.DATABASE_URL is flagged.
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('DATABASE_URL');
    expect(issues.some((i) => /\bFOO\b|`X`/.test(i.title))).toBe(false);
  });

  it('ignores env usage in test/fixture paths but keeps real source', () => {
    const snapshot: RepoSnapshot = {
      repo: { owner: 'o', name: 'r' },
      files: [
        { path: 'package.json', content: '{"name":"x"}' },
        { path: 'README.md', content: '# x' },
        { path: 'tests/fixtures/demo/src/app.js', content: 'const s = process.env.FIXTURE_SECRET;' },
        { path: 'src/real.js', content: 'const r = process.env.REAL_TOKEN;' },
      ],
      allPaths: ['package.json', 'README.md', 'tests/fixtures/demo/src/app.js', 'src/real.js'],
    };
    const issues = analyzeRepository(snapshot).filter((i) => i.detectorId === 'env-var-drift');
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('REAL_TOKEN');
    expect(issues.some((i) => /FIXTURE_SECRET/.test(i.title))).toBe(false);
  });

  function envFrom(files: RepoSnapshot['files'], allPaths?: string[]) {
    return analyzeRepository({
      repo: { owner: 'o', name: 'r' },
      files,
      allPaths: allPaths ?? files.map((f) => f.path),
    }).filter((i) => i.detectorId === 'env-var-drift');
  }

  it('ignores platform/framework built-in env vars (VERCEL_URL, import.meta.env.PROD, UV_THREADPOOL_SIZE)', () => {
    const issues = envFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x' },
      {
        path: 'src/app.ts',
        content:
          'const a = process.env.VERCEL_URL;\nconst b = import.meta.env.PROD;\nconst c = process.env.UV_THREADPOOL_SIZE;\nconst d = process.env.npm_package_version;',
      },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('skips env reads in build/vendored output (dist/)', () => {
    const issues = envFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x' },
      { path: 'dist/bundle.js', content: 'const s = process.env.SOME_SECRET_KEY;' },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('counts docker-compose env keys as usage (documented DB var is not "unused")', () => {
    const issues = envFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x\n\nSet `POSTGRES_USER` for the database.' },
      {
        path: 'docker-compose.yml',
        content: 'services:\n  db:\n    image: postgres\n    environment:\n      POSTGRES_USER: app\n',
      },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('does not treat URL query params or date placeholders as env vars', () => {
    const issues = envFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      {
        path: 'README.md',
        content:
          '# x\n\n```bash\nYYYYMMDD=<a date>\ncurl "http://x/y?var_UGRD=on&var_VGRD=on&dir=${YYYYMMDD}"\n```\n',
      },
    ]);
    expect(issues.some((i) => /YYYYMMDD|UGRD|VGRD/.test(i.title))).toBe(false);
  });
});
