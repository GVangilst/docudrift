import { Suspense } from 'react';
import { ScanApp } from '@/components/ScanApp';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-16 sm:py-24">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">DocuDrift</h1>
        <p className="max-w-md text-gray-600 dark:text-gray-400">
          Paste a public GitHub repo URL. We check whether the docs still match
          the code and show you exactly where they don&apos;t.
        </p>
      </div>

      <Suspense fallback={null}>
        <ScanApp />
      </Suspense>

      <p className="text-xs text-gray-500 dark:text-gray-500">
        Public JavaScript/TypeScript repositories only.
      </p>
    </main>
  );
}
