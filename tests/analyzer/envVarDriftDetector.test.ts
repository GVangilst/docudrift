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

  it('ignores env reads in scripts/ but keeps real app source', () => {
    // scripts/build.js reads SECRET_X (tooling); src/index.js reads REAL_APP_VAR.
    const issues = envIssues('env-tooling-scripts');
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('REAL_APP_VAR');
    expect(issues.some((i) => /SECRET_X/.test(i.title))).toBe(false);
  });

  it('ignores env reads in build-config files (rollup.config.ts)', () => {
    expect(envIssues('env-config-file')).toHaveLength(0);
  });

  it('still flags env reads in an application *.config.ts module (not build tooling)', () => {
    // src/config/database.config.ts is real app config, not a bundler config.
    const issues = envIssues('env-app-config');
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('DATABASE_URL');
    expect(issues[0].evidence[0].file).toBe('src/config/database.config.ts');
  });

  it('does not report "documented but unused" when the var is used in a script (Rule A)', () => {
    // BUILD_TOKEN is documented AND read in scripts/release.js — it IS used, so
    // Rule A must not fire (tooling reads still count as usage).
    const issues = envFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x\n\nSet `BUILD_TOKEN` for releases.' },
      { path: 'scripts/release.js', content: 'const t = process.env.BUILD_TOKEN;' },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('ignores env reads in a *-test script (manual-security-test.cjs)', () => {
    expect(envIssues('env-test-script')).toHaveLength(0);
  });

  it('ignores env reads in .github/, examples/, benchmarking/ but keeps app source', () => {
    const issues = envFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x' },
      { path: '.github/actions/a/src/x.ts', content: 'const a = process.env.CI_SECRET;' },
      { path: 'examples/basic/config/port.js', content: 'const p = process.env.DEMO_PORT;' },
      { path: 'benchmarking/run.js', content: 'const d = process.env.BENCH_DIR;' },
      { path: 'src/app.ts', content: 'const r = process.env.APP_RUNTIME_VAR;' },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('APP_RUNTIME_VAR');
  });

  it('ignores env reads in a bare test.ts and in a docusaurus.config.js', () => {
    const issues = envFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x' },
      { path: 'src/add/test.ts', content: 'const z = process.env.tzX;' },
      { path: 'dev-docs/docusaurus.config.js', content: 'process.env.IS_PREACT = "false";' },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('ignores a process.env write and __checks__/ tooling, keeps a real read', () => {
    const issues = envFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x' },
      { path: 'src/main.ts', content: 'process.env.TRIGGER_VERSION = TRIGGER_VERSION;\nconst a = process.env.REAL_ONE;' },
      { path: '__checks__/dashboard.check.js', content: 'const u = process.env.ENVIRONMENT_URL;' },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('REAL_ONE');
    expect(issues.some((i) => /TRIGGER_VERSION|ENVIRONMENT_URL/.test(i.title))).toBe(false);
  });

  it('does not treat a SCREAMING_SNAKE heading or placeholder tokens as env vars', () => {
    const issues = envFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      {
        path: 'README.md',
        content:
          '# x\n\n##### CLIENT_FETCH_ERROR\n\nUse `postgres://u:YOUR_PASSWORD@h/db` and [YOUR_RESPONSIBILITY_1].\n',
      },
    ]);
    expect(
      issues.some((i) => /CLIENT_FETCH_ERROR|YOUR_PASSWORD|YOUR_RESPONSIBILITY/.test(i.title)),
    ).toBe(false);
  });

  it('does not report a documented common var (NODE_OPTIONS) as unused (Rule A)', () => {
    const issues = envFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x\n\nSet `NODE_OPTIONS` to raise the memory limit.' },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('suppresses "documented but unused" (Rule A) when repo source was not fully fetched', () => {
    const files = [
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x\n\nSet `FEATURE_FLAG_ONE` to enable the feature.' },
    ];
    // Complete coverage → Rule A fires.
    expect(envFrom(files)).toHaveLength(1);
    // A source file exists in the tree but wasn't fetched → Rule A suppressed
    // (FEATURE_FLAG_ONE might be read there).
    const suppressed = analyzeRepository({
      repo: { owner: 'o', name: 'r' },
      files,
      allPaths: [...files.map((f) => f.path), 'src/feature.ts'],
    }).filter((i) => i.detectorId === 'env-var-drift');
    expect(suppressed).toHaveLength(0);
  });
});
