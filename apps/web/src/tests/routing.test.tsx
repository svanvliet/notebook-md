/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
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

describe('Router — Background location overlay pattern', () => {
  function OverlayRouter() {
    const location = useLocation();
    const bg = location.state?.backgroundLocation as Location | undefined;

    return (
      <>
        <Routes location={bg || location}>
          <Route path="/" element={<div data-testid="app">App Content</div>} />
          <Route path="/terms" element={<TermsPage />} />
        </Routes>
        {bg && (
          <Routes>
            <Route path="/terms" element={<div data-testid="overlay"><TermsPage /></div>} />
          </Routes>
        )}
      </>
    );
  }

  it('renders standalone legal page when accessed directly', () => {
    render(
      <MemoryRouter initialEntries={['/terms']}>
        <OverlayRouter />
      </MemoryRouter>,
    );
    // Should render TermsPage without the app underneath
    expect(screen.getByText('Terms of Service')).toBeDefined();
    expect(screen.queryByTestId('app')).toBeNull();
    expect(screen.queryByTestId('overlay')).toBeNull();
  });

  it('renders app + overlay when navigated with backgroundLocation', () => {
    const bgLocation = { pathname: '/', search: '', hash: '', state: null, key: 'default' };
    render(
      <MemoryRouter initialEntries={[{ pathname: '/terms', state: { backgroundLocation: bgLocation } }]}>
        <OverlayRouter />
      </MemoryRouter>,
    );
    // App should be mounted at background location
    expect(screen.getByTestId('app')).toBeDefined();
    // Overlay should show terms
    expect(screen.getByTestId('overlay')).toBeDefined();
    expect(screen.getByText('Terms of Service')).toBeDefined();
  });
});
