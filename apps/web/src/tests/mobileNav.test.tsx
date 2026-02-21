// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketingNav } from '../components/marketing/MarketingLayout';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderNav(props: { onEnterDemo?: () => void; onDevLogin?: () => void } = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <MarketingNav {...props} />
    </MemoryRouter>,
  );
}

describe('MarketingNav mobile', () => {
  it('renders hamburger button on mobile (md:hidden class)', () => {
    renderNav();
    const hamburger = screen.getByRole('button', { name: 'Open menu' });
    expect(hamburger).toBeDefined();
    // It should have the md:hidden class
    expect(hamburger.className).toContain('md:hidden');
  });

  it('desktop nav links have hidden md:flex class', () => {
    renderNav();
    // Desktop nav container should be hidden on mobile
    const features = screen.getByRole('link', { name: 'Features' });
    const desktopNav = features.parentElement!;
    expect(desktopNav.className).toContain('hidden');
    expect(desktopNav.className).toContain('md:flex');
  });

  it('opens mobile menu on hamburger click', () => {
    renderNav();
    const hamburger = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(hamburger);

    // Close button should now be visible
    const closeBtn = screen.getByRole('button', { name: 'Close menu' });
    expect(closeBtn).toBeDefined();

    // Mobile menu links should be visible (there are two sets: desktop + mobile)
    const featureLinks = screen.getAllByText('Features');
    expect(featureLinks.length).toBeGreaterThanOrEqual(2);
  });

  it('closes mobile menu on close button click', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    // Menu is open
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeDefined();

    // Close it
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));

    // Should be back to open menu button
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeDefined();
  });

  it('closes mobile menu on Escape key', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeDefined();
  });

  it('calls onEnterDemo from mobile menu', () => {
    const onEnterDemo = vi.fn();
    renderNav({ onEnterDemo });

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    // Find the mobile Try Demo button (there are two — desktop and mobile)
    const tryDemos = screen.getAllByText('Try Demo');
    const mobileTryDemo = tryDemos.find(el => el.closest('[class*="md:hidden"]'));
    expect(mobileTryDemo).toBeDefined();
    fireEvent.click(mobileTryDemo!);
    expect(onEnterDemo).toHaveBeenCalled();
  });

  it('mobile Sign In button is present in mobile menu', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    // Mobile menu should have a Sign In button
    const signInButtons = screen.getAllByText('Sign In');
    expect(signInButtons.length).toBeGreaterThanOrEqual(2); // desktop + mobile
  });
});
