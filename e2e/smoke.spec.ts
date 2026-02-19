import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('welcome screen loads with sign-in and sign-up buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Notebook.md')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible();
  });

  test('sign-up with email and password', async ({ page }) => {
    const email = `smoke-${Date.now()}@test.local`;
    await page.goto('/');

    // Click Sign Up to show the form
    await page.getByRole('button', { name: 'Sign Up' }).click();

    // Fill sign-up form
    await page.getByPlaceholder('Email address').fill(email);
    await page.getByPlaceholder('Password (min 8 characters)').fill('TestPass123!');

    await page.getByRole('button', { name: 'Create Account' }).click();

    // Should land in the app — welcome screen buttons gone
    await expect(page.getByRole('button', { name: 'Sign Up' })).not.toBeVisible({ timeout: 10_000 });
  });

  test('sign-out returns to welcome screen', async ({ page }) => {
    const email = `smoke-signout-${Date.now()}@test.local`;
    await page.goto('/');

    // Sign up first
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await page.getByPlaceholder('Email address').fill(email);
    await page.getByPlaceholder('Password (min 8 characters)').fill('TestPass123!');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByRole('button', { name: 'Sign Up' })).not.toBeVisible({ timeout: 10_000 });

    // Sign out via account dropdown
    await page.getByRole('button', { name: 'Account Settings' }).click();
    await page.getByText('Sign Out').click();

    // Should return to welcome screen
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible({ timeout: 5_000 });
  });

  test('sign-in with existing account', async ({ page, request }) => {
    const email = `smoke-signin-${Date.now()}@test.local`;
    const password = 'TestPass123!';

    // Create account via API
    await request.post('/auth/signup', {
      data: { email, password },
    });

    // Now sign in via UI
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.getByPlaceholder('Email address').fill(email);
    await page.getByPlaceholder('Password').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should land in the app
    await expect(page.getByRole('button', { name: 'Sign Up' })).not.toBeVisible({ timeout: 10_000 });
  });

  test('terms page is accessible', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByText(/Van Vliet Ventures/).first()).toBeVisible();
  });

  test('privacy page is accessible', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    await expect(page.getByText(/Van Vliet Ventures/).first()).toBeVisible();
  });

  test('cookie consent banner appears for new visitors', async ({ page, context }) => {
    // Clear all cookies to simulate new visitor
    await context.clearCookies();
    await page.goto('/');

    // Cookie consent banner should appear
    await expect(page.getByText(/We use cookies/i)).toBeVisible({ timeout: 5_000 });

    // Accept button should be present
    await expect(page.getByRole('button', { name: 'Accept All' })).toBeVisible();
  });
});
