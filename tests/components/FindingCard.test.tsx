// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FindingCard } from '@/components/FindingCard';
import { sampleReport } from '../fixtures/report';

afterEach(cleanup);

describe('FindingCard', () => {
  it('copies the suggested fix to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const finding = sampleReport.findings[0];
    render(<FindingCard finding={finding} />);

    fireEvent.click(screen.getByText(/README references/));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(finding.suggestedFix));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });
});
