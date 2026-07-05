import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '@/lib/analyzer/analyzeRepository';
import type { DriftIssue } from '@/lib/analyzer/types';
import { loadFixtureRepo } from '../helpers/loadFixtureRepo';

function dockerIssues(name: string): DriftIssue[] {
  return analyzeRepository(loadFixtureRepo(name)).filter(
    (issue) => issue.detectorId === 'docker-drift',
  );
}

describe('dockerDriftDetector', () => {
  it('does not flag docker build when a Dockerfile exists', () => {
    expect(dockerIssues('docker-build-ok')).toHaveLength(0);
  });

  it('flags docker build when no Dockerfile exists (high)', () => {
    const issues = dockerIssues('docker-build-missing');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].suggestedFix).toContain('Dockerfile');
  });

  it('flags docker build -f Dockerfile.dev when that file is missing (high)', () => {
    const issues = dockerIssues('docker-buildf-missing');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].title).toContain('Dockerfile.dev');
    // A plain Dockerfile exists, so the fix suggests using it.
    expect(issues[0].suggestedFix).toContain('Dockerfile');
  });

  it('does not flag docker build -f Dockerfile.dev when that file exists', () => {
    expect(dockerIssues('docker-buildf-ok')).toHaveLength(0);
  });

  it('does not flag docker compose up when docker-compose.yml exists', () => {
    expect(dockerIssues('docker-compose-ok')).toHaveLength(0);
  });

  it('does not flag docker-compose up when compose.yml exists', () => {
    expect(dockerIssues('docker-compose-alt-ok')).toHaveLength(0);
  });

  it('flags docker compose up when no compose file exists (high)', () => {
    const issues = dockerIssues('docker-compose-missing');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].title).toContain('Compose');
  });

  it('does not flag when a Dockerfile exists but the README never mentions Docker', () => {
    expect(dockerIssues('docker-file-no-mention')).toHaveLength(0);
  });

  it('does not flag when the README only lists Docker Desktop as a prerequisite', () => {
    expect(dockerIssues('docker-desktop-prereq')).toHaveLength(0);
  });

  it('does not treat a docker.com URL as a docker command', () => {
    expect(dockerIssues('docker-url-only')).toHaveLength(0);
  });
});
