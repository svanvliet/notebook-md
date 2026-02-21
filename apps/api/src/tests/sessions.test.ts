import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { request, cleanDb, closeDb, signUp, extractRefreshToken } from './helpers.js';
import { query } from '../db/pool.js';

afterAll(async () => { await closeDb(); });

describe('Session Management', () => {
  beforeEach(async () => { await cleanDb(); });

  it('should issue refresh token on sign-up', async () => {
    const { res } = await signUp('alice@test.com', 'Password123!');
    expect(extractRefreshToken(res)).toBeTruthy();
  });

  it('should rotate refresh token on /auth/refresh', async () => {
    const { res: signUpRes } = await signUp('alice@test.com', 'Password123!');
    const oldToken = extractRefreshToken(signUpRes)!;

    const refreshRes = await request
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${oldToken}`);
    expect(refreshRes.status).toBe(200);

    const newToken = extractRefreshToken(refreshRes);
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);

    // New token should work
    const meRes = await request.get('/auth/me').set('Cookie', `refresh_token=${newToken}`);
    expect(meRes.status).toBe(200);
  });

  it('should invalidate old token after rotation', async () => {
    const { res: signUpRes } = await signUp('alice@test.com', 'Password123!');
    const oldToken = extractRefreshToken(signUpRes)!;

    // Rotate
    await request.post('/auth/refresh').set('Cookie', `refresh_token=${oldToken}`);

    // Old token should no longer work for /auth/me
    const meRes = await request.get('/auth/me').set('Cookie', `refresh_token=${oldToken}`);
    expect(meRes.status).toBe(401);
  });

  it('should revoke entire token family on reuse detection', async () => {
    const { res: signUpRes } = await signUp('alice@test.com', 'Password123!');
    const originalToken = extractRefreshToken(signUpRes)!;

    // Rotate to get a new token
    const refreshRes = await request
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${originalToken}`);
    const newToken = extractRefreshToken(refreshRes)!;

    // Reuse the original token (simulates stolen token)
    const reuseRes = await request
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${originalToken}`);
    expect(reuseRes.status).toBe(401);

    // The legitimate new token should also be revoked (family compromised)
    const meRes = await request.get('/auth/me').set('Cookie', `refresh_token=${newToken}`);
    expect(meRes.status).toBe(401);
  });

  it('should reject expired refresh token', async () => {
    const { res: signUpRes } = await signUp('alice@test.com', 'Password123!');
    const token = extractRefreshToken(signUpRes)!;

    // Manually expire the session in the DB
    await query('UPDATE sessions SET expires_at = now() - interval \'1 hour\'');

    const refreshRes = await request
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${token}`);
    expect(refreshRes.status).toBe(401);
  });

  it('should reject /auth/refresh with no cookie', async () => {
    const res = await request.post('/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('should return user data on successful refresh', async () => {
    const { res: signUpRes } = await signUp('alice@test.com', 'Password123!', 'Alice');
    const token = extractRefreshToken(signUpRes)!;

    const refreshRes = await request
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${token}`);

    expect(refreshRes.body.user).toBeTruthy();
    expect(refreshRes.body.user.email).toBe('alice@test.com');
    expect(refreshRes.body.sessionId).toBeTruthy();
  });
});
