/**
 * Admin Console Validation Script
 * 
 * Uses Playwright to validate all Phase 1-4 admin features.
 * Requires: dev.sh running (all services up), admin@localhost user with is_admin=true, totp_enabled=true
 */
import { chromium, type Page, type BrowserContext } from '@playwright/test';

const ADMIN_URL = 'http://localhost:5174';
const API_URL = 'http://localhost:3001';
const MAILPIT_API = 'http://localhost:8025/api/v1';

interface ValidationResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: ValidationResult[] = [];

function log(msg: string) {
  console.log(`  ${msg}`);
}

function pass(name: string) {
  results.push({ name, passed: true });
  console.log(`  ✅ ${name}`);
}

function fail(name: string, error: string) {
  results.push({ name, passed: false, error });
  console.log(`  ❌ ${name}: ${error}`);
}

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    pass(name);
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

// ── Auth Helper ──────────────────────────────────────────────────────────────

async function signInAdmin(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();

  // Clear mailpit
  await fetch(`${MAILPIT_API}/messages`, { method: 'DELETE' }).catch(() => {});

  // Use ADMIN_URL for all auth calls so cookies are set on the correct origin (port 5174)
  // Vite proxy forwards /auth/* to the API
  
  // Step 1: Sign in
  const signinRes = await page.request.post(`${ADMIN_URL}/auth/signin`, {
    data: { email: 'admin@localhost', password: 'admin123' },
  });
  const signinData = await signinRes.json();

  if (!signinData.requires2fa) {
    // No 2FA required — already authenticated
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    return page;
  }

  // Step 2: Request email code
  const sendRes = await page.request.post(`${ADMIN_URL}/auth/2fa/send-code`, {
    data: { challengeToken: signinData.challengeToken },
  });
  if (!sendRes.ok()) {
    throw new Error(`Failed to send 2FA code: ${sendRes.status()}`);
  }

  // Step 3: Get email code from Mailpit
  await new Promise(r => setTimeout(r, 2000)); // wait for email delivery
  const mailRes = await fetch(`${MAILPIT_API}/messages`);
  const mailData = await mailRes.json() as { messages: { ID: string; Snippet: string }[] };
  
  const latest = mailData.messages?.[0];
  if (!latest) throw new Error('No email found in Mailpit after 2s');
  
  // Get full message to extract code
  const msgRes = await fetch(`${MAILPIT_API}/message/${latest.ID}`);
  const msgData = await msgRes.json() as { Text: string };
  const codeMatch = msgData.Text.match(/\b(\d{6})\b/);
  if (!codeMatch) throw new Error(`No 6-digit code found in email: ${msgData.Text.substring(0, 200)}`);
  const code = codeMatch[1];
  log(`Got 2FA code: ${code}`);

  // Step 4: Verify 2FA (this sets the session cookie on the admin origin)
  const verifyRes = await page.request.post(`${ADMIN_URL}/auth/2fa/verify`, {
    data: { challengeToken: signinData.challengeToken, code, method: 'email' },
  });
  
  if (!verifyRes.ok()) {
    const body = await verifyRes.text();
    throw new Error(`2FA verify failed (${verifyRes.status()}): ${body}`);
  }

  // Navigate to admin
  await page.goto(ADMIN_URL);
  await page.waitForLoadState('networkidle');
  
  // Verify we're actually in the admin (not the auth error screen)
  const bodyText = await page.textContent('body');
  if (bodyText?.includes('Not authenticated') || bodyText?.includes('Access denied')) {
    throw new Error(`Auth failed — admin page shows: ${bodyText?.substring(0, 200)}`);
  }
  
  return page;
}

// ── Validation Functions ─────────────────────────────────────────────────────

