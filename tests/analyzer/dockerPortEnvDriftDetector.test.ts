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
