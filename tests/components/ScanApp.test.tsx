// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScanApp } from '@/components/ScanApp';
import { sampleReport } from '../fixtures/report';
import { fakeFetch, jsonResponse } from '../helpers/fakeFetch';

// ScanApp reads ?repo= via next/navigation; default to no params.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('ScanApp', () => {
  it('runs a scan and renders the report on submit', async () => {
    vi.stubGlobal('fetch', fakeFetch({ '/api/scans': jsonResponse(sampleReport) }));

    render(<ScanApp />);
    fireEvent.change(screen.getByLabelText(/GitHub repository URL/i), {
      target: { value: 'https://github.com/acme/widget' },
    });
    fireEvent.click(screen.getByRole('button', { name: /scan repo/i }));

    expect(await screen.findByText('acme/widget')).toBeInTheDocument();
    expect(screen.getByText(/README references/)).toBeInTheDocument();
  });

  it('renders an error banner when the API returns an error', async () => {
    vi.stubGlobal(
      'fetch',
      fakeFetch({
        '/api/scans': jsonResponse(
          { error: { code: 'REPO_NOT_FOUND', message: 'Repository not found, or it is private.' } },
          { status: 404 },
        ),
      }),
    );

    render(<ScanApp />);
    fireEvent.change(screen.getByLabelText(/GitHub repository URL/i), {
      target: { value: 'https://github.com/acme/missing' },
    });
    fireEvent.click(screen.getByRole('button', { name: /scan repo/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Repository not found'),
    );
  });
});