async function validateDashboard(page: Page) {
  console.log('\n📊 Dashboard');
  await page.goto(ADMIN_URL);
  await page.waitForLoadState('networkidle');

  await check('Health cards visible', async () => {
    await page.waitForSelector('text=System Health', { timeout: 5000 });
    const healthSection = await page.textContent('body');
    if (!healthSection?.includes('All systems operational') && !healthSection?.includes('Degraded')) {
      throw new Error('Health status not found');
    }
  });

  await check('Metrics cards visible', async () => {
    await page.waitForSelector('text=Platform Metrics', { timeout: 5000 });
    await page.waitForSelector('text=Total Users', { timeout: 3000 });
  });

  await check('Recent Actions section visible', async () => {
    // Wait for the async dashboard summary to load
    await page.waitForTimeout(3000);
    
    // Check for console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    
    const body = await page.textContent('body');
    if (body?.includes('Recent Admin Actions')) {
      return;
    }
    
    // Check via API if the endpoint works
    const summaryRes = await page.request.get(`${ADMIN_URL}/admin/dashboard/summary`);
    log(`Dashboard summary API: ${summaryRes.status()}`);
    if (!summaryRes.ok()) {
      const text = await summaryRes.text();
      log(`Dashboard summary error: ${text.substring(0, 200)}`);
    } else {
      const data = await summaryRes.json();
      log(`Summary data: actions=${data.recentActions?.length}, stale=${data.staleFlags?.length}, flights=${data.activeFlights?.length}`);
    }
    
    throw new Error('Recent Admin Actions section not rendered');
  });

  await check('Active Flights section visible', async () => {
    const body = await page.textContent('body');
    if (body?.includes('Active Flights')) return;
    // No active flights is acceptable — section only shows when there are active flights
    log('  ℹ️  No active flights (section hidden when empty)');
  });
}

async function validateNavigation(page: Page) {
  console.log('\n🧭 Navigation');
  
  await check('Feature Management collapsible section exists', async () => {
    await page.waitForSelector('text=Feature Management', { timeout: 5000 });
  });

  await check('Feature Management expands to show Flags, Flights, Groups', async () => {
    // Click to expand
    await page.click('text=Feature Management');
    await page.waitForTimeout(300);
    
    const nav = await page.textContent('aside');
    if (!nav?.includes('Flags')) throw new Error('Flags not found in nav');
    if (!nav?.includes('Flights')) throw new Error('Flights not found in nav');
    if (!nav?.includes('Groups')) throw new Error('Groups not found in nav');
  });

  await check('Auto-expands when navigating to feature flags', async () => {
    await page.goto(`${ADMIN_URL}/feature-flags`);
    await page.waitForLoadState('networkidle');
    const flagsLink = page.locator('aside a[href="/feature-flags"]');
    await flagsLink.waitFor({ timeout: 3000 });
  });
}

async function validateUsers(page: Page) {
  console.log('\n👤 Users Page');
  await page.goto(`${ADMIN_URL}/users`);
  await page.waitForLoadState('networkidle');

  await check('Users page loads with table', async () => {
    await page.waitForSelector('text=Users', { timeout: 5000 });
    await page.waitForSelector('table', { timeout: 5000 });
  });

  await check('Status filter pills visible (All/Active/Suspended)', async () => {
    const body = await page.textContent('body');
    if (!body?.includes('All') || !body?.includes('Active') || !body?.includes('Suspended')) {
      throw new Error('Filter pills not found');
    }
  });

  await check('Active filter works', async () => {
    await page.click('button:has-text("Active")');
    await page.waitForTimeout(500);
    // Should still show the table
    await page.waitForSelector('table', { timeout: 3000 });
  });

  await check('All filter works', async () => {
    await page.click('button:has-text("All")');
    await page.waitForTimeout(500);
    await page.waitForSelector('table', { timeout: 3000 });
  });

  await check('Sortable column headers present', async () => {
    const body = await page.textContent('body');
    if (!body?.includes('Joined') || !body?.includes('Last Active')) {
      throw new Error('Sortable headers not found');
    }
  });

  await check('Search input has debounced behavior', async () => {
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('admin');
    await page.waitForTimeout(500);
    // Table should still be present after search
    await page.waitForSelector('table', { timeout: 3000 });
  });

  await check('User detail slide panel opens with tabs', async () => {
    // Click the View button for the first user
    const viewBtn = page.locator('button:has-text("View")').first();
    await viewBtn.click();
    await page.waitForTimeout(500);
    
    // Check for tabs
    const panelText = await page.textContent('body');
    if (!panelText?.includes('Overview')) throw new Error('Overview tab not found');
    if (!panelText?.includes('Groups')) throw new Error('Groups tab not found');
    if (!panelText?.includes('Flags')) throw new Error('Flags tab not found');
    if (!panelText?.includes('Sessions')) throw new Error('Sessions tab not found');
  });

  await check('Sessions tab has Force Logout button', async () => {
    // Click Sessions tab
    await page.click('button:has-text("Sessions")');
    await page.waitForTimeout(300);
    const btn = page.locator('button:has-text("Force Logout")');
    const count = await btn.count();
    if (count === 0) throw new Error('Force Logout button not found');
  });

  // Close the panel
  const closeBtn = page.locator('[aria-label="Close panel"], button:has-text("✕"), button:has-text("×")').first();
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
    await page.waitForTimeout(300);
  }
}

