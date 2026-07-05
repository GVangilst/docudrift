import { describe, expect, it } from 'vitest';
import { parseRepoUrl } from '@/lib/github/parseRepoUrl';
import { ScanError } from '@/lib/github/errors';

describe('parseRepoUrl', () => {
  it.each([
    ['https://github.com/owner/repo', 'owner', 'repo'],
    ['https://github.com/owner/repo/', 'owner', 'repo'],
    ['https://github.com/owner/repo.git', 'owner', 'repo'],
    ['http://www.github.com/owner/repo', 'owner', 'repo'],
    ['github.com/owner/repo', 'owner', 'repo'],
    ['https://github.com/owner/repo/tree/main', 'owner', 'repo'],
    ['https://github.com/owner/my.repo-name', 'owner', 'my.repo-name'],
  ])('parses %s', (input, owner, repo) => {
    expect(parseRepoUrl(input)).toEqual({ owner, repo });
  });

  it.each([
    'https://gitlab.com/owner/repo',
    'https://github.com/owner',
    'not a url',
    'https://example.com/github.com/owner/repo',
    '',
  ])('rejects %s with INVALID_URL', (input) => {
    expect(() => parseRepoUrl(input)).toThrowError(ScanError);
    try {
      parseRepoUrl(input);
    } catch (error) {
      expect((error as ScanError).code).toBe('INVALID_URL');
    }
  });
});
