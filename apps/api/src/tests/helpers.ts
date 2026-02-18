import supertest from 'supertest';
import app from '../app.js';
import { pool, query } from '../db/pool.js';

export const request = supertest(app);

/** Clean all user-created data between tests. Preserves schema. */
export async function cleanDb() {
  await query('DELETE FROM audit_log');
  await query('DELETE FROM email_verification_tokens');
  await query('DELETE FROM magic_link_tokens');
  await query('DELETE FROM password_reset_tokens');
  await query('DELETE FROM user_settings');
  await query('DELETE FROM notebooks');
  await query('DELETE FROM sessions');
  await query('DELETE FROM identity_links');
  await query('DELETE FROM users');
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
