import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from './logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the 32-byte encryption key from the environment.
 * In production this should be loaded from a KMS; for dev we use ENCRYPTION_KEY env var.
 */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY not set');

  // If the key is exactly 32 bytes, use as-is; otherwise hash to 32 bytes
  if (Buffer.byteLength(raw, 'utf8') === 32) {
    return Buffer.from(raw, 'utf8');
  }
  // Hash longer/shorter keys to get exactly 32 bytes
  const { createHash } = require('crypto');
  return createHash('sha256').update(raw).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns: `iv:authTag:ciphertext` (all hex-encoded, colon-separated).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a string produced by encrypt().
 * Input format: `iv:authTag:ciphertext` (all hex-encoded).
 */
export function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Encrypt a value if non-null, return null otherwise.
 * Convenience wrapper for optional token fields.
 */
export function encryptOptional(value: string | null | undefined): string | null {
  if (!value) return null;
  return encrypt(value);
}

/**
 * Decrypt a value if non-null, return null otherwise.
 */
export function decryptOptional(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch (err) {
    // If decryption fails (e.g., plaintext from before encryption was added), return as-is
    logger.warn('Failed to decrypt token, returning raw value', { error: (err as Error).message });
    return value;
  }
}
