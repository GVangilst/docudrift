import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '@/lib/analyzer/analyzeRepository';
import type { RepoSnapshot } from '@/lib/analyzer/types';
import { loadFixtureRepo } from '../helpers/loadFixtureRepo';

function fileRefIssues(snapshot: RepoSnapshot) {
  return analyzeRepository(snapshot).filter((i) => i.detectorId === 'file-reference-drift');
}

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

  it('checks references against the full tree (allPaths), not just fetched files', () => {
    // docs/guide.md exists in the repo but its content was not fetched — it must
    // still count as present via allPaths.
    const withTree: RepoSnapshot = {
      repo: { owner: 'o', name: 'r' },
      files: [
        { path: 'package.json', content: '{"name":"x"}' },
        { path: 'README.md', content: 'See the [guide](docs/guide.md).' },
      ],
      allPaths: ['package.json', 'README.md', 'docs/guide.md'],
    };
    expect(fileRefIssues(withTree)).toHaveLength(0);

    // Without the tree, the un-fetched file looks missing — proving allPaths is
    // what fixes the false positive.
    const withoutTree: RepoSnapshot = { repo: withTree.repo, files: withTree.files };
    expect(fileRefIssues(withoutTree)).toHaveLength(1);
  });

  it('ignores paths inside code blocks but flags a real prose link', () => {
    // require()/import paths and Dockerfile COPY/CMD paths are code, not doc
    // references; only the prose markdown link to a missing file fires.
    const issues = analyzeRepository(loadFixtureRepo('file-ref-code-block')).filter(
      (i) => i.detectorId === 'file-reference-drift',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('docs/CONTRIBUTING.md');
  });

  it('does not treat URL-encoded badge fragments as file paths', () => {
    // `%40scope/server.svg` inside a shields.io URL must not become `40scope/server.svg`.
    const issues = analyzeRepository(loadFixtureRepo('file-ref-badge-url')).filter(
      (i) => i.detectorId === 'file-reference-drift',
    );
    expect(issues).toHaveLength(0);
  });
});
