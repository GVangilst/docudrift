import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '@/lib/analyzer/analyzeRepository';
import { loadFixtureRepo } from '../helpers/loadFixtureRepo';

describe('fileReferenceDriftDetector', () => {
  it('flags a documented path that does not exist and suggests the closest match', () => {
    const snapshot = loadFixtureRepo('missing-file-ref');
    const issues = analyzeRepository(snapshot);

    const fileIssues = issues.filter((issue) => issue.detectorId === 'file-reference-drift');
    expect(fileIssues).toHaveLength(1);

    const issue = fileIssues[0];
    expect(issue.severity).toBe('warning'); // "medium" in the severity model
    expect(issue.title).toContain('src/App.jsx');
    expect(issue.description).toContain('src/App.jsx');
    // Closest-match suggestion should point at the real file.
    expect(issue.description).toContain('src/App.tsx');
    expect(issue.suggestedFix).toContain('src/App.tsx');
    // Evidence carries the source file and line number.
    expect(issue.evidence[0]).toMatchObject({ file: 'README.md', line: 5 });
  });

  it('does not flag a documented path that exists', () => {
    const snapshot = loadFixtureRepo('existing-file-ref');
    const issues = analyzeRepository(snapshot);

    expect(issues.filter((issue) => issue.detectorId === 'file-reference-drift')).toHaveLength(0);
  });

  it('does not treat a URL as a file path', () => {
    const snapshot = loadFixtureRepo('url-not-file');
    const issues = analyzeRepository(snapshot);

    expect(issues.filter((issue) => issue.detectorId === 'file-reference-drift')).toHaveLength(0);
  });

  it('does not treat technology names like Node.js / Vue.js as file paths', () => {
    const snapshot = loadFixtureRepo('tech-name-not-file');
    const issues = analyzeRepository(snapshot);

    expect(issues.filter((issue) => issue.detectorId === 'file-reference-drift')).toHaveLength(0);
  });
});
