import { test, expect, devices } from '@playwright/test';

const iPhone = devices['iPhone 14'];
const mobileConfig = { viewport: iPhone.viewport, userAgent: iPhone.userAgent, isMobile: true, hasTouch: true };

test.describe('Mobile Navigation', () => {
  test.use(mobileConfig);

  test('hamburger menu is visible on mobile', async ({ page }) => {
    await page.goto('/');
    const hamburger = page.getByRole('button', { name: 'Open menu' });
    await expect(hamburger).toBeVisible();

    // Desktop nav links should NOT be visible
    const desktopNav = page.locator('nav .hidden.md\\:flex');
    await expect(desktopNav).not.toBeVisible();
  });

  test('hamburger menu opens and shows all nav items', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();

    // Mobile menu items should be visible
    const mobileMenu = page.locator('nav .md\\:hidden').last();
    await expect(mobileMenu.getByText('Features')).toBeVisible();
    await expect(mobileMenu.getByText('About')).toBeVisible();
    await expect(mobileMenu.getByText('Contact')).toBeVisible();
    await expect(mobileMenu.getByText('Try Demo')).toBeVisible();
    await expect(mobileMenu.getByText('Sign In')).toBeVisible();
  });

  test('hamburger menu closes on link click', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();

    // Click Features link in mobile menu
    const mobileMenu = page.locator('nav .md\\:hidden').last();
    await mobileMenu.getByText('Features').click();

    // Should navigate and close menu
    await expect(page).toHaveURL(/\/features/);
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  });

  test('hamburger menu closes on close button', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible();

    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  });

  test('hamburger menu closes on backdrop click', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();

    // Click the backdrop (the semi-transparent overlay)
    const backdrop = page.locator('.fixed.inset-0.bg-black\\/20');
    if (await backdrop.isVisible()) {
      await backdrop.click({ position: { x: 10, y: 300 } });
      await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    }
  });
});

test.describe('Mobile Content Pages', () => {
  test.use(mobileConfig);

  test('features page renders correctly on mobile', async ({ page }) => {
    await page.goto('/features');
    await expect(page.getByRole('heading', { name: /Features/i }).first()).toBeVisible();
    // Hamburger should be visible
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  });

  test('about page renders correctly on mobile', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: /About/i }).first()).toBeVisible();
  });

  test('contact page renders correctly on mobile', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: /Contact/i }).first()).toBeVisible();
  });
});

test.describe('Desktop Navigation (no regression)', () => {
  test('desktop nav links are visible at default viewport', async ({ page }) => {
    await page.goto('/');
    // Default viewport is 1280x720 in Playwright
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Features' })).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'About' })).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Contact' })).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('button', { name: 'Sign In' })).toBeVisible();

    // Hamburger should NOT be visible
    const hamburger = page.getByRole('button', { name: 'Open menu' });
    await expect(hamburger).not.toBeVisible();
  });
});

test.describe('Mobile Welcome Screen', () => {
  test.use(mobileConfig);

  test('sign-in form is accessible on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Notebook.md' })).toBeVisible();
    // Sign Up button should be visible (it's in the main content, not nav)
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
  });

  test('cookie consent banner is visible on mobile', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    await expect(page.getByText(/We use cookies/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Accept All' })).toBeVisible();
  });
});
