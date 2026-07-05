import fs from 'node:fs';
import path from 'node:path';
import type { RepoFile, RepoSnapshot } from '@/lib/analyzer/types';

const FIXTURES_ROOT = path.resolve(__dirname, '../fixtures/repos');

function walk(dir: string, baseDir: string): RepoFile[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: RepoFile[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(absolutePath, baseDir));
      continue;
    }

    if (!entry.isFile()) continue;

    files.push({
      path: path.relative(baseDir, absolutePath).split(path.sep).join('/'),
      content: fs.readFileSync(absolutePath, 'utf8'),
    });
  }

  return files;
}

/** Loads a fixture directory under tests/fixtures/repos/<name> as a RepoSnapshot. */
export function loadFixtureRepo(name: string): RepoSnapshot {
  const repoDir = path.join(FIXTURES_ROOT, name);
  return {
    repo: { owner: 'fixtures', name },
    files: walk(repoDir, repoDir),
  };
}
