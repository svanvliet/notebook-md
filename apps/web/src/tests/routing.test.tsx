/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TermsPage } from '../components/legal/TermsPage';
import { PrivacyPage } from '../components/legal/PrivacyPage';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('Router — Legal Pages', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders TermsPage at /terms', () => {
    render(
      <MemoryRouter initialEntries={['/terms']}>
        <Routes>
          <Route path="/terms" element={<TermsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Terms of Service')).toBeDefined();
    expect(screen.getByText('1. Acceptance of Terms')).toBeDefined();
  });

  it('renders PrivacyPage at /privacy', () => {
    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <Routes>
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Privacy Policy')).toBeDefined();
    expect(screen.getByText('1. Overview')).toBeDefined();
  });

  it('TermsPage back button calls navigate(-1)', () => {
    render(
      <MemoryRouter initialEntries={['/terms']}>
        <Routes>
          <Route path="/terms" element={<TermsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('← Back to Notebook.md'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('PrivacyPage back button calls navigate(-1)', () => {
    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <Routes>
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('← Back to Notebook.md'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
});

describe('Router — Catch-all', () => {
  it('redirects unknown paths to Not Found fallback', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/nonexistent']}>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<div>Not Found</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain('Not Found');
  });
});

describe('Router — StatusBar links', () => {
  it('renders Terms and Privacy router links', async () => {
    const { StatusBar } = await import('../components/layout/StatusBar');
    render(
      <MemoryRouter>
        <StatusBar wordCount={10} charCount={50} lastSaved={null} message={null} />
      </MemoryRouter>,
    );
    const termsLink = screen.getByText('Terms');
    const privacyLink = screen.getByText('Privacy');
    expect(termsLink.getAttribute('href')).toBe('/terms');
    expect(privacyLink.getAttribute('href')).toBe('/privacy');
  });
});
