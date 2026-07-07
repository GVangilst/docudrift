import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '@/lib/analyzer/analyzeRepository';
import type { DriftIssue, RepoSnapshot } from '@/lib/analyzer/types';
import { loadFixtureRepo } from '../helpers/loadFixtureRepo';

function dockerIssues(name: string): DriftIssue[] {
  return analyzeRepository(loadFixtureRepo(name)).filter(
    (issue) => issue.detectorId === 'docker-drift',
  );
}

function dockerIssuesFrom(files: RepoSnapshot['files']): DriftIssue[] {
  return analyzeRepository({
    repo: { owner: 'o', name: 'r' },
    files,
    allPaths: files.map((f) => f.path),
  }).filter((i) => i.detectorId === 'docker-drift');
}

describe('dockerDriftDetector — port drift', () => {
  it('does not flag when docker run -p container port matches Dockerfile EXPOSE', () => {
    expect(dockerIssues('docker-port-ok')).toHaveLength(0);
  });

  it('flags when docker run -p container port is not exposed by the Dockerfile (high)', () => {
    const issues = dockerIssues('docker-port-mismatch');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].title).toContain('3000');
    expect(issues[0].title).toContain('8080');
  });

  it('does not flag "docker-compose up" when a compose file exists only under examples/', () => {
    // README says `cd dockers/examples/standalone && docker-compose up`; the
    // compose file is there. The examples/ path is excluded from port/env drift,
    // but the existence check must still see it (it's a real, documented file).
    const issues = dockerIssuesFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      {
        path: 'README.md',
        content: '# x\n\n```bash\ncd dockers/examples/standalone/\ndocker-compose up -d\n```\n',
      },
      {
        path: 'dockers/examples/standalone/docker-compose.yaml',
        content: 'services:\n  a:\n    image: x\n',
      },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('does not flag when docker run -p container port matches a compose port mapping', () => {
    expect(dockerIssues('docker-port-compose-ok')).toHaveLength(0);
  });

  it('does not flag port drift when the repo exposes no ports at all', () => {
    expect(dockerIssues('docker-port-no-evidence')).toHaveLength(0);
  });
});

describe('dockerDriftDetector — env drift', () => {
  it('emits one aggregated finding for compose-required vars missing from .env.example', () => {
    // .env.example exists (has PORT) but the compose-required DATABASE_URL isn't in it.
    const issues = dockerIssues('docker-env-required');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].title).toContain('1 undocumented env var');
    expect(issues[0].description).toContain('DATABASE_URL');
  });

  it('does not flag compose env when the repo has no .env.example (convention not used)', () => {
    const issues = dockerIssuesFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x' },
      {
        path: 'docker-compose.yml',
        content: 'services:\n  a:\n    environment:\n      - SOME_SECRET\n',
      },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('does not flag a compose-required env var that the README documents', () => {
    expect(dockerIssues('docker-env-documented')).toHaveLength(0);
  });

  it('does not flag a compose-required env var that is present in .env.example', () => {
    expect(dockerIssues('docker-env-in-example')).toHaveLength(0);
  });

  it('ignores .devcontainer/ and .github/ compose files (tooling, not deployment)', () => {
    for (const dir of ['.devcontainer', '.github']) {
      const issues = dockerIssuesFrom([
        { path: 'package.json', content: '{"name":"x"}' },
        { path: 'README.md', content: '# x' },
        { path: '.env.example', content: 'PORT=3000\n' }, // gate open — proves the *exclusion* stops it
        {
          path: `${dir}/docker-compose.yml`,
          content: 'services:\n  a:\n    environment:\n      - CI_ONLY_VAR\n',
        },
      ]);
      expect(issues, dir).toHaveLength(0);
    }
  });

  it('does not flag a `${VAR:-default}` compose interpolation (optional), only bare `${VAR}`', () => {
    const issues = dockerIssuesFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x' },
      { path: '.env.example', content: 'PORT=3000\n' },
      {
        path: 'docker-compose.yml',
        // DATABASE_URL bare + PGPASS `:?err` → required; REDIS_PORT default → optional.
        content:
          'services:\n  a:\n    environment:\n      DB_URL: ${DATABASE_URL}\n      PGPASS: ${PGPASS:?required}\n      REDIS: ${REDIS_PORT:-6379}\n',
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain('DATABASE_URL');
    expect(issues[0].description).toContain('PGPASS');
    expect(issues[0].description).not.toContain('REDIS_PORT');
  });

  it('treats a commented `# KEY=value` line in .env.example as documenting KEY', () => {
    const issues = dockerIssuesFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x' },
      // DB_SSLMODE is documented as a commented example — the standard optional-var convention.
      { path: '.env.example', content: 'PORT=3000\n# DB_SSLMODE=require\n' },
      {
        path: 'docker-compose.yml',
        content: 'services:\n  a:\n    environment:\n      - DB_SSLMODE\n',
      },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('suppresses a var set inline (list `KEY=value`) even if another service interpolates it', () => {
    const issues = dockerIssuesFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x' },
      { path: '.env.example', content: 'PORT=3000\n' },
      {
        path: 'docker-compose.yml',
        // db sets POSTGRES_USER inline; app interpolates ${POSTGRES_USER} — not host-required.
        content:
          'services:\n  db:\n    environment:\n      - POSTGRES_USER=documenso\n  app:\n    environment:\n      DB: postgres://${POSTGRES_USER}@db/app\n',
      },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('suppresses a var set inline (map `KEY: "literal"`) in another service', () => {
    const issues = dockerIssuesFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x' },
      { path: '.env.example', content: 'PORT=3000\n' },
      {
        path: 'docker-compose.yml',
        content:
          'services:\n  server:\n    environment:\n      DISABLE_CRON: ${DISABLE_CRON}\n  worker:\n    environment:\n      DISABLE_CRON: "true"\n',
      },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('ignores compose ${VAR} interpolations that appear inside a # comment', () => {
    const issues = dockerIssuesFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x' },
      { path: '.env.example', content: 'PORT=3000\n' },
      {
        path: 'docker-compose.yml',
        // A and B only appear in a comment; REAL_VAR is the sole real required var.
        content:
          '# nested interpolation (${A:-${B}}) needs newer compose\nservices:\n  a:\n    environment:\n      REAL: ${REAL_VAR}\n',
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('1 undocumented env var');
    expect(issues[0].description).toContain('REAL_VAR');
  });

  it('does not flag common infra vars (TMPDIR) required by compose', () => {
    const issues = dockerIssuesFrom([
      { path: 'package.json', content: '{"name":"x"}' },
      { path: 'README.md', content: '# x' },
      { path: '.env.example', content: 'PORT=3000\n' },
      {
        path: 'docker-compose.yml',
        content: 'services:\n  a:\n    environment:\n      - TMPDIR\n      - APP_SECRET\n',
      },
    ]);
    // TMPDIR ignored (common infra); APP_SECRET aggregated into one finding.
    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain('APP_SECRET');
    expect(issues[0].description).not.toContain('TMPDIR');
  });
});
