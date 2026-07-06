// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReportView } from '@/components/ReportView';
import { emptyReport, sampleReport } from '../fixtures/report';

afterEach(cleanup);

describe('ReportView', () => {
  it('renders the repo header, summary counts, and finding titles', () => {
    render(<ReportView report={sampleReport} onRescan={() => {}} />);

    expect(screen.getByText('acme/widget')).toBeInTheDocument();
    expect(screen.getByText(/abcdef1/)).toBeInTheDocument();
    expect(screen.getByText(/npm run build/)).toBeInTheDocument();
    expect(screen.getByText(/AUTH_SECRET/)).toBeInTheDocument();
  });

  it('expands a finding to reveal evidence and the suggested fix', () => {
    render(<ReportView report={sampleReport} onRescan={() => {}} />);

    expect(screen.queryByText('Suggested fix')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/README references/));

    expect(screen.getByText('Suggested fix')).toBeInTheDocument();
    expect(screen.getByText('README.md:14')).toBeInTheDocument();
  });

  it('filters findings when a severity chip is toggled off', () => {
    render(<ReportView report={sampleReport} onRescan={() => {}} />);

    // Toggle "error" off — the error finding should disappear.
    fireEvent.click(screen.getByRole('button', { name: /error \(1\)/i }));
    expect(screen.queryByText(/README references/)).not.toBeInTheDocument();
    expect(screen.getByText(/is in .env.example/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no findings', () => {
    render(<ReportView report={emptyReport} onRescan={() => {}} />);
    expect(screen.getByText(/No drift detected/)).toBeInTheDocument();
  });
});
