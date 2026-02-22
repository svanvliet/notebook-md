import { test, expect } from '@playwright/test';

test.describe('Navigation & URL State', () => {

  test('demo mode is accessible via /demo URL', async ({ page }) => {
    await page.goto('/demo');
    // Should enter demo mode and show the app (not welcome screen)
    await expect(page.locator('.document-pane')).toBeVisible({ timeout: 10_000 });
  });

  test('/demo URL shows demo notebook content', async ({ page }) => {
    await page.goto('/demo');
    // Wait for app to fully initialize (document pane renders after demo notebook is created)
    await expect(page.locator('.document-pane')).toBeVisible({ timeout: 15_000 });
    // Should have the notebook pane with Demo Notebook visible
    await expect(page.getByText('Demo Notebook')).toBeVisible({ timeout: 10_000 });
  });

  test('deep link /demo/Demo%20Notebook/Getting%20Started.md loads file', async ({ page }) => {
    await page.goto('/demo/Demo%20Notebook/Getting%20Started.md');
    // Wait for demo mode to fully initialize
    await expect(page.locator('.document-pane')).toBeVisible({ timeout: 15_000 });
    // Tab should show the file name
    await expect(page.locator('[data-tab-id]')).toBeVisible({ timeout: 10_000 });
  });

  test('unauthenticated /app deep link shows welcome screen', async ({ page }) => {
    await page.goto('/app/SomeNotebook/file.md');
    // Should show welcome screen since not signed in
    await expect(page.getByRole('heading', { name: 'Notebook.md' })).toBeVisible({ timeout: 5_000 });
  });

  test('marketing pages remain accessible', async ({ page }) => {
    await page.goto('/features');
    await expect(page.getByRole('heading', { name: /everything you need/i })).toBeVisible();

    await page.goto('/about');
    await expect(page.getByRole('heading', { name: /About/i })).toBeVisible();
  });

  test('Try Demo button navigates to /demo', async ({ page }) => {
    await page.goto('/features');
    await page.getByRole('link', { name: /Try Demo/i }).or(page.getByRole('button', { name: /Try Demo/i })).first().click();
    // Should navigate to /demo and enter demo mode
    await expect(page).toHaveURL(/\/demo/);
    await expect(page.locator('.document-pane')).toBeVisible({ timeout: 10_000 });
  });
});
