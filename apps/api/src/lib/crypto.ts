import { randomBytes, createHash } from 'crypto';

/** Generate a cryptographically random token (URL-safe base64) */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 hash a token for storage (never store raw tokens) */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
