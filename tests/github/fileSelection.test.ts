import { describe, expect, it } from 'vitest';
import { selectKeyFiles } from '@/lib/github/fileSelection';

describe('selectKeyFiles', () => {
  it('selects only key structured/doc files, never arbitrary source', () => {
    const selected = selectKeyFiles([
      { path: 'package.json', type: 'blob', size: 20 },
      { path: 'README.md', type: 'blob', size: 40 },
      { path: 'pnpm-lock.yaml', type: 'blob', size: 500 },
      { path: '.env.example', type: 'blob', size: 10 },
      { path: 'docker-compose.yml', type: 'blob', size: 60 },
      { path: 'Dockerfile', type: 'blob', size: 60 },
      { path: 'src/index.ts', type: 'blob', size: 100 }, // arbitrary source — not needed
      { path: 'apps/web/app/page.tsx', type: 'blob', size: 100 },
      { path: 'docs', type: 'tree' },
    ]);

    expect(selected.sort()).toEqual(
      ['.env.example', 'Dockerfile', 'README.md', 'docker-compose.yml', 'package.json', 'pnpm-lock.yaml'].sort(),
    );
    // Arbitrary source content is never fetched (no detector reads it).
    expect(selected).not.toContain('src/index.ts');
    expect(selected).not.toContain('apps/web/app/page.tsx');
  });
});
