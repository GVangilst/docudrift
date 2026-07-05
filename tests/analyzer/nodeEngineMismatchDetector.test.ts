import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '@/lib/analyzer/analyzeRepository';
import type { DriftIssue } from '@/lib/analyzer/types';
import { loadFixtureRepo } from '../helpers/loadFixtureRepo';

function nodeIssues(name: string): DriftIssue[] {
  return analyzeRepository(loadFixtureRepo(name)).filter(
    (issue) => issue.detectorId === 'node-engine-mismatch',
  );
}

describe('nodeEngineMismatchDetector', () => {
  it('does not flag when README Node 18 satisfies engines.node >=18', () => {
    expect(nodeIssues('node-ok-18')).toHaveLength(0);
  });

  it('flags high severity when README Node 16 cannot satisfy engines.node >=20', () => {
    const issues = nodeIssues('node-16-vs-20');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].suggestedFix).toContain('>=20');
  });

  it('flags medium severity when README Node >=18 is less strict than engines.node >=20', () => {
    const issues = nodeIssues('node-gte18-vs-gte20');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('does not flag when README Node 20 matches the .nvmrc major (20.11.1)', () => {
    expect(nodeIssues('node-20-nvmrc-ok')).toHaveLength(0);
  });

  it('flags medium severity when README Node 18 conflicts with .nvmrc 20.11.1', () => {
    const issues = nodeIssues('node-18-vs-nvmrc20');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].suggestedFix).toContain('.nvmrc');
  });

  it('flags a repo config ambiguity when engines.node >=20 disagrees with .nvmrc 18', () => {
    const issues = nodeIssues('node-engines-vs-nvmrc');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].title).toContain('disagree');
  });

  it('does not flag when README nvm use 20 satisfies engines.node >=20', () => {
    expect(nodeIssues('node-nvmuse-ok')).toHaveLength(0);
  });

  it('does not treat a bare "Node" mention without a version as a claim', () => {
    expect(nodeIssues('node-no-version')).toHaveLength(0);
  });
});
