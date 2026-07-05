export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          DocuDrift
        </h1>
        <p className="max-w-md text-gray-600 dark:text-gray-400">
          Paste a public GitHub repo URL. We check whether the docs still
          match the code and show you exactly where they don&apos;t.
        </p>
      </div>

      <form className="flex w-full max-w-xl flex-col gap-3 sm:flex-row">
        <input
          type="url"
          name="repoUrl"
          placeholder="https://github.com/owner/repo"
          className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <button
          type="submit"
          disabled
          className="whitespace-nowrap rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
        >
          Scan repo
        </button>
      </form>

      <p className="text-xs text-gray-500 dark:text-gray-500">
        Public JavaScript/TypeScript repositories only. Scanning isn&apos;t
        wired up yet.
      </p>
    </main>
  );
}
