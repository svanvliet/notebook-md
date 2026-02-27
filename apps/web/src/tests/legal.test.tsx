/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback,
  }),
}));

describe('Legal pages AI disclosures', () => {
  it('Privacy page mentions AI / Azure OpenAI', async () => {
    const { PrivacyPage } = await import('../components/legal/PrivacyPage');
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>);
    expect(screen.getByText(/AI Content Generation/)).toBeTruthy();
    expect(screen.getByText(/Azure OpenAI API/)).toBeTruthy();
  });

  it('Terms page mentions AI-generated content', async () => {
    const { TermsPage } = await import('../components/legal/TermsPage');
    render(<MemoryRouter><TermsPage /></MemoryRouter>);
    expect(screen.getByText(/AI Content Generation/)).toBeTruthy();
    expect(screen.getByText(/AI-generated content is provided "as is"/)).toBeTruthy();
  });
});
