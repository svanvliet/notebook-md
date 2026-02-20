import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { request, cleanDb, closeDb, extractCookies, extractRefreshToken } from './helpers.js';

afterAll(async () => { await closeDb(); });

describe('POST /auth/dev-login', () => {
  beforeEach(async () => { await cleanDb(); });

  it('should create a dev user and return a session', async () => {
    const res = await request.post('/auth/dev-login');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('dev@localhost');
    expect(res.body.user.displayName).toBe('Dev User');
    expect(extractRefreshToken(res)).toBeTruthy();
  });

  it('should reuse existing dev user on subsequent calls', async () => {
    const res1 = await request.post('/auth/dev-login');
    const res2 = await request.post('/auth/dev-login');
    expect(res1.body.user.id).toBe(res2.body.user.id);
  });

  it('should return a working session cookie', async () => {
    const res = await request.post('/auth/dev-login');
    const cookies = extractCookies(res);

    // Use the refresh token to get /auth/me
    const refreshRes = await request
      .post('/auth/refresh')
      .set('Cookie', cookies);
    expect(refreshRes.status).toBe(200);

    const meRes = await request
      .get('/auth/me')
      .set('Cookie', extractCookies(refreshRes));
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('dev@localhost');
  });
});
