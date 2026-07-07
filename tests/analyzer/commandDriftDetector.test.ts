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

  it('does not flag npm commands mentioned only in prose, headings, or link-text', () => {
    // "avoid npm start" in a heading/link + "npm run build" in a sentence.
    const issues = commandIssues(loadFixtureRepo('command-prose-mention'));
    expect(issues).toHaveLength(0);
  });

  it('ignores npm commands in a Dockerfile snippet but flags a real shell one', () => {
    // `RUN npm run build` (```dockerfile) is ignored; `npm run start:prod`
    // (```bash) is a real missing-script claim.
    const issues = commandIssues(loadFixtureRepo('command-dockerfile-snippet'));
    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain('"start:prod"');
    expect(issues.some((i) => i.description.includes('"build"'))).toBe(false);
  });

  it('ignores placeholder script names in a "wrap your script like such" example', () => {
    // `myscript` is a stand-in, not a real script; `with:env` is real, so no drift.
    const snapshot: RepoSnapshot = {
      repo: { owner: 'o', name: 'myapp' },
      files: [
        { path: 'package.json', content: '{"name":"myapp","scripts":{"with:env":"dotenv --"}}' },
        {
          path: 'README.md',
          content: '# myapp\n\n```bash\nnpm run with:env -- npm run myscript\n```\n',
        },
      ],
      allPaths: ['package.json', 'README.md'],
    };
    expect(commandIssues(snapshot)).toHaveLength(0);
  });

  it('does not join adjacent inline-code spans into a bogus command', () => {
    // Documenting npm's own `npm run-script` synopsis: the `--` in a separate
    // inline-code span must not be read as the script name.
    const snapshot: RepoSnapshot = {
      repo: { owner: 'o', name: 'myapp' },
      files: [
        { path: 'package.json', content: '{"name":"myapp"}' },
        {
          path: 'README.md',
          content: '# myapp\n\nThe synopsis for `npm run-script` explicitly shows the `--` for this reason.\n',
        },
      ],
      allPaths: ['package.json', 'README.md'],
    };
    expect(commandIssues(snapshot)).toHaveLength(0);
  });

  it('ignores a backticked command inside a heading (a title, not an instruction)', () => {
    const snapshot: RepoSnapshot = {
      repo: { owner: 'o', name: 'myapp' },
      files: [
        { path: 'package.json', content: '{"name":"myapp"}' },
        { path: 'README.md', content: '# myapp\n\n## Bootstrap with node, avoid `npm start`\n' },
      ],
      allPaths: ['package.json', 'README.md'],
    };
    expect(commandIssues(snapshot)).toHaveLength(0);
  });
});
