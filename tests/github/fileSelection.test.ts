import { describe, expect, it } from 'vitest';
import { selectKeyFiles } from '@/lib/github/fileSelection';

describe('selectKeyFiles', () => {
  it('selects key files and real source but excludes test/fixture files', () => {
    const selected = selectKeyFiles([
      { path: 'package.json', type: 'blob', size: 20 },
      { path: 'README.md', type: 'blob', size: 40 },
      { path: 'src/index.ts', type: 'blob', size: 100 },
      { path: 'tests/fixtures/demo/.env.example', type: 'blob', size: 10 },
      { path: 'tests/fixtures/demo/src/app.js', type: 'blob', size: 30 },
      { path: 'src/util.test.ts', type: 'blob', size: 30 },
      { path: 'docs', type: 'tree' },
    ]);

    expect(selected).toContain('package.json');
    expect(selected).toContain('README.md');
    expect(selected).toContain('src/index.ts');
    expect(selected).not.toContain('tests/fixtures/demo/.env.example');
    expect(selected).not.toContain('tests/fixtures/demo/src/app.js');
    expect(selected).not.toContain('src/util.test.ts');
  });
});
