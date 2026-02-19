import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('welcome screen loads with sign-up form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Notebook.md')).toBeVisible();
    await expect(page.getByPlaceholderText(/email/i)).toBeVisible();
    await expect(page.getByPlaceholderText(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign up|create account/i })).toBeVisible();
  });

  test('sign-up with email and password', async ({ page }) => {
    const email = `smoke-${Date.now()}@test.local`;
    await page.goto('/');

    // Fill sign-up form
    await page.getByPlaceholderText(/email/i).fill(email);
    await page.getByPlaceholderText(/password/i).first().fill('TestPass123!');

    // Look for confirm password field if present
    const confirmPassword = page.getByPlaceholderText(/confirm password/i);
    if (await confirmPassword.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmPassword.fill('TestPass123!');
    }

    await page.getByRole('button', { name: /sign up|create account/i }).click();

    // Should land in the app (toolbar or workspace pane visible)
    await expect(page.getByText(/notebook/i)).toBeVisible({ timeout: 10_000 });
    // Welcome screen should no longer be showing the sign-up form
    await expect(page.getByPlaceholderText(/email/i)).not.toBeVisible({ timeout: 5_000 });
  });

  test('sign-out returns to welcome screen', async ({ page }) => {
    const email = `smoke-signout-${Date.now()}@test.local`;
    await page.goto('/');

    // Sign up first
    await page.getByPlaceholderText(/email/i).fill(email);
    await page.getByPlaceholderText(/password/i).first().fill('TestPass123!');
    const confirmPassword = page.getByPlaceholderText(/confirm password/i);
    if (await confirmPassword.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmPassword.fill('TestPass123!');
    }
    await page.getByRole('button', { name: /sign up|create account/i }).click();
    await expect(page.getByPlaceholderText(/email/i)).not.toBeVisible({ timeout: 10_000 });

    // Sign out via account menu
    await page.getByRole('button', { name: /account|avatar|user/i }).click();
    await page.getByRole('menuitem', { name: /sign out|log out/i }).click();

    // Should return to welcome screen
    await expect(page.getByPlaceholderText(/email/i)).toBeVisible({ timeout: 5_000 });
  });

  test('sign-in with existing account', async ({ page, request }) => {
    const email = `smoke-signin-${Date.now()}@test.local`;
    const password = 'TestPass123!';

    // Create account via API
    await request.post('/auth/signup', {
      data: { email, password },
    });

    // Sign out (clear any session from signup)
    await request.post('/auth/signout');

    // Now sign in via UI
    await page.goto('/');

    // Switch to sign-in mode if needed
    const signInLink = page.getByText(/sign in|already have an account/i);
    if (await signInLink.isVisible({ timeout: 1000 }).catch(() => false)) {
      await signInLink.click();
    }

    await page.getByPlaceholderText(/email/i).fill(email);
    await page.getByPlaceholderText(/password/i).first().fill(password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    // Should land in the app
    await expect(page.getByPlaceholderText(/email/i)).not.toBeVisible({ timeout: 10_000 });
  });

  test('terms page is accessible', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByText(/terms of service/i)).toBeVisible();
    await expect(page.getByText(/van vliet ventures/i)).toBeVisible();
  });

  test('privacy page is accessible', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByText(/privacy policy/i)).toBeVisible();
    await expect(page.getByText(/van vliet ventures/i)).toBeVisible();
  });

  test('cookie consent banner appears for new visitors', async ({ page, context }) => {
    // Clear all cookies to simulate new visitor
    await context.clearCookies();
    await page.goto('/');

    // Cookie consent banner should appear
    await expect(page.getByText(/cookie|consent/i)).toBeVisible({ timeout: 5_000 });

    // Accept button should be present
    await expect(page.getByRole('button', { name: /accept/i })).toBeVisible();
  });
});
