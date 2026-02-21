// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StatusBar } from '../components/layout/StatusBar';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'editor.wordCount') return `${opts?.count ?? 0} words`;
      if (key === 'editor.charCount') return `${opts?.count ?? 0} characters`;
      if (key === 'editor.lastSaved') return `Saved ${opts?.time ?? ''}`;
      return key;
    },
  }),
}));

describe('StatusBar mobile responsive', () => {
  it('char count has hidden md:inline class for mobile hiding', () => {
    const { container } = render(
      <MemoryRouter>
        <StatusBar wordCount={42} charCount={200} lastSaved="12:00:00 PM" message={null} />
      </MemoryRouter>,
    );
    const charSpan = screen.getByText('200 characters');
    expect(charSpan.className).toContain('hidden');
    expect(charSpan.className).toContain('md:inline');
  });

  it('word count is always visible', () => {
    render(
      <MemoryRouter>
        <StatusBar wordCount={42} charCount={200} lastSaved="12:00:00 PM" message={null} />
      </MemoryRouter>,
    );
    const wordSpan = screen.getByText('42 words');
    // Should NOT have hidden class
    expect(wordSpan.className).not.toContain('hidden');
  });

  it('uses safe area inset padding', () => {
    const { container } = render(
      <MemoryRouter>
        <StatusBar wordCount={0} charCount={0} lastSaved={null} message={null} />
      </MemoryRouter>,
    );
    const footer = container.querySelector('footer');
    expect(footer?.className).toContain('pb-[env(safe-area-inset-bottom)]');
  });

  it('uses smaller text on mobile', () => {
    const { container } = render(
      <MemoryRouter>
        <StatusBar wordCount={0} charCount={0} lastSaved={null} message={null} />
      </MemoryRouter>,
    );
    const footer = container.querySelector('footer');
    expect(footer?.className).toContain('text-[10px]');
    expect(footer?.className).toContain('md:text-xs');
  });
});
