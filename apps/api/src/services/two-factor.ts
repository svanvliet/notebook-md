import { randomBytes } from 'crypto';
import * as OTPAuth from 'otpauth';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { redis } from '../lib/redis.js';
import { send2faCode } from '../lib/email.js';

const ISSUER = 'Notebook.md';
const BCRYPT_COST = 12;
const RECOVERY_CODE_COUNT = 10;
const EMAIL_CODE_TTL_SECONDS = 300; // 5 minutes
const CHALLENGE_TOKEN_TTL_SECONDS = 300; // 5 minutes

function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? process.env.ENCRYPTION_KEY ?? 'dev-jwt-secret';
}

// ── Challenge tokens ─────────────────────────────────────────────────────────
// Short-lived JWT used between password verification and 2FA verification.

export interface ChallengePayload {
  sub: string;        // userId
  purpose: '2fa_challenge';
  rememberMe: boolean;
}

export function createChallengeToken(userId: string, rememberMe: boolean): string {
  return jwt.sign(
    { sub: userId, purpose: '2fa_challenge', rememberMe } as ChallengePayload,
    getJwtSecret(),
    { expiresIn: CHALLENGE_TOKEN_TTL_SECONDS },
  );
}

export function verifyChallengeToken(token: string): ChallengePayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as ChallengePayload;
    if (payload.purpose !== '2fa_challenge') return null;
    return payload;
  } catch {
    return null;
  }
}

// ── TOTP setup ───────────────────────────────────────────────────────────────

export async function setupTotp(userId: string): Promise<{ secret: string; uri: string }> {
  // Fetch user email for the TOTP label
  const userResult = await query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length === 0) throw new Error('User not found');

  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: userResult.rows[0].email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });

  const secretBase32 = totp.secret.base32;

  // Store the encrypted secret as pending (don't enable yet)
  await query(
    'UPDATE users SET totp_secret_enc = $1 WHERE id = $2',
    [encrypt(secretBase32), userId],
  );

  return { secret: secretBase32, uri: totp.toString() };
}

// ── TOTP enable (verify first code + generate recovery codes) ────────────────

export async function enableTotp(userId: string, code: string): Promise<{ recoveryCodes: string[] } | null> {
  const userResult = await query<{ totp_secret_enc: string | null }>(
    'SELECT totp_secret_enc FROM users WHERE id = $1',
    [userId],
  );
  if (userResult.rows.length === 0 || !userResult.rows[0].totp_secret_enc) return null;

  const secretBase32 = decrypt(userResult.rows[0].totp_secret_enc);

  // Verify the code
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) return null;

  // Generate recovery codes and hash normalized versions
  const recoveryCodes = generateRecoveryCodes();
  const recoveryHashes = await Promise.all(
    recoveryCodes.map((c) => bcryptjs.hash(normalizeCode(c), BCRYPT_COST)),
  );

  // Enable 2FA
  await query(
    'UPDATE users SET totp_enabled = true, recovery_codes_hash = $1 WHERE id = $2',
    [JSON.stringify(recoveryHashes), userId],
  );

  return { recoveryCodes };
}

// ── Enable email-based 2FA ───────────────────────────────────────────────────

export async function enableEmail2fa(userId: string): Promise<{ recoveryCodes: string[] }> {
  const recoveryCodes = generateRecoveryCodes();
  const recoveryHashes = await Promise.all(
    recoveryCodes.map((c) => bcryptjs.hash(normalizeCode(c), BCRYPT_COST)),
  );

  // Enable 2FA without TOTP secret (email method)
  await query(
    'UPDATE users SET totp_enabled = true, totp_secret_enc = NULL, recovery_codes_hash = $1 WHERE id = $2',
    [JSON.stringify(recoveryHashes), userId],
  );

  return { recoveryCodes };
}

// ── Disable 2FA ──────────────────────────────────────────────────────────────

export async function disable2fa(userId: string): Promise<void> {
  await query(
    'UPDATE users SET totp_enabled = false, totp_secret_enc = NULL, recovery_codes_hash = NULL WHERE id = $1',
    [userId],
  );
}

// ── Get 2FA status ───────────────────────────────────────────────────────────

export async function get2faStatus(userId: string): Promise<{ enabled: boolean; method: 'totp' | 'email' | null }> {
  const result = await query<{ totp_enabled: boolean; totp_secret_enc: string | null }>(
    'SELECT totp_enabled, totp_secret_enc FROM users WHERE id = $1',
    [userId],
  );
  if (result.rows.length === 0) return { enabled: false, method: null };
  const { totp_enabled, totp_secret_enc } = result.rows[0];
  if (!totp_enabled) return { enabled: false, method: null };
  return { enabled: true, method: totp_secret_enc ? 'totp' : 'email' };
}

// ── Verify TOTP code ─────────────────────────────────────────────────────────

export async function verifyTotpCode(userId: string, code: string): Promise<boolean> {
  const result = await query<{ totp_secret_enc: string | null }>(
    'SELECT totp_secret_enc FROM users WHERE id = $1 AND totp_enabled = true',
    [userId],
  );
  if (result.rows.length === 0 || !result.rows[0].totp_secret_enc) return false;

  const secretBase32 = decrypt(result.rows[0].totp_secret_enc);
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

// ── Email 2FA codes (stored in Redis) ────────────────────────────────────────

export async function sendEmail2faCode(userId: string): Promise<boolean> {
  const result = await query<{ email: string }>(
    'SELECT email FROM users WHERE id = $1 AND totp_enabled = true',
    [userId],
  );
  if (result.rows.length === 0) return false;

  const code = generateEmailCode();
  await redis.set(`2fa:email:${userId}`, code, 'EX', EMAIL_CODE_TTL_SECONDS);
  await send2faCode(result.rows[0].email, code);
  return true;
}

export async function verifyEmail2faCode(userId: string, code: string): Promise<boolean> {
  const stored = await redis.get(`2fa:email:${userId}`);
  if (!stored || stored !== code) return false;

  // Delete after successful use
  await redis.del(`2fa:email:${userId}`);
  return true;
}

// ── Recovery codes ───────────────────────────────────────────────────────────

export async function verifyRecoveryCode(userId: string, code: string): Promise<boolean> {
  const result = await query<{ recovery_codes_hash: string | null }>(
    'SELECT recovery_codes_hash FROM users WHERE id = $1 AND totp_enabled = true',
    [userId],
  );
  if (result.rows.length === 0 || !result.rows[0].recovery_codes_hash) return false;

  const hashes: string[] = JSON.parse(result.rows[0].recovery_codes_hash);
  const normalized = normalizeCode(code);

  // Find and consume the matching code
  for (let i = 0; i < hashes.length; i++) {
    if (await bcryptjs.compare(normalized, hashes[i])) {
      // Remove the used code
      hashes.splice(i, 1);
      await query(
        'UPDATE users SET recovery_codes_hash = $1 WHERE id = $2',
        [JSON.stringify(hashes), userId],
      );
      return true;
    }
  }

  return false;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    // 8-character hex codes formatted as xxxx-xxxx
    const raw = randomBytes(4).toString('hex');
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

function generateEmailCode(): string {
  // 6-digit numeric code
  const num = randomBytes(4).readUInt32BE(0) % 1000000;
  return num.toString().padStart(6, '0');
}

/** Normalize a recovery code for consistent hashing/comparison */
function normalizeCode(code: string): string {
  return code.replace(/[\s-]/g, '').toLowerCase();
}
