'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { runScan, ScanFailed } from '@/lib/scanClient';
import type { ScanReport } from '@/lib/report';
import { ReportView } from './ReportView';
import { ScanForm } from './ScanForm';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; report: ScanReport }
  | { status: 'error'; message: string };

export function ScanApp() {
  const searchParams = useSearchParams();
  const [url, setUrl] = useState(() => searchParams.get('repo') ?? '');
  // Start in `loading` when auto-running from ?repo= so the effect below never
  // has to setState synchronously — its updates all land after the await.
  const [state, setState] = useState<State>(() =>
    searchParams.get('repo') ? { status: 'loading' } : { status: 'idle' },
  );
  const autoRan = useRef(false);

  // Runs the fetch and reports the result. All setState calls are post-await.
  const performScan = async (repoUrl: string) => {
    try {
      const report = await runScan(repoUrl);
      setState({ status: 'success', report });
    } catch (error) {
      const message =
        error instanceof ScanFailed ? error.message : 'The scan failed unexpectedly.';
      setState({ status: 'error', message });
    }
  };

  // Triggered by the form: flips to loading and reflects the URL for sharing.
  const scan = (repoUrl: string) => {
    setState({ status: 'loading' });
    window.history.replaceState(null, '', `/?repo=${encodeURIComponent(repoUrl)}`);
    void performScan(repoUrl);
  };

  // Auto-run once from ?repo= (input + loading state were seeded above).
  useEffect(() => {
    if (autoRan.current) return;
    const initial = searchParams.get('repo');
    if (initial) {
      autoRan.current = true;
      // Intentional on-mount fetch from the ?repo= param; updates are post-await.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void performScan(initial);
    }
  }, [searchParams]);

  const loading = state.status === 'loading';

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <ScanForm value={url} onChange={setUrl} onSubmit={scan} loading={loading} />

      {loading && (
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-gray-500" aria-hidden />
          Fetching the repo and checking for drift… this can take a few seconds.
        </div>
      )}

      {state.status === 'error' && (
        <div
          role="alert"
          className="w-full max-w-xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        >
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <ReportView report={state.report} onRescan={() => scan(url.trim())} />
      )}
    </div>
  );
}
