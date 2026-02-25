import { test, expect } from '@playwright/test';

/** Sign up a fresh user via API and return the user id. */
async function signUpApi(request: any, email: string, password: string) {
  const res = await request.post('/auth/signup', {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.user.id as string;
}

/** Sign in through the UI (fills form + clicks submit). */
async function signInUi(page: any, email: string, password: string) {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Sign In' }).click();
  await page.getByPlaceholder('Email address').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('main').getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('button', { name: 'Sign Up' })).not.toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Test 1: Create a cloud notebook via the full UI flow
// ---------------------------------------------------------------------------
test.describe('Cloud Notebooks', () => {

  test('create cloud notebook via Add Notebook dialog', async ({ page, request }) => {
    const email = `e2e-cloud-${Date.now()}@test.local`;
    await signUpApi(request, email, 'TestPass123!');
    await signInUi(page, email, 'TestPass123!');

    // Open Add Notebook dialog
    await page.getByRole('button', { name: /add notebook/i }).click();

    // Select Cloud source type
    await page.getByRole('button', { name: 'Cloud', exact: true }).click();

    // Enter notebook name and create
    await page.getByPlaceholder('My Notebook').fill('E2E Cloud Test');
    await page.getByRole('button', { name: 'Create Notebook' }).click();

    // Verify notebook appears in the sidebar tree
    await expect(page.getByText('E2E Cloud Test', { exact: true })).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Test 2: Public share link — anonymous users can view a shared notebook
// ---------------------------------------------------------------------------
test.describe('Public Share Links', () => {

  test('anonymous user can view a public share link', async ({ request, browser, baseURL }) => {
    const email = `e2e-share-${Date.now()}@test.local`;
    const password = 'TestPass123!';

    // Sign up via API (request fixture stores cookies)
    await signUpApi(request, email, password);

    // Sign in via API to get session cookies on the request fixture
    const signinRes = await request.post(`/auth/signin`, {
      data: { email, password },
    });
    expect(signinRes.ok()).toBeTruthy();

    // Create a cloud notebook via API
    const nbRes = await request.post(`/api/notebooks`, {
      data: { name: 'E2E Share Test', sourceType: 'cloud' },
    });
    expect(nbRes.ok()).toBeTruthy();
    const { notebook } = await nbRes.json();

    // Create a public share link via API
    const linkRes = await request.post(`/api/cloud/notebooks/${notebook.id}/share-links`, {
      data: { visibility: 'public' },
    });
    expect(linkRes.status()).toBe(201);
    const { link } = await linkRes.json();

    // Open the public link in a fresh browser context (anonymous — no cookies)
    const anonContext = await browser.newContext({ baseURL: baseURL! });
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/s/${link.token}`);

    // Verify the public viewer loads with the notebook name
    await expect(
      anonPage.getByRole('heading', { name: 'E2E Share Test' }),
    ).toBeVisible({ timeout: 10_000 });

    // Should NOT show a sign-in prompt
    await expect(anonPage.getByRole('button', { name: 'Sign Up' })).not.toBeVisible();

    await anonContext.close();
  });
});

// ---------------------------------------------------------------------------
// Test 3: Feature flag gating — disabled cloud_sharing hides Share menu
// ---------------------------------------------------------------------------
test.describe('Feature Flag Gating', () => {

  test('Share menu is hidden when cloud_sharing flag is disabled', async ({ page, request }) => {
    const email = `e2e-flag-${Date.now()}@test.local`;
    const password = 'TestPass123!';

    // Sign up via API
    await signUpApi(request, email, password);

    // Intercept the flags API to disable cloud_sharing
    await page.route('**/api/flags', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      if (json.flags?.cloud_sharing) {
        json.flags.cloud_sharing.enabled = false;
      }
      await route.fulfill({ json });
    });

    // Sign in through UI
    await signInUi(page, email, password);

    // Create a cloud notebook (cloud_notebooks is still enabled)
    await page.getByRole('button', { name: /add notebook/i }).click();
    await page.getByRole('button', { name: 'Cloud', exact: true }).click();
    await page.getByPlaceholder('My Notebook').fill('E2E Flag Test');
    await page.getByRole('button', { name: 'Create Notebook' }).click();
    await expect(page.getByText('E2E Flag Test', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Right-click the notebook to open context menu
    await page.getByText('E2E Flag Test', { exact: true }).click({ button: 'right' });

    // Context menu should have Refresh but NOT Share (cloud_sharing is disabled)
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible({ timeout: 2_000 });
    await expect(page.getByRole('button', { name: /share/i })).not.toBeVisible({ timeout: 2_000 });

    // "Shared with me" section should also be hidden
    await expect(page.getByText(/shared with me/i)).not.toBeVisible();
  });
});
