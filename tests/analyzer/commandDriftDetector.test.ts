import { describe, expect, it } from 'vitest';
import { analyzeRepository } from '@/lib/analyzer/analyzeRepository';
import { loadFixtureRepo } from '../helpers/loadFixtureRepo';

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
});
