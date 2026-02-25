import supertest from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { pool, query } from '../db/pool.js';
import { createSession } from '../services/session.js';

export const request = supertest(app);

// Pre-hashed password for 'Password123!' — avoids bcrypt cost on every test
let cachedHash: string | null = null;
async function getTestPasswordHash(): Promise<string> {
  if (!cachedHash) cachedHash = await bcrypt.hash('Password123!', 4); // cost 4 for speed
  return cachedHash;
}

const MAILPIT_API = process.env.MAILPIT_API ?? 'http://localhost:8025/api/v1';

/** Clean all user-created data between tests. Preserves schema.
 *  Uses a single multi-statement query to minimize round-trips. */
export async function cleanDb() {
  await query(`
    DELETE FROM announcements;
    DELETE FROM flight_assignments;
    DELETE FROM flight_flags;
    DELETE FROM flights WHERE is_permanent IS NOT TRUE;
    DELETE FROM user_group_members;
    DELETE FROM user_groups;
    DELETE FROM flag_overrides;
    DELETE FROM feature_flags;
    DELETE FROM audit_log;
    DELETE FROM email_verification_tokens;
    DELETE FROM magic_link_tokens;
    DELETE FROM password_reset_tokens;
    DELETE FROM user_settings;
    DELETE FROM github_installations;
    DELETE FROM collab_sessions;
    DELETE FROM document_versions;
    DELETE FROM cloud_documents;
    DELETE FROM notebook_shares;
    DELETE FROM notebook_public_links;
    DELETE FROM notebooks;
    DELETE FROM user_usage_counters;
    DELETE FROM user_plan_subscriptions;
    DELETE FROM sessions;
    DELETE FROM identity_links;
    DELETE FROM users;
    DELETE FROM flights;
  `);
}

/**
 * Seed feature flags and put them in a 100% GA flight so they're delivered to all users.
 * Use in test beforeAll after cleanDb().
 */
export async function seedFlagsWithGAFlight(flags: Array<{ key: string; enabled?: boolean; description?: string }>) {
  for (const f of flags) {
    await query(
      `INSERT INTO feature_flags (key, enabled, description) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET enabled = $2`,
      [f.key, f.enabled ?? true, f.description ?? 'test'],
    );
  }
  const fRes = await query<{ id: string }>(
    `INSERT INTO flights (name, rollout_percentage, enabled) VALUES ('test-ga', 100, true) ON CONFLICT (name) DO UPDATE SET rollout_percentage = 100 RETURNING id`,
  );
  const flightId = fRes.rows[0].id;
  for (const f of flags) {
    if (f.enabled !== false) {
      await query('INSERT INTO flight_flags (flight_id, flag_key) VALUES ($1, $2) ON CONFLICT DO NOTHING', [flightId, f.key]);
    }
  }
}

/** Delete all messages from Mailpit. */
export async function clearMailpit() {
  await fetch(`${MAILPIT_API}/messages`, { method: 'DELETE' });
}

/** Get messages from Mailpit, optionally filtered by recipient. */
export async function getMailpitMessages(to?: string): Promise<Array<{ ID: string; Subject: string; To: Array<{ Address: string }>; Snippet: string }>> {
  const res = await fetch(`${MAILPIT_API}/messages`);
  const data = await res.json() as { messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }>; Snippet: string }> };
  if (!to) return data.messages ?? [];
  return (data.messages ?? []).filter(m => m.To.some(r => r.Address === to));
}

/** Get the full text body of a Mailpit message by ID. */
export async function getMailpitMessageBody(id: string): Promise<string> {
  const res = await fetch(`${MAILPIT_API}/message/${id}`);
  const data = await res.json() as { Text: string };
  return data.Text;
}

/** Close the DB pool (call in afterAll). */
export async function closeDb() {
  await pool.end();
}

/**
 * Create a test user directly via SQL — no HTTP, no email, ~1ms.
 * Use when you need an authenticated user but aren't testing the signup flow.
 * Password is always 'Password123!' (can be used with signIn() if needed).
 */
export async function createTestUser(
  email: string,
  displayName = 'Test User',
  opts?: { isAdmin?: boolean; twoFactorEnabled?: boolean },
): Promise<{ userId: string; cookies: string }> {
  const hash = await getTestPasswordHash();
  const result = await query<{ id: string }>(
    `INSERT INTO users (id, email, display_name, password_hash, email_verified, is_admin, totp_enabled)
     VALUES (gen_random_uuid(), $1, $2, $3, true, $4, $5) RETURNING id`,
    [email, displayName, hash, opts?.isAdmin ?? false, opts?.twoFactorEnabled ?? false],
  );
  const userId = result.rows[0].id;
  const session = await createSession(userId, {});
  const cookieVal = `refresh_token=${session.refreshToken}`;
  return { userId, cookies: cookieVal };
}

/**
 * Create an admin user directly via SQL — no HTTP, no email, ~1ms.
 * Has is_admin=true and totp_enabled=true (satisfies admin middleware MFA check).
 */
export async function createTestAdmin(
  email = 'admin@test.com',
  displayName = 'Admin User',
): Promise<{ userId: string; cookies: string }> {
  return createTestUser(email, displayName, { isAdmin: true, twoFactorEnabled: true });
}

/** Sign up a user and return the response + cookie. */
export async function signUp(
  email: string,
  password: string,
  displayName?: string,
) {
  const res = await request
    .post('/auth/signup')
    .send({ email, password, displayName });

  const cookies = extractCookies(res);
  return { res, cookies };
}

/** Sign in a user and return the response + cookie. */
export async function signIn(email: string, password: string) {
  const res = await request
    .post('/auth/signin')
    .send({ email, password });

  const cookies = extractCookies(res);
  return { res, cookies };
}

/** Extract cookie header string from a supertest response. */
export function extractCookies(res: supertest.Response): string {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return '';
  if (Array.isArray(setCookie)) return setCookie.join('; ');
  return setCookie;
}

/** Extract the refresh_token value from set-cookie header. */
export function extractRefreshToken(res: supertest.Response): string | null {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return null;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of cookies) {
    const match = c.match(/refresh_token=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

/** Create an OAuth-only user (no password) with a valid session. Returns refreshToken for cookie. */
export async function createOAuthUser(email: string, displayName = 'OAuth User') {
  const result = await query<{ id: string }>(
    "INSERT INTO users (id, email, display_name, email_verified) VALUES (gen_random_uuid(), $1, $2, true) RETURNING id",
    [email, displayName],
  );
  const userId = result.rows[0].id;
  const session = await createSession(userId, {});
  return { userId, refreshToken: session.refreshToken };
}
