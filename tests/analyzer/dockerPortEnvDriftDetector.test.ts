import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '@/lib/analyzer/analyzeRepository';
import type { DriftIssue } from '@/lib/analyzer/types';
import { loadFixtureRepo } from '../helpers/loadFixtureRepo';

function dockerIssues(name: string): DriftIssue[] {
  return analyzeRepository(loadFixtureRepo(name)).filter(
    (issue) => issue.detectorId === 'docker-drift',
  );
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

  it('does not flag when docker run -p container port matches a compose port mapping', () => {
    expect(dockerIssues('docker-port-compose-ok')).toHaveLength(0);
  });

  it('does not flag port drift when the repo exposes no ports at all', () => {
    expect(dockerIssues('docker-port-no-evidence')).toHaveLength(0);
  });
});

describe('dockerDriftDetector — env drift', () => {
  it('flags a compose-required env var that is undocumented and not in .env.example (medium)', () => {
    const issues = dockerIssues('docker-env-required');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].title).toContain('DATABASE_URL');
  });

  it('does not flag a compose-required env var that the README documents', () => {
    expect(dockerIssues('docker-env-documented')).toHaveLength(0);
  });

  it('does not flag a compose-required env var that is present in .env.example', () => {
    expect(dockerIssues('docker-env-in-example')).toHaveLength(0);
  });
});
