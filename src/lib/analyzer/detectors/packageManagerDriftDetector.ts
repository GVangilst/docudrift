import type {
  DocClaim,
  DriftIssue,
  PackageCommandClaim,
  PackageManager,
  TruthModel,
} from '../types';

const DETECTOR_ID = 'package-manager-drift';

/** Rewrites a command to a target manager by swapping the leading manager token. */
function suggestCommand(command: string, target: PackageManager): string {
  const parts = command.trim().split(/\s+/);
  if (parts.length === 0) return `${target} install`;
  parts[0] = target;
  return parts.join(' ');
}

/**
 * Flags README package-manager commands that disagree with the repo's lockfile.
 *
 * - README uses a manager other than the single lockfile's manager → warning.
 * - Multiple lockfiles (ambiguous manager) → info (drift not asserted).
 * - No lockfile → nothing (can't tell which manager is authoritative).
 *
 * README lines that offer alternatives (e.g. "npm, yarn, or pnpm install")
 * mention several managers at once and are not treated as a commitment.
 */
export function packageManagerDriftDetector(
  claims: DocClaim[],
  truth: TruthModel,
): DriftIssue[] {
  const commandClaims = claims.filter(
    (claim): claim is PackageCommandClaim => claim.kind === 'command',
  );

  // Managers named on each README line — a line naming ≥2 is "offering
  // alternatives" and is excluded from what the README commits to. Besides the
  // parsed command's manager, we also count managers merely *named* on the line
  // (e.g. `npm i # or yarn or pnpm`), so a comment listing alternatives counts.
  const managersByLine = new Map<string, Set<PackageManager>>();
  for (const claim of commandClaims) {
    const key = `${claim.source.file}:${claim.source.line}`;
    const set = managersByLine.get(key) ?? new Set<PackageManager>();
    set.add(claim.packageManager);
    for (const m of claim.source.snippet.matchAll(/\b(npm|yarn|pnpm|bun)\b/gi)) {
      set.add(m[1].toLowerCase() as PackageManager);
    }
    managersByLine.set(key, set);
  }

  // Committed manager → first representative claim (for stable evidence).
  const committed = new Map<PackageManager, PackageCommandClaim>();
  for (const claim of commandClaims) {
    const key = `${claim.source.file}:${claim.source.line}`;
    if ((managersByLine.get(key)?.size ?? 0) >= 2) continue;
    if (!committed.has(claim.packageManager)) committed.set(claim.packageManager, claim);
  }

  const { lockfiles } = truth;
  if (lockfiles.length === 0) return []; // No lockfile → don't flag drift.

  const lockfileList = lockfiles.map((lock) => lock.file).join(', ');
  const managers = new Set(lockfiles.map((lock) => lock.manager));

  // Multiple managers' lockfiles → ambiguous; emit a low-severity warning only.
  if (managers.size > 1) {
    return [
      {
        id: `${DETECTOR_ID}:ambiguous-lockfiles`,
        detectorId: DETECTOR_ID,
        severity: 'info',
        title: `Multiple lockfiles present (${lockfileList})`,
        description: `The repo contains lockfiles for more than one package manager (${lockfileList}), so the authoritative manager is ambiguous and package-manager drift can't be determined with confidence.`,
        evidence: lockfiles.map((lock) => ({
          label: 'lockfile',
          file: lock.file,
          line: 1,
          snippet: lock.file,
        })),
        suggestedFix: `Keep a single lockfile for your chosen package manager and delete the others.`,
      },
    ];
  }

  const authoritative = [...managers][0];
  const authoritativeLockfile = lockfiles[0].file;

  // If the README documents the authoritative manager itself (e.g. "install with
  // your package manager of choice: npm / yarn / pnpm i" next to a pnpm lock), it
  // already gives users a correct path — the other managers are offered
  // alternatives, not drift. Only flag when the correct manager is absent.
  if (commandClaims.some((claim) => claim.packageManager === authoritative)) return [];

  const issues: DriftIssue[] = [];

  for (const [manager, claim] of committed) {
    if (manager === authoritative) continue;
    const suggestion = suggestCommand(claim.command, authoritative);
    issues.push({
      id: `${DETECTOR_ID}:${manager}-vs-${authoritative}`,
      detectorId: DETECTOR_ID,
      severity: 'warning',
      title: `README uses ${manager} but the repo's lockfile is ${authoritativeLockfile}`,
      description: `The README documents \`${claim.command}\` (${manager}), but the only lockfile is ${authoritativeLockfile}, which indicates a ${authoritative} project.`,
      evidence: [
        {
          label: 'README',
          file: claim.source.file,
          line: claim.source.line,
          snippet: claim.source.snippet,
        },
        {
          label: 'lockfile',
          file: authoritativeLockfile,
          line: 1,
          snippet: authoritativeLockfile,
        },
      ],
      suggestedFix: `Use the ${authoritative} equivalent, e.g. \`${suggestion}\`, or replace the lockfile with a ${manager} one if ${manager} is intended.`,
    });
  }

  return issues;
}
