import supertest from 'supertest';
import app from '../app.js';
import { pool, query } from '../db/pool.js';
import { createSession } from '../services/session.js';

export const request = supertest(app);

const MAILPIT_API = process.env.MAILPIT_API ?? 'http://localhost:8025/api/v1';

/** Clean all user-created data between tests. Preserves schema. */
export async function cleanDb() {
  await query('DELETE FROM announcements');
  await query('DELETE FROM feature_flags');
  await query('DELETE FROM audit_log');
  await query('DELETE FROM email_verification_tokens');
  await query('DELETE FROM magic_link_tokens');
  await query('DELETE FROM password_reset_tokens');
  await query('DELETE FROM user_settings');
  await query('DELETE FROM github_installations');
  await query('DELETE FROM collab_sessions');
  await query('DELETE FROM document_versions');
  await query('DELETE FROM cloud_documents');
  await query('DELETE FROM notebook_shares');
  await query('DELETE FROM notebook_public_links');
  await query('DELETE FROM notebooks');
  await query('DELETE FROM user_usage_counters');
  await query('DELETE FROM user_plan_subscriptions');
  await query('DELETE FROM sessions');
  await query('DELETE FROM identity_links');
  await query('DELETE FROM users');
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
