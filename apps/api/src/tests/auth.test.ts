import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { request, cleanDb, closeDb, signUp, signIn, extractRefreshToken, clearMailpit, getMailpitMessages, getMailpitMessageBody, createOAuthUser } from './helpers.js';

afterAll(async () => { await closeDb(); });

describe('Auth Flows', () => {
  beforeEach(async () => { await cleanDb(); });

  // --- Sign-up ---

  it('should sign up a new user with email + password', async () => {
    const { res } = await signUp('alice@test.com', 'Password123!', 'Alice');
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('alice@test.com');
    expect(res.body.user.displayName).toBe('Alice');
    expect(res.body.user.emailVerified).toBe(false);
    expect(res.body.sessionId).toBeTruthy();
    expect(extractRefreshToken(res)).toBeTruthy();
  });

  it('should strip HTML from displayName on sign-up', async () => {
    const { res } = await signUp('xss@test.com', 'Password123!', '<script>alert("xss")</script>Bob');
    expect(res.status).toBe(201);
    expect(res.body.user.displayName).toBe('alert("xss")Bob');
  });

  it('should default displayName to email prefix', async () => {
    const { res } = await signUp('bob@test.com', 'Password123!');
    expect(res.status).toBe(201);
    expect(res.body.user.displayName).toBe('bob');
  });

  it('should reject duplicate email on sign-up', async () => {
    await signUp('alice@test.com', 'Password123!');
    const { res } = await signUp('alice@test.com', 'OtherPassword1!');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('should reject short password on sign-up', async () => {
    const { res } = await signUp('alice@test.com', 'short');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 8/);
  });

  it('should reject password without uppercase on sign-up', async () => {
    const { res } = await signUp('alice@test.com', 'password123!');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/uppercase/i);
  });

  it('should reject password without lowercase on sign-up', async () => {
    const { res } = await signUp('alice@test.com', 'PASSWORD123!');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lowercase/i);
  });

  it('should reject password without number on sign-up', async () => {
    const { res } = await signUp('alice@test.com', 'PasswordABC!');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/number/i);
  });

  it('should reject password without special character on sign-up', async () => {
    const { res } = await signUp('alice@test.com', 'Password123');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/special/i);
  });

  it('should reject invalid email on sign-up', async () => {
    const res = await request.post('/auth/signup').send({ email: 'notanemail', password: 'Password123!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('should reject missing password on sign-up', async () => {
    const res = await request.post('/auth/signup').send({ email: 'alice@test.com' });
    expect(res.status).toBe(400);
  });

  // --- Sign-in ---

  it('should sign in with correct credentials', async () => {
    await signUp('alice@test.com', 'Password123!');
    const { res } = await signIn('alice@test.com', 'Password123!');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('alice@test.com');
    expect(extractRefreshToken(res)).toBeTruthy();
  });

  it('should reject wrong password on sign-in', async () => {
    await signUp('alice@test.com', 'Password123!');
    const { res } = await signIn('alice@test.com', 'wrongpassword');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('should reject unknown email on sign-in', async () => {
    const { res } = await signIn('nobody@test.com', 'Password123!');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('should reject missing fields on sign-in', async () => {
    const res = await request.post('/auth/signin').send({ email: 'alice@test.com' });
    expect(res.status).toBe(400);
  });

  // --- Magic link ---

  it('should request magic link without revealing if email exists', async () => {
    // Non-existent email should still return 200
    const res = await request.post('/auth/magic-link/request').send({ email: 'nobody@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account/i);
  });

  it('should reject invalid token for magic link verify', async () => {
    const res = await request.post('/auth/magic-link/verify').send({ token: 'badtoken' });
    expect(res.status).toBe(400);
  });

  // --- Password reset ---

  it('should request password reset without revealing if email exists', async () => {
    const res = await request.post('/auth/password-reset/request').send({ email: 'nobody@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account/i);
  });

  it('should reject invalid token for password reset confirm', async () => {
    const res = await request.post('/auth/password-reset/confirm').send({ token: 'bad', newPassword: 'newPassword123!' });
    expect(res.status).toBe(400);
  });

  // --- Email verification ---

  it('should reject invalid token for email verification', async () => {
    const res = await request.post('/auth/verify-email').send({ token: 'badtoken' });
    expect(res.status).toBe(400);
  });

  // --- Email delivery & link format ---

  it('should send verification email with /app/ link on sign-up', async () => {
    await clearMailpit();
    await signUp('linktest@test.com', 'Password123!');

    const msgs = await getMailpitMessages('linktest@test.com');
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    const verifyMsg = msgs.find(m => m.Subject.includes('Verify'));
    expect(verifyMsg).toBeTruthy();
    const body = await getMailpitMessageBody(verifyMsg!.ID);
    expect(body).toContain('/app/verify-email?token=');
  });

  it('should send magic link email with /app/ link for existing user', async () => {
    await signUp('magicuser@test.com', 'Password123!');
    await clearMailpit();

    await request.post('/auth/magic-link/request').send({ email: 'magicuser@test.com' });

    const msgs = await getMailpitMessages('magicuser@test.com');
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    const magicMsg = msgs.find(m => m.Subject.includes('Sign in'));
    expect(magicMsg).toBeTruthy();
    const body = await getMailpitMessageBody(magicMsg!.ID);
    expect(body).toContain('/app/magic-link?token=');
  });

  it('should NOT send magic link email for non-existent user', async () => {
    await clearMailpit();

    await request.post('/auth/magic-link/request').send({ email: 'ghost@test.com' });

    const msgs = await getMailpitMessages('ghost@test.com');
    expect(msgs).toHaveLength(0);
  });

  it('should send password reset email with /app/ link for existing user', async () => {
    await signUp('resetuser@test.com', 'Password123!');
    await clearMailpit();

    await request.post('/auth/password-reset/request').send({ email: 'resetuser@test.com' });

    const msgs = await getMailpitMessages('resetuser@test.com');
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    const resetMsg = msgs.find(m => m.Subject.includes('Reset'));
    expect(resetMsg).toBeTruthy();
    const body = await getMailpitMessageBody(resetMsg!.ID);
    expect(body).toContain('/app/reset-password?token=');
  });

  // --- Sign-out ---

  it('should sign out and invalidate session', async () => {
    const { res: signUpRes } = await signUp('alice@test.com', 'Password123!');
    const token = extractRefreshToken(signUpRes)!;

    // Sign out
    const signOutRes = await request
      .post('/auth/signout')
      .set('Cookie', `refresh_token=${token}`);
    expect(signOutRes.status).toBe(200);

    // Session should be invalid now
    const meRes = await request
      .get('/auth/me')
      .set('Cookie', `refresh_token=${token}`);
    expect(meRes.status).toBe(401);
  });

  // --- Get current user (/auth/me) ---

  it('should return user profile for authenticated request', async () => {
    const { res: signUpRes } = await signUp('alice@test.com', 'Password123!', 'Alice');
    const token = extractRefreshToken(signUpRes)!;

    const meRes = await request.get('/auth/me').set('Cookie', `refresh_token=${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('alice@test.com');
    expect(meRes.body.user.displayName).toBe('Alice');
  });

  it('should return 401 for unauthenticated /auth/me', async () => {
    const res = await request.get('/auth/me');
    expect(res.status).toBe(401);
  });

  // --- Update profile ---

  it('should update display name', async () => {
    const { res: signUpRes } = await signUp('alice@test.com', 'Password123!');
    const token = extractRefreshToken(signUpRes)!;

    const updateRes = await request
      .put('/auth/me')
      .set('Cookie', `refresh_token=${token}`)
      .send({ displayName: 'Alice Wonderland' });
    expect(updateRes.status).toBe(200);

    const meRes = await request.get('/auth/me').set('Cookie', `refresh_token=${token}`);
    expect(meRes.body.user.displayName).toBe('Alice Wonderland');
  });

  // --- Change password ---

  it('should change password with correct current password', async () => {
    const { res: signUpRes } = await signUp('alice@test.com', 'Password123!');
    const token = extractRefreshToken(signUpRes)!;

    const res = await request
      .put('/auth/password')
      .set('Cookie', `refresh_token=${token}`)
      .send({ currentPassword: 'Password123!', newPassword: 'NewPassword456!', confirmPassword: 'NewPassword456!' });
    expect(res.status).toBe(200);

    // Old password should fail
    const { res: oldRes } = await signIn('alice@test.com', 'Password123!');
    expect(oldRes.status).toBe(401);

    // New password should work
    const { res: newRes } = await signIn('alice@test.com', 'NewPassword456!');
    expect(newRes.status).toBe(200);
  });

  it('should reject change password with wrong current password', async () => {
    const { res: signUpRes } = await signUp('alice@test.com', 'Password123!');
    const token = extractRefreshToken(signUpRes)!;

    const res = await request
      .put('/auth/password')
      .set('Cookie', `refresh_token=${token}`)
      .send({ currentPassword: 'WrongPassword1!', newPassword: 'NewPassword456!', confirmPassword: 'NewPassword456!' });
    expect(res.status).toBe(401);
  });

  // --- Delete account ---

  it('should reject account deletion with wrong password', async () => {
    const { res: signUpRes } = await signUp('carol@test.com', 'Password123!');
    const token = extractRefreshToken(signUpRes)!;

    const res = await request
      .delete('/auth/account')
      .set('Cookie', `refresh_token=${token}`)
      .send({ password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('should delete account with correct password', async () => {
    const { res: signUpRes } = await signUp('dave@test.com', 'Password123!');
    const token = extractRefreshToken(signUpRes)!;

    const deleteRes = await request
      .delete('/auth/account')
      .set('Cookie', `refresh_token=${token}`)
      .send({ password: 'Password123!' });
    expect(deleteRes.status).toBe(200);

    // Sign-in should fail
    const { res: signInRes } = await signIn('dave@test.com', 'Password123!');
    expect(signInRes.status).toBe(401);
  });

  // --- hasPassword flag ---

  it('should return hasPassword: true for email/password accounts', async () => {
    const { res: signUpRes } = await signUp('alice@test.com', 'Password123!');
    const token = extractRefreshToken(signUpRes)!;

    const res = await request.get('/auth/me').set('Cookie', `refresh_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.hasPassword).toBe(true);
  });

  it('should return hasPassword: false for OAuth-only accounts', async () => {
    const { refreshToken } = await createOAuthUser('oauth@test.com');

    const res = await request.get('/auth/me').set('Cookie', `refresh_token=${refreshToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.hasPassword).toBe(false);
  });

  // --- Add password (OAuth-only account) ---

  it('should allow adding password without current password for OAuth-only accounts', async () => {
    const { refreshToken } = await createOAuthUser('oauth2@test.com');

    const res = await request
      .put('/auth/password')
      .set('Cookie', `refresh_token=${refreshToken}`)
      .send({ currentPassword: '', newPassword: 'newPassword123!', confirmPassword: 'newPassword123!' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('added');

    // Should be able to sign in with new password
    const { res: signInRes } = await signIn('oauth2@test.com', 'newPassword123!');
    expect(signInRes.status).toBe(200);
  });

  // --- Confirm password mismatch ---

  it('should reject password change when confirmPassword does not match', async () => {
    const { res: signUpRes } = await signUp('alice@test.com', 'Password123!');
    const token = extractRefreshToken(signUpRes)!;

    const res = await request
      .put('/auth/password')
      .set('Cookie', `refresh_token=${token}`)
      .send({ currentPassword: 'Password123!', newPassword: 'NewPassword456!', confirmPassword: 'Different789!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('match');
  });

  // --- Delete OAuth-only account with typed confirmation ---

  it('should delete OAuth-only account with DELETE confirmation', async () => {
    const { refreshToken } = await createOAuthUser('oauth3@test.com');

    const res = await request
      .delete('/auth/account')
      .set('Cookie', `refresh_token=${refreshToken}`)
      .send({ confirmation: 'DELETE' });
    expect(res.status).toBe(200);
  });

  it('should reject OAuth-only account deletion without correct confirmation', async () => {
    const { refreshToken } = await createOAuthUser('oauth4@test.com');

    const res = await request
      .delete('/auth/account')
      .set('Cookie', `refresh_token=${refreshToken}`)
      .send({ confirmation: 'wrong' });
    expect(res.status).toBe(400);
  });
});