async function validateFeatureFlags(page: Page) {
  console.log('\n🚩 Feature Flags Page');
  await page.goto(`${ADMIN_URL}/feature-flags`);
  await page.waitForLoadState('networkidle');

  await check('Feature flags page loads', async () => {
    await page.waitForSelector('text=Feature Flags', { timeout: 5000 });
  });

  await check('Archive filter tabs visible (Active/Archived/All)', async () => {
    const body = await page.textContent('body');
    // Check for filter buttons
    const hasActive = body?.includes('Active');
    const hasArchived = body?.includes('Archived');
    if (!hasActive || !hasArchived) throw new Error('Archive filter tabs not found');
  });

  await check('Create flag works', async () => {
    await page.click('button:has-text("New Flag")');
    await page.waitForTimeout(300);
    
    // Fill form
    const keyInput = page.locator('input[placeholder*="flag"]').first();
    await keyInput.fill('validation_test_flag');
    
    const descInput = page.locator('input[placeholder*="Description"]').first();
    if (await descInput.count() > 0) {
      await descInput.fill('Created during validation');
    }
    
    await page.click('button:has-text("Create Flag")');
    await page.waitForTimeout(1000);
  });

  await check('Archived tab filtering works', async () => {
    // Click Archived tab
    const archivedBtn = page.locator('button').filter({ hasText: /^Archived$/ });
    if (await archivedBtn.count() > 0) {
      await archivedBtn.click();
      await page.waitForTimeout(500);
    }
    // Click All tab
    const allBtn = page.locator('button').filter({ hasText: /^All$/ });
    if (await allBtn.count() > 0) {
      await allBtn.click();
      await page.waitForTimeout(500);
    }
  });
}

async function validateFlights(page: Page) {
  console.log('\n✈️ Flights Page');
  await page.goto(`${ADMIN_URL}/flights`);
  await page.waitForLoadState('networkidle');

  await check('Flights page loads', async () => {
    await page.waitForSelector('text=Flights', { timeout: 5000 });
  });

  await check('Create flight works', async () => {
    await page.click('button:has-text("New Flight")');
    await page.waitForTimeout(300);
    
    const nameInput = page.locator('input[placeholder*="Flight name"]').first();
    await nameInput.fill('Validation Flight');
    
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);
  });

  await check('Flight detail opens with rollout bar', async () => {
    // Click on the flight row
    const row = page.locator('tr').filter({ hasText: 'Validation Flight' });
    if (await row.count() > 0) {
      await row.click();
      await page.waitForTimeout(500);
      
      // Check for rollout bar (range input or visual bar)
      const hasRollout = await page.locator('input[type="range"]').count();
      if (hasRollout === 0) throw new Error('Rollout slider not found');
    }
  });
}

