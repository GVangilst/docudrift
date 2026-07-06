import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '@/lib/analyzer/analyzeRepository';
import type { RepoSnapshot } from '@/lib/analyzer/types';
import { loadFixtureRepo } from '../helpers/loadFixtureRepo';

function commandIssues(snapshot: RepoSnapshot) {
  return analyzeRepository(snapshot).filter((i) => i.detectorId === 'command-drift');
}

describe('commandDriftDetector', () => {
  it('flags npm run <script> when the script is missing from package.json', () => {
    const snapshot = loadFixtureRepo('missing-run-script');
    const issues = analyzeRepository(snapshot);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ detectorId: 'command-drift', severity: 'error' });
    expect(issues[0].description).toContain('"build"');
    expect(issues[0].evidence[0]).toMatchObject({ file: 'README.md', line: 14 });
  });

  it('flags npm start when scripts.start is missing and there is no root server.js', () => {
    const snapshot = loadFixtureRepo('missing-start-no-server');
    const issues = analyzeRepository(snapshot);

    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain('"start"');
    expect(issues[0].description).toContain('no root server.js was found');
  });

  it('does not flag npm start when scripts.start is missing but a root server.js exists', () => {
    const snapshot = loadFixtureRepo('missing-start-with-server');
    const issues = analyzeRepository(snapshot);

    expect(issues).toHaveLength(0);
  });

  it('flags npm test when scripts.test is missing', () => {
    const snapshot = loadFixtureRepo('missing-test-script');
    const issues = analyzeRepository(snapshot);

    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain('"test"');
  });

  it('reports no drift when every documented script actually exists', () => {
    const snapshot = loadFixtureRepo('clean');
    const issues = analyzeRepository(snapshot);

    expect(issues).toHaveLength(0);
  });

  it('does not flag npm commands run in a generated app dir (cd into another dir)', () => {
    // Mirrors express: generate an app, `cd /tmp/foo`, then `npm start`.
    const issues = analyzeRepository(loadFixtureRepo('command-generator-app'));
    expect(issues.filter((i) => i.detectorId === 'command-drift')).toHaveLength(0);
  });

  it('still flags commands after `cd <repo>` (cloning into the repo itself)', () => {
    const snapshot: RepoSnapshot = {
      repo: { owner: 'o', name: 'myapp' },
      files: [
        { path: 'package.json', content: '{"name":"myapp"}' },
        {
          path: 'README.md',
          content: '# myapp\n\n```bash\ngit clone x && cd myapp\nnpm run build\n```\n',
        },
      ],
      allPaths: ['package.json', 'README.md'],
    };
    const issues = commandIssues(snapshot);
    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain('"build"');
  });

  it('does not flag commands after `cd` into a non-repo directory', () => {
    const snapshot: RepoSnapshot = {
      repo: { owner: 'o', name: 'myapp' },
      files: [
        { path: 'package.json', content: '{"name":"myapp"}' },
        {
          path: 'README.md',
          content: '# myapp\n\n```bash\ncd /tmp/other\nnpm run build\n```\n',
        },
      ],
      allPaths: ['package.json', 'README.md'],
    };
    expect(commandIssues(snapshot)).toHaveLength(0);
  });
});
