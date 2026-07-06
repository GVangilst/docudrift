'use client';

import { type FormEvent } from 'react';

type ScanFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (repoUrl: string) => void;
  loading: boolean;
};

export function ScanForm({ value, onChange, onSubmit, loading }: ScanFormProps) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xl flex-col gap-3 sm:flex-row">
      <label htmlFor="repoUrl" className="sr-only">
        Public GitHub repository URL
      </label>
      <input
        id="repoUrl"
        type="url"
        name="repoUrl"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading}
        placeholder="https://github.com/owner/repo"
        className="w-full rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none focus:border-gray-400 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
      <button
        type="submit"
        disabled={loading || value.trim() === ''}
        className="whitespace-nowrap rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
      >
        {loading ? 'Scanning…' : 'Scan repo'}
      </button>
    </form>
  );
}