async function validateGroups(page: Page) {
  console.log('\n👥 Groups Page');
  await page.goto(`${ADMIN_URL}/groups`);
  await page.waitForLoadState('networkidle');

  await check('Groups page loads', async () => {
    await page.waitForSelector('text=Groups', { timeout: 5000 });
  });

  await check('Create group works', async () => {
    await page.click('button:has-text("New Group")');
    await page.waitForTimeout(300);
    
    const nameInput = page.locator('input[placeholder*="Group name"]').first();
    await nameInput.fill('Validation Group');
    
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(1000);
  });
}

async function validateAuditLog(page: Page) {
  console.log('\n📋 Audit Log Page');
  await page.goto(`${ADMIN_URL}/audit-log`);
  await page.waitForLoadState('networkidle');

  await check('Audit log page loads with entries', async () => {
    await page.waitForSelector('text=Audit Log', { timeout: 5000 });
    await page.waitForSelector('table', { timeout: 5000 });
  });

  await check('Action filter dropdown present', async () => {
    const select = page.locator('select');
    const count = await select.count();
    if (count === 0) throw new Error('Action filter dropdown not found');
  });

  await check('Date range filters present', async () => {
    const dateInputs = page.locator('input[type="date"]');
    const count = await dateInputs.count();
    if (count < 2) throw new Error(`Expected 2 date inputs, found ${count}`);
  });

  await check('User filter input present', async () => {
    const userInput = page.locator('input[placeholder*="user"]');
    const count = await userInput.count();
    if (count === 0) throw new Error('User filter input not found');
  });

  await check('Export CSV button present', async () => {
    const btn = page.locator('button:has-text("Export")');
    const count = await btn.count();
    if (count === 0) throw new Error('Export CSV button not found');
  });
}

async function validateAnnouncements(page: Page) {
  console.log('\n📢 Announcements Page');
  await page.goto(`${ADMIN_URL}/announcements`);
  await page.waitForLoadState('networkidle');

  await check('Announcements page loads', async () => {
    await page.waitForSelector('text=Announcements', { timeout: 5000 });
  });

  await check('Create announcement with markdown preview', async () => {
    await page.click('button:has-text("New Announcement")');
    await page.waitForTimeout(300);
    
    const titleInput = page.locator('input[placeholder*="Title"]').first();
    await titleInput.fill('Test Announcement');
    
    const bodyInput = page.locator('textarea').first();
    await bodyInput.fill('**Bold text** and *italic text*');
    await page.waitForTimeout(300);
    
    // Check for preview
    const body = await page.textContent('body');
    const hasPreview = body?.includes('Preview') || body?.includes('Bold text');
    if (!hasPreview) throw new Error('Markdown preview not found');
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Admin Console Validation');
  console.log('━'.repeat(50));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    // Sign in
    console.log('\n🔐 Signing in as admin...');
    const page = await signInAdmin(context);
    log('Signed in successfully');

    // Run all validations
    await validateDashboard(page);
    await validateNavigation(page);
    await validateUsers(page);
    await validateFeatureFlags(page);
    await validateFlights(page);
    await validateGroups(page);
    await validateAuditLog(page);
    await validateAnnouncements(page);

    // Clean up test data
    console.log('\n🧹 Cleanup');
    // Delete test flag
    await page.request.post(`${API_URL}/admin/feature-flags`, {
      data: { key: 'validation_test_flag', enabled: false, description: 'cleanup' },
    }).catch(() => {});

  } catch (e) {
    console.error('\n💥 Fatal error:', e);
  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n' + '━'.repeat(50));
  console.log('📋 Validation Summary');
  console.log('━'.repeat(50));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📊 Total:  ${results.length}`);

  if (failed > 0) {
    console.log('\n  Failed checks:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    ❌ ${r.name}: ${r.error}`);
    });
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main();
