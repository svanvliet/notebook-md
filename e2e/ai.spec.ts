import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Intercept /api/flags to enable AI feature flags. */
async function enableAiFlags(page: Page) {
  await page.route('**/api/flags', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    if (!json.flags) json.flags = {};
    json.flags.ai_content_generation = { enabled: true, variant: null, badge: null };
    json.flags.ai_unlimited_generations = { enabled: true, variant: null, badge: null };
    await route.fulfill({ json });
  });
}

/**
 * Mock the AI generate endpoint to return a canned SSE response.
 * Avoids needing real Azure OpenAI credentials in E2E.
 */
async function mockAiGenerate(page: Page, content = '## Hello World\n\nThis is AI-generated content.') {
  await page.route('**/api/ai/generate', async (route) => {
    const tokens = content.match(/.{1,10}/g) || [content];
    let sseBody = '';
    for (const token of tokens) {
      sseBody += `data: ${JSON.stringify({ type: 'token', content: token })}\n\n`;
    }
    sseBody += `data: ${JSON.stringify({ type: 'done' })}\n\n`;

    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-AI-Generations-Remaining': '9',
        'X-AI-Generations-Limit': '10',
      },
      body: sseBody,
    });
  });
}

/** Wait for the editor to be ready and click into it. */
async function focusEditor(page: Page) {
  const editor = page.locator('.ProseMirror');
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await page.waitForTimeout(200);
}

// ---------------------------------------------------------------------------
// Tests — use demo mode to avoid signup/auth rate limits
// ---------------------------------------------------------------------------

test.describe('AI Content Generation', () => {

  test.beforeEach(async ({ page }) => {
    await enableAiFlags(page);
  });

  test('toolbar sparkle button opens AI prompt modal', async ({ page }) => {
    await mockAiGenerate(page);
    await page.goto('/demo');
    await focusEditor(page);

    const sparkleBtn = page.locator('button[title="Create with AI"]');
    await expect(sparkleBtn).toBeVisible({ timeout: 5_000 });
    await sparkleBtn.click();

    await expect(page.getByText('Create with AI')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByPlaceholder(/e\.g\./)).toBeVisible();
  });

  test('slash command → prompt → accept inserts content', async ({ page }) => {
    await mockAiGenerate(page, '## Test Heading\n\nGenerated paragraph.');
    await page.goto('/demo');
    await focusEditor(page);

    // Type "/" to trigger slash commands
    await page.locator('.ProseMirror').press('Enter');
    await page.locator('.ProseMirror').type('/');

    // Slash command menu should appear
    await expect(page.getByText('Create with AI').first()).toBeVisible({ timeout: 3_000 });
    await page.getByText('Create with AI').first().click();

    // Modal should appear — fill prompt and submit
    await expect(page.getByPlaceholder(/e\.g\./)).toBeVisible({ timeout: 3_000 });
    await page.getByPlaceholder(/e\.g\./).fill('Write a test heading');
    await page.getByRole('button', { name: '✨ Create' }).click();

    // AI widget should appear
    const widget = page.locator('[role="region"][aria-label="AI generated content"]');
    await expect(widget).toBeVisible({ timeout: 5_000 });

    // Wait for completion (Insert button appears)
    await expect(widget.getByRole('button', { name: 'Insert' })).toBeVisible({ timeout: 10_000 });
    await expect(widget.getByText('Test Heading')).toBeVisible();

    // Accept content
    await widget.getByRole('button', { name: 'Insert' }).click();
    await expect(widget).not.toBeVisible({ timeout: 3_000 });

    // Verify content was inserted into document
    await expect(page.locator('.ProseMirror').getByText('Generated paragraph.')).toBeVisible({ timeout: 3_000 });
  });

  test('toolbar button → prompt → reject discards content', async ({ page }) => {
    await mockAiGenerate(page, '## Reject Me\n\nThis should be discarded.');
    await page.goto('/demo');
    await focusEditor(page);

    await page.locator('button[title="Create with AI"]').click();
    await page.getByPlaceholder(/e\.g\./).fill('Generate something to reject');
    await page.getByRole('button', { name: '✨ Create' }).click();

    const widget = page.locator('[role="region"][aria-label="AI generated content"]');
    await expect(widget.getByRole('button', { name: 'Discard' })).toBeVisible({ timeout: 10_000 });

    await widget.getByRole('button', { name: 'Discard' }).click();
    await expect(widget).not.toBeVisible({ timeout: 3_000 });

    // Rejected content should NOT be in the document
    await expect(page.locator('.ProseMirror').getByText('This should be discarded.')).not.toBeVisible();
  });

  test('prompt modal cancel closes without generating', async ({ page }) => {
    await page.goto('/demo');
    await focusEditor(page);

    await page.locator('button[title="Create with AI"]').click();
    await expect(page.getByPlaceholder(/e\.g\./)).toBeVisible({ timeout: 3_000 });

    await page.keyboard.press('Escape');

    await expect(page.getByPlaceholder(/e\.g\./)).not.toBeVisible({ timeout: 2_000 });
    await expect(page.locator('[role="region"][aria-label="AI generated content"]')).not.toBeVisible();
  });

  test('Cmd+Enter submits the prompt', async ({ page }) => {
    await mockAiGenerate(page, 'Keyboard shortcut test.');
    await page.goto('/demo');
    await focusEditor(page);

    await page.locator('button[title="Create with AI"]').click();
    await page.getByPlaceholder(/e\.g\./).fill('Test keyboard submit');

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Enter`);

    const widget = page.locator('[role="region"][aria-label="AI generated content"]');
    await expect(widget).toBeVisible({ timeout: 5_000 });
  });

  test('error state shows retry and dismiss buttons', async ({ page }) => {
    // Mock an error response
    await page.route('**/api/ai/generate', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'X-AI-Generations-Remaining': '9',
          'X-AI-Generations-Limit': '10',
        },
        body: `data: ${JSON.stringify({ type: 'error', message: 'AI service unavailable' })}\n\n`,
      });
    });

    await page.goto('/demo');
    await focusEditor(page);

    await page.locator('button[title="Create with AI"]').click();
    await page.getByPlaceholder(/e\.g\./).fill('Error test');
    await page.getByRole('button', { name: '✨ Create' }).click();

    const widget = page.locator('[role="region"][aria-label="AI generated content"]');
    await expect(widget.getByText('AI service unavailable')).toBeVisible({ timeout: 5_000 });
    await expect(widget.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(widget.getByRole('button', { name: 'Dismiss' })).toBeVisible();

    await widget.getByRole('button', { name: 'Dismiss' }).click();
    await expect(widget).not.toBeVisible({ timeout: 3_000 });
  });
});
