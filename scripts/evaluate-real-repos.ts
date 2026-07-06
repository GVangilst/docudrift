/**
 * Real-repo evaluation harness.
 *
 * Drives the production pipeline (`fetchRepoSnapshot` → `analyzeRepository`)
 * against a fixed corpus of public repos and prints a report. It is purely
 * static: it fetches file *text* over HTTPS and runs the deterministic
 * detectors. It never executes scanned-repo code, never installs dependencies,
 * and never runs npm/pnpm/yarn/bun/Docker.
 *
 * Usage: `npm run evaluate:repos` (reads GITHUB_TOKEN from .env for rate limit).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeRepository } from '../src/lib/analyzer/analyzeRepository';
import type { DriftSeverity } from '../src/lib/analyzer/types';
import { ScanError } from '../src/lib/github/errors';
import { fetchRepoSnapshot } from '../src/lib/github/fetchRepoSnapshot';

const REPOS = [
  'adminmart/Modernize-Nextjs-Free',
  'langfuse/langfuse-js',
  'open-spaced-repetition/ts-fsrs',
  'nuxt-modules/apollo',
  'jihe520/mindpocket',
  'sumitkolhe/jiosaavn-api',
  'bettergovph/bettergov',
  'Klerith/nest-teslo-shop',
  'solidjs/templates',
  'sakitam-fdd/wind-layer',
  'rpuls/medusajs-2.0-for-railway-boilerplate',
];

type Counts = Record<DriftSeverity, number>;

type Finding = {
  severity: DriftSeverity;
  detectorId: string;
  title: string;
  evidence: string;
  suggestedFix: string;
};

type Result =
  | {
      repo: string;
      status: 'ok';
      commitSha: string;
      truncated: boolean;
      fetchedFiles: number;
      total: number;
      counts: Counts;
      issueTypes: Record<string, number>;
      score: number;
      findings: Finding[];
    }
  | { repo: string; status: 'error'; code: string; message: string };

/** Heuristic "cleanliness" score (100 = no findings). NOT an accuracy measure. */
function cleanlinessScore(counts: Counts): number {
  return Math.max(0, Math.min(100, 100 - 15 * counts.error - 5 * counts.warning - 2 * counts.info));
}

async function evaluate(repo: string): Promise<Result> {
  const [owner, name] = repo.split('/');
  try {
    const fetched = await fetchRepoSnapshot(owner, name);
    const issues = analyzeRepository(fetched.snapshot);

    const counts: Counts = { error: 0, warning: 0, info: 0 };
    const issueTypes: Record<string, number> = {};
    for (const issue of issues) {
      counts[issue.severity] += 1;
      issueTypes[issue.detectorId] = (issueTypes[issue.detectorId] ?? 0) + 1;
    }

    return {
      repo,
      status: 'ok',
      commitSha: fetched.commitSha.slice(0, 7),
      truncated: fetched.truncated,
      fetchedFiles: fetched.snapshot.files.length,
      total: issues.length,
      counts,
      issueTypes,
      score: cleanlinessScore(counts),
      findings: issues.map((issue) => ({
        severity: issue.severity,
        detectorId: issue.detectorId,
        title: issue.title,
        evidence: issue.evidence[0] ? `${issue.evidence[0].file}:${issue.evidence[0].line}` : '',
        suggestedFix: issue.suggestedFix,
      })),
    };
  } catch (error) {
    if (error instanceof ScanError) {
      return { repo, status: 'error', code: error.code, message: error.message };
    }
    return { repo, status: 'error', code: 'UNKNOWN', message: (error as Error).message };
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  // Optionally scan a subset passed as CLI args; otherwise the full corpus.
  const repos = process.argv.slice(2).length ? process.argv.slice(2) : REPOS;
  // Space requests out to avoid GitHub's secondary (abuse) rate limit.
  const delayMs = Number(process.env.EVAL_DELAY_MS ?? 2000);

  const results: Result[] = [];
  for (const repo of repos) {
    process.stderr.write(`Scanning ${repo} ...\n`);
    results.push(await evaluate(repo));
    await sleep(delayMs);
  }

  console.log('\n| repo | status | score | total | high | med | low | issue types |');
  console.log('|------|--------|-------|-------|------|-----|-----|-------------|');
  for (const r of results) {
    if (r.status === 'error') {
      console.log(`| ${r.repo} | ERR ${r.code} | – | – | – | – | – | ${r.message} |`);
      continue;
    }
    const types = Object.entries(r.issueTypes)
      .map(([id, n]) => `${id}:${n}`)
      .join(', ') || '—';
    const status = r.truncated ? 'ok (truncated)' : 'ok';
    console.log(
      `| ${r.repo} | ${status} | ${r.score} | ${r.total} | ${r.counts.error} | ${r.counts.warning} | ${r.counts.info} | ${types} |`,
    );
  }

  for (const r of results) {
    if (r.status !== 'ok') continue;
    const head = `${r.repo} @ ${r.commitSha} — ${r.fetchedFiles} files${r.truncated ? ' (TRUNCATED)' : ''}`;
    console.log(`\n### ${head}`);
    if (r.findings.length === 0) {
      console.log('  (no findings)');
      continue;
    }
    for (const f of r.findings) {
      console.log(`  [${f.severity}] ${f.detectorId} <${f.evidence}> :: ${f.title}`);
      console.log(`      fix: ${f.suggestedFix}`);
    }
  }

  const out = process.env.CLAUDE_JOB_DIR
    ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp', 'eval-results.json')
    : path.join(process.cwd(), 'eval-results.json');
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  process.stderr.write(`\nWrote ${out}\n`);
}

void main();
