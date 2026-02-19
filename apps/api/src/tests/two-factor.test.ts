import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import app from '../app.js';
import { cleanDb, signUp, signIn, request } from './helpers.js';

// Ensure ENCRYPTION_KEY is set for TOTP encryption
beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32bytes!!!!';
  }
});

describe('Two-Factor Authentication', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  // Helper: sign up and return cookies
  async function setupUser(email = 'twofa@test.com', password = 'password123') {
    const { cookies } = await signUp(email, password, 'Test User');
    return cookies;
  }

  // ── Setup & Enable (TOTP) ──────────────────────────────────────────────

  describe('TOTP setup and enable', () => {
    it('should set up TOTP and return secret + URI', async () => {
      const cookies = await setupUser();
      const res = await request
        .post('/auth/2fa/setup')
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.secret).toBeDefined();
      expect(res.body.uri).toContain('otpauth://totp/');
      expect(res.body.uri).toContain('Notebook.md');
    });

    it('should reject invalid TOTP code during enable', async () => {
      const cookies = await setupUser();

      // First setup
      await request.post('/auth/2fa/setup').set('Cookie', cookies);

      // Then try to enable with invalid code
      const res = await request
        .post('/auth/2fa/enable')
        .set('Cookie', cookies)
        .send({ code: '000000', method: 'totp' })
        .expect(400);

      expect(res.body.error).toContain('Invalid');
    });

    it('should require authentication for setup', async () => {
      await request
        .post('/auth/2fa/setup')
        .expect(401);
    });
  });

  // ── Enable (Email) ────────────────────────────────────────────────────

  describe('Email-based 2FA', () => {
    it('should enable email 2FA and return recovery codes', async () => {
      const cookies = await setupUser();
      const res = await request
        .post('/auth/2fa/enable')
        .set('Cookie', cookies)
        .send({ method: 'email' })
        .expect(200);

      expect(res.body.recoveryCodes).toBeDefined();
      expect(res.body.recoveryCodes).toHaveLength(10);
      expect(res.body.recoveryCodes[0]).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}$/);
    });
  });

  // ── Status ─────────────────────────────────────────────────────────────

  describe('2FA status', () => {
    it('should return disabled by default', async () => {
      const cookies = await setupUser();
      const res = await request
        .get('/auth/2fa/status')
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.enabled).toBe(false);
      expect(res.body.method).toBeNull();
    });

    it('should return enabled with email method after enabling', async () => {
      const cookies = await setupUser();
      await request
        .post('/auth/2fa/enable')
        .set('Cookie', cookies)
        .send({ method: 'email' });

      const res = await request
        .get('/auth/2fa/status')
        .set('Cookie', cookies)
        .expect(200);

      expect(res.body.enabled).toBe(true);
      expect(res.body.method).toBe('email');
    });
  });

  // ── /auth/me with 2FA fields ──────────────────────────────────────────

  describe('/auth/me 2FA fields', () => {
    it('should include twoFactorEnabled in /auth/me response', async () => {
      const cookies = await setupUser();

      // Before enabling
      let res = await request.get('/auth/me').set('Cookie', cookies).expect(200);
      expect(res.body.user.twoFactorEnabled).toBe(false);
      expect(res.body.user.twoFactorMethod).toBeNull();

      // Enable email 2FA
      await request
        .post('/auth/2fa/enable')
        .set('Cookie', cookies)
        .send({ method: 'email' });

      // After enabling
      res = await request.get('/auth/me').set('Cookie', cookies).expect(200);
      expect(res.body.user.twoFactorEnabled).toBe(true);
      expect(res.body.user.twoFactorMethod).toBe('email');
    });
  });

  // ── Sign-in with 2FA ──────────────────────────────────────────────────

  describe('Sign-in with 2FA', () => {
    it('should return 2FA challenge when signing in with 2FA enabled', async () => {
      const email = 'twofa@test.com';
      const password = 'password123';
      const cookies = await setupUser(email, password);

      // Enable email 2FA
      await request
        .post('/auth/2fa/enable')
        .set('Cookie', cookies)
        .send({ method: 'email' });

      // Sign out
      await request.post('/auth/signout').set('Cookie', cookies);

      // Sign in again — should get 2FA challenge
      const res = await request
        .post('/auth/signin')
        .send({ email, password })
        .expect(200);

      expect(res.body.requires2fa).toBe(true);
      expect(res.body.challengeToken).toBeDefined();
      expect(res.body.method).toBe('email');
      // Should NOT have a session cookie set
      expect(res.body.user).toBeUndefined();
    });

    it('should reject invalid challenge token', async () => {
      const res = await request
        .post('/auth/2fa/verify')
        .send({ challengeToken: 'invalid-token', code: '123456' })
        .expect(401);

      expect(res.body.error).toContain('Challenge expired');
    });
  });

  // ── Disable ────────────────────────────────────────────────────────────

  describe('Disable 2FA', () => {
    it('should reject disable when 2FA is not enabled', async () => {
      const cookies = await setupUser();
      const res = await request
        .post('/auth/2fa/disable')
        .set('Cookie', cookies)
        .send({ code: '123456' })
        .expect(400);

      expect(res.body.error).toContain('not enabled');
    });

    it('should reject disable with invalid code', async () => {
      const cookies = await setupUser();
      await request
        .post('/auth/2fa/enable')
        .set('Cookie', cookies)
        .send({ method: 'email' });

      const res = await request
        .post('/auth/2fa/disable')
        .set('Cookie', cookies)
        .send({ code: '000000' })
        .expect(400);

      expect(res.body.error).toContain('Invalid');
    });

    it('should allow disable with a recovery code', async () => {
      const cookies = await setupUser();
      const enableRes = await request
        .post('/auth/2fa/enable')
        .set('Cookie', cookies)
        .send({ method: 'email' });

      const recoveryCode = enableRes.body.recoveryCodes[0];

      const res = await request
        .post('/auth/2fa/disable')
        .set('Cookie', cookies)
        .send({ code: recoveryCode })
        .expect(200);

      expect(res.body.message).toBe('2FA disabled');

      // Verify it's disabled
      const status = await request
        .get('/auth/2fa/status')
        .set('Cookie', cookies)
        .expect(200);
      expect(status.body.enabled).toBe(false);
    });
  });

  // ── Recovery codes ─────────────────────────────────────────────────────

  describe('Recovery codes', () => {
    it('should consume recovery codes on use (one-time)', async () => {
      const cookies = await setupUser();
      const enableRes = await request
        .post('/auth/2fa/enable')
        .set('Cookie', cookies)
        .send({ method: 'email' });

      const code = enableRes.body.recoveryCodes[0];

      // Use recovery code to disable
      await request
        .post('/auth/2fa/disable')
        .set('Cookie', cookies)
        .send({ code })
        .expect(200);

      // Re-enable
      await request
        .post('/auth/2fa/enable')
        .set('Cookie', cookies)
        .send({ method: 'email' });

      // The old recovery code should NOT work (new codes were generated)
      const res = await request
        .post('/auth/2fa/disable')
        .set('Cookie', cookies)
        .send({ code })
        .expect(400);

      expect(res.body.error).toContain('Invalid');
    });
  });
});
