import type { DriftSeverity } from '@/lib/analyzer/types';

const STYLES: Record<DriftSeverity, string> = {
  error: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
};

const LABELS: Record<DriftSeverity, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

export function SeverityBadge({ severity }: { severity: DriftSeverity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[severity]}`}
    >
      {LABELS[severity]}
    </span>
  );
}
