#!/usr/bin/env node
/**
 * Re-encrypt all AES-256-GCM encrypted columns in the database.
 *
 * Usage:
 *   node scripts/reencrypt-data.mjs <old-key> <new-key>
 *
 * This reads every encrypted value, decrypts with the old key, re-encrypts
 * with the new key, and updates the row — all inside a single transaction.
 *
 * Encrypted format: iv:authTag:ciphertext (hex-encoded, colon-separated)
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import pg from 'pg';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// ── helpers ──────────────────────────────────────────────────────────

function deriveKey(raw) {
  if (Buffer.byteLength(raw, 'utf8') === 32) return Buffer.from(raw, 'utf8');
  return createHash('sha256').update(raw).digest();
}

function decrypt(encrypted, keyBuf) {
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error(`Invalid encrypted format: ${encrypted.slice(0, 30)}…`);
  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, keyBuf, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encrypt(plaintext, keyBuf) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuf, iv, { authTagLength: AUTH_TAG_LENGTH });
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function isEncrypted(val) {
  if (!val) return false;
  const parts = val.split(':');
  return parts.length === 3 && /^[0-9a-f]{32}$/.test(parts[0]);
}

// ── main ─────────────────────────────────────────────────────────────

async function main() {
  const [,, oldKeyRaw, newKeyRaw] = process.argv;
  if (!oldKeyRaw || !newKeyRaw) {
    console.error('Usage: node scripts/reencrypt-data.mjs <old-key> <new-key>');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL not set');
    process.exit(1);
  }

  const oldKey = deriveKey(oldKeyRaw);
  const newKey = deriveKey(newKeyRaw);

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    // ── identity_links: access_token_enc, refresh_token_enc ──
    const { rows: links } = await client.query(
      `SELECT id, access_token_enc, refresh_token_enc FROM identity_links
       WHERE access_token_enc IS NOT NULL OR refresh_token_enc IS NOT NULL`
    );
    console.log(`Found ${links.length} identity_links rows to re-encrypt`);

    let linkUpdates = 0;
    for (const row of links) {
      let newAccess = row.access_token_enc;
      let newRefresh = row.refresh_token_enc;

      if (isEncrypted(row.access_token_enc)) {
        const plain = decrypt(row.access_token_enc, oldKey);
        newAccess = encrypt(plain, newKey);
      }
      if (isEncrypted(row.refresh_token_enc)) {
        const plain = decrypt(row.refresh_token_enc, oldKey);
        newRefresh = encrypt(plain, newKey);
      }

      if (newAccess !== row.access_token_enc || newRefresh !== row.refresh_token_enc) {
        await client.query(
          `UPDATE identity_links SET access_token_enc = $1, refresh_token_enc = $2 WHERE id = $3`,
          [newAccess, newRefresh, row.id]
        );
        linkUpdates++;
      }
    }
    console.log(`  → Updated ${linkUpdates} identity_links rows`);

    // ── users: totp_secret_enc ──
    const { rows: users } = await client.query(
      `SELECT id, totp_secret_enc FROM users WHERE totp_secret_enc IS NOT NULL`
    );
    console.log(`Found ${users.length} users rows with TOTP to re-encrypt`);

    let totpUpdates = 0;
    for (const row of users) {
      if (isEncrypted(row.totp_secret_enc)) {
        const plain = decrypt(row.totp_secret_enc, oldKey);
        const newEnc = encrypt(plain, newKey);
        await client.query(
          `UPDATE users SET totp_secret_enc = $1 WHERE id = $2`,
          [newEnc, row.id]
        );
        totpUpdates++;
      }
    }
    console.log(`  → Updated ${totpUpdates} users TOTP rows`);

    await client.query('COMMIT');
    console.log('✅ Re-encryption complete — all data committed');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Re-encryption failed — transaction rolled back');
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
