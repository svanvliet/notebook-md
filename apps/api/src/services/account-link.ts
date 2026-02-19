import { query, getClient } from '../db/pool.js';
import type { OAuthUserProfile, OAuthTokens } from './oauth/types.js';
import { auditLog } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { encryptOptional } from '../lib/encryption.js';

interface LinkResult {
  userId: string;
  isNewUser: boolean;
  linked: boolean;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  avatarUrl: string | null;
}

/**
 * Handle OAuth sign-in / account linking.
 *
 * Rules (from requirements §2.3):
 * - If identity_link for (provider, providerId) exists → sign in to that user
 * - If no link exists but email matches a verified email on an existing user:
 *   - OAuth↔OAuth auto-merge: link the new provider if the existing user
 *     already has at least one OAuth link AND both emails are verified
 *   - Email+password ↔ OAuth: NEVER auto-merge (user must manually link)
 * - If no match at all → create new user + identity_link
 */
export async function handleOAuthLogin(
  provider: string,
  profile: OAuthUserProfile,
  tokens: OAuthTokens,
  opts: { ip?: string; userAgent?: string } = {},
): Promise<LinkResult> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Check for existing identity link
    const existingLink = await client.query<{ user_id: string }>(
      'SELECT user_id FROM identity_links WHERE provider = $1 AND provider_user_id = $2',
      [provider, profile.providerId],
    );

    if (existingLink.rows.length > 0) {
      const userId = existingLink.rows[0].user_id;
      // Update tokens
      await client.query(
        `UPDATE identity_links SET access_token_enc = $1, refresh_token_enc = $2, token_expires_at = $3, scopes = $4, provider_email = $5, updated_at = now()
         WHERE provider = $6 AND provider_user_id = $7`,
        [encryptOptional(tokens.accessToken), encryptOptional(tokens.refreshToken), tokens.expiresAt ?? null, tokens.scopes ?? null, profile.email, provider, profile.providerId],
      );

      // Update user avatar/name if still default
      await client.query(
        `UPDATE users SET avatar_url = COALESCE(avatar_url, $1), updated_at = now() WHERE id = $2`,
        [profile.avatarUrl, userId],
      );

      const user = await client.query<{ display_name: string; email: string; email_verified: boolean; avatar_url: string | null }>(
        'SELECT display_name, email, email_verified, avatar_url FROM users WHERE id = $1',
        [userId],
      );

      await client.query('COMMIT');

      await auditLog({ userId, action: 'sign_in', details: { method: 'oauth', provider }, ipAddress: opts.ip, userAgent: opts.userAgent });

      return {
        userId,
        isNewUser: false,
        linked: false,
        displayName: user.rows[0].display_name,
        email: user.rows[0].email,
        emailVerified: user.rows[0].email_verified,
        avatarUrl: user.rows[0].avatar_url,
      };
    }

    // 2. Check if email matches an existing user (by users.email OR identity_links.provider_email)
    if (profile.email && profile.emailVerified) {
      const emailLower = profile.email.toLowerCase();

      // First check users.email
      let emailMatch = await client.query<{ id: string; email_verified: boolean; password_hash: string | null; display_name: string; email: string; avatar_url: string | null }>(
        'SELECT id, email_verified, password_hash, display_name, email, avatar_url FROM users WHERE email = $1',
        [emailLower],
      );

      // If no match on users.email, check identity_links.provider_email
      if (emailMatch.rows.length === 0) {
        const linkMatch = await client.query<{ user_id: string }>(
          'SELECT DISTINCT user_id FROM identity_links WHERE lower(provider_email) = $1',
          [emailLower],
        );
        if (linkMatch.rows.length === 1) {
          emailMatch = await client.query<{ id: string; email_verified: boolean; password_hash: string | null; display_name: string; email: string; avatar_url: string | null }>(
            'SELECT id, email_verified, password_hash, display_name, email, avatar_url FROM users WHERE id = $1',
            [linkMatch.rows[0].user_id],
          );
        }
      }

      if (emailMatch.rows.length > 0) {
        const existingUser = emailMatch.rows[0];

        // Check if existing user has OAuth links (OAuth↔OAuth auto-merge)
        const hasOAuthLinks = await client.query(
          'SELECT 1 FROM identity_links WHERE user_id = $1 LIMIT 1',
          [existingUser.id],
        );

        if (hasOAuthLinks.rows.length > 0 && existingUser.email_verified) {
          // Auto-merge: add new provider link to existing user
          await client.query(
            `INSERT INTO identity_links (user_id, provider, provider_user_id, provider_email, access_token_enc, refresh_token_enc, token_expires_at, scopes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [existingUser.id, provider, profile.providerId, profile.email, encryptOptional(tokens.accessToken), encryptOptional(tokens.refreshToken), tokens.expiresAt ?? null, tokens.scopes ?? null],
          );

          await client.query('COMMIT');

          logger.info('OAuth auto-merge: linked new provider to existing user', { userId: existingUser.id, provider });
          await auditLog({ userId: existingUser.id, action: 'link_provider', details: { provider, autoMerge: true }, ipAddress: opts.ip, userAgent: opts.userAgent });

          return {
            userId: existingUser.id,
            isNewUser: false,
            linked: true,
            displayName: existingUser.display_name,
            email: existingUser.email,
            emailVerified: existingUser.email_verified,
            avatarUrl: existingUser.avatar_url,
          };
        }

        // Email+password ↔ OAuth: do NOT auto-merge.
        // Redirect user to sign in with password, then link from settings.
        await client.query('ROLLBACK');
        const err = new Error('ACCOUNT_EXISTS_EMAIL_PASSWORD');
        (err as any).code = 'ACCOUNT_EXISTS_EMAIL_PASSWORD';
        throw err;
      }
    }

    // 3. Create new user + identity link
    const newUser = await client.query<{ id: string }>(
      `INSERT INTO users (display_name, email, email_verified, avatar_url)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [profile.displayName, profile.email?.toLowerCase() ?? null, profile.emailVerified, profile.avatarUrl],
    );
    const userId = newUser.rows[0].id;

    await client.query(
      `INSERT INTO identity_links (user_id, provider, provider_user_id, provider_email, access_token_enc, refresh_token_enc, token_expires_at, scopes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, provider, profile.providerId, profile.email, encryptOptional(tokens.accessToken), encryptOptional(tokens.refreshToken), tokens.expiresAt ?? null, tokens.scopes ?? null],
    );

    await client.query('COMMIT');

    await auditLog({ userId, action: 'sign_up', details: { method: 'oauth', provider }, ipAddress: opts.ip, userAgent: opts.userAgent });

    return {
      userId,
      isNewUser: true,
      linked: false,
      displayName: profile.displayName,
      email: profile.email?.toLowerCase() ?? null,
      emailVerified: profile.emailVerified,
      avatarUrl: profile.avatarUrl,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Manually link an OAuth provider to an existing user (from settings).
 * Requires the user to be signed in.
 */
export async function linkProviderToUser(
  userId: string,
  provider: string,
  profile: OAuthUserProfile,
  tokens: OAuthTokens,
  opts: { ip?: string; userAgent?: string } = {},
): Promise<void> {
  // Check if this provider account is already linked to another user
  const existing = await query<{ user_id: string }>(
    'SELECT user_id FROM identity_links WHERE provider = $1 AND provider_user_id = $2',
    [provider, profile.providerId],
  );

  if (existing.rows.length > 0) {
    if (existing.rows[0].user_id === userId) {
      // Already linked to this user — just update tokens
      await query(
        `UPDATE identity_links SET access_token_enc = $1, refresh_token_enc = $2, token_expires_at = $3, scopes = $4, updated_at = now()
         WHERE provider = $5 AND provider_user_id = $6`,
        [encryptOptional(tokens.accessToken), encryptOptional(tokens.refreshToken), tokens.expiresAt ?? null, tokens.scopes ?? null, provider, profile.providerId],
      );
      return;
    }
    throw new Error('This provider account is already linked to another user');
  }

  await query(
    `INSERT INTO identity_links (user_id, provider, provider_user_id, provider_email, access_token_enc, refresh_token_enc, token_expires_at, scopes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, provider, profile.providerId, profile.email, encryptOptional(tokens.accessToken), encryptOptional(tokens.refreshToken), tokens.expiresAt ?? null, tokens.scopes ?? null],
  );

  await auditLog({ userId, action: 'link_provider', details: { provider, manual: true }, ipAddress: opts.ip, userAgent: opts.userAgent });
}

/**
 * Unlink an OAuth provider from a user.
 * Fails if it's their only auth method (no password + no other provider links).
 */
export async function unlinkProvider(
  userId: string,
  provider: string,
  opts: { ip?: string; userAgent?: string } = {},
): Promise<void> {
  // Check if user has a password or other links
  const user = await query<{ password_hash: string | null }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId],
  );
  const otherLinks = await query(
    'SELECT id FROM identity_links WHERE user_id = $1 AND provider != $2',
    [userId, provider],
  );

  if (!user.rows[0]?.password_hash && otherLinks.rows.length === 0) {
    throw new Error('Cannot unlink your only sign-in method. Add a password or link another provider first.');
  }

  // Map OAuth provider to notebook source_type(s)
  const providerSourceTypes: Record<string, string[]> = {
    microsoft: ['onedrive'],
    google: ['google-drive'],
    github: ['github'],
  };
  const sourceTypes = providerSourceTypes[provider] ?? [];

  // Delete notebooks tied to this provider
  if (sourceTypes.length > 0) {
    const deleted = await query<{ id: string; name: string }>(
      `DELETE FROM notebooks WHERE user_id = $1 AND source_type = ANY($2) RETURNING id, name`,
      [userId, sourceTypes],
    );
    for (const nb of deleted.rows) {
      await auditLog({ userId, action: 'remove_notebook', details: { notebookId: nb.id, reason: 'provider_unlinked', provider }, ipAddress: opts.ip, userAgent: opts.userAgent });
    }
  }

  // For GitHub, also remove installations
  if (provider === 'github') {
    await query('DELETE FROM github_installations WHERE user_id = $1', [userId]);
  }

  await query(
    'DELETE FROM identity_links WHERE user_id = $1 AND provider = $2',
    [userId, provider],
  );

  await auditLog({ userId, action: 'unlink_provider', details: { provider }, ipAddress: opts.ip, userAgent: opts.userAgent });
}

/**
 * Get all linked providers for a user.
 */
export async function getUserProviders(userId: string): Promise<Array<{ provider: string; providerEmail: string | null; createdAt: Date }>> {
  const result = await query<{ provider: string; provider_email: string | null; created_at: Date }>(
    'SELECT provider, provider_email, created_at FROM identity_links WHERE user_id = $1 ORDER BY created_at',
    [userId],
  );
  return result.rows.map(r => ({ provider: r.provider, providerEmail: r.provider_email, createdAt: r.created_at }));
}
