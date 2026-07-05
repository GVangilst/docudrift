/** Classic Levenshtein edit distance between two strings. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);

  for (let i = 1; i <= m; i++) {
    const curr = [i, ...new Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }

  return prev[n];
}

/**
 * Returns the candidate closest to `target` by edit distance, or null when
 * `candidates` is empty. Ties resolve to the first candidate encountered.
 */
export function closestMatch(
  target: string,
  candidates: string[],
): { value: string; distance: number } | null {
  let best: { value: string; distance: number } | null = null;

  for (const candidate of candidates) {
    const distance = levenshtein(target, candidate);
    if (best === null || distance < best.distance) {
      best = { value: candidate, distance };
    }
  }

  return best;
}
