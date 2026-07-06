import type { DriftSeverity } from '@/lib/analyzer/types';

const DOT: Record<DriftSeverity, string> = {
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
};

const LABEL: Record<DriftSeverity, string> = {
  error: 'errors',
  warning: 'warnings',
  info: 'info',
};

export function SummaryBar({ summary }: { summary: Record<DriftSeverity, number> }) {
  const severities: DriftSeverity[] = ['error', 'warning', 'info'];
  return (
    <div className="flex flex-wrap gap-4 text-sm text-gray-700 dark:text-gray-300">
      {severities.map((severity) => (
        <span key={severity} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${DOT[severity]}`} aria-hidden />
          <span className="font-semibold">{summary[severity]}</span> {LABEL[severity]}
        </span>
      ))}
    </div>
  );
}
