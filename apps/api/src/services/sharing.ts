import { query } from '../db/pool.js';
import { generateToken, hashToken } from '../lib/crypto.js';
import { auditLog } from '../lib/audit.js';

const INVITE_EXPIRY_DAYS = 7;

export interface Invite {
  id: string;
  notebookId: string;
  email: string;
  permission: string;
  token: string;
  expiresAt: Date;
}

export async function sendInvite(
  notebookId: string,
  ownerUserId: string,
  email: string,
  permission: 'editor' | 'viewer',
): Promise<Invite> {
  // Verify caller is owner
  const notebook = await query<{ user_id: string; name: string }>(
    'SELECT user_id, name FROM notebooks WHERE id = $1',
    [notebookId],
  );
  if (notebook.rows.length === 0 || notebook.rows[0].user_id !== ownerUserId) {
    throw new Error('Only the notebook owner can send invites');
  }

  // Check if user already has access
  const existing = await query(
    'SELECT id FROM notebook_shares WHERE notebook_id = $1 AND shared_with_email = $2 AND revoked_at IS NULL',
    [notebookId, email.toLowerCase()],
  );
  if (existing.rows.length > 0) {
    throw new Error('User already has access or a pending invite');
  }

  // Also check by user_id if recipient has an account
  const recipientUser = await query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  if (recipientUser.rows.length > 0) {
    const existingByUser = await query(
      'SELECT id FROM notebook_shares WHERE notebook_id = $1 AND shared_with_user_id = $2 AND revoked_at IS NULL',
      [notebookId, recipientUser.rows[0].id],
    );
    if (existingByUser.rows.length > 0) {
      throw new Error('User already has access');
    }
  }

  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

  const result = await query<{ id: string }>(
    `INSERT INTO notebook_shares (notebook_id, owner_user_id, shared_with_email, permission, invite_token, invite_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [notebookId, ownerUserId, email.toLowerCase(), permission, hashToken(token), expiresAt],
  );

  await auditLog({
    userId: ownerUserId,
    action: 'share_invite_sent',
    details: { notebookId, email: email.toLowerCase(), permission },
  });

  return {
    id: result.rows[0].id,
    notebookId,
    email: email.toLowerCase(),
    permission,
    token,
    expiresAt,
  };
}

export async function acceptInvite(token: string, userId: string): Promise<{ notebookId: string }> {
  const tokenHash = hashToken(token);
  const result = await query<{
    id: string;
    notebook_id: string;
    accepted_at: Date | null;
    revoked_at: Date | null;
    invite_expires_at: Date;
  }>(
    'SELECT id, notebook_id, accepted_at, revoked_at, invite_expires_at FROM notebook_shares WHERE invite_token = $1',
    [tokenHash],
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid invite token');
  }

  const share = result.rows[0];
  if (share.accepted_at) throw new Error('Invite already accepted');
  if (share.revoked_at) throw new Error('Invite has been revoked');
  if (new Date(share.invite_expires_at) < new Date()) throw new Error('Invite has expired');

  await query(
    'UPDATE notebook_shares SET shared_with_user_id = $1, accepted_at = now() WHERE id = $2',
    [userId, share.id],
  );

  await auditLog({
    userId,
    action: 'share_invite_accepted',
    details: { notebookId: share.notebook_id, shareId: share.id },
  });

  return { notebookId: share.notebook_id };
}

export async function revokeAccess(
  notebookId: string,
  ownerUserId: string,
  targetUserId: string,
): Promise<void> {
  // Verify caller is owner
  const notebook = await query<{ user_id: string }>(
    'SELECT user_id FROM notebooks WHERE id = $1',
    [notebookId],
  );
  if (notebook.rows.length === 0 || notebook.rows[0].user_id !== ownerUserId) {
    throw new Error('Only the notebook owner can revoke access');
  }

  // Can't revoke own access
  if (targetUserId === ownerUserId) {
    throw new Error('Cannot revoke own access');
  }

  const result = await query(
    'UPDATE notebook_shares SET revoked_at = now() WHERE notebook_id = $1 AND shared_with_user_id = $2 AND revoked_at IS NULL',
    [notebookId, targetUserId],
  );

  if (result.rowCount === 0) {
    throw new Error('Share not found');
  }

  await auditLog({
    userId: ownerUserId,
    action: 'share_access_revoked',
    details: { notebookId, targetUserId },
  });
}

export async function getMembers(notebookId: string) {
  const result = await query<{
    id: string;
    shared_with_user_id: string | null;
    shared_with_email: string | null;
    permission: string;
    accepted_at: Date | null;
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
  }>(
    `SELECT ns.id, ns.shared_with_user_id, ns.shared_with_email, ns.permission, ns.accepted_at,
            u.display_name, u.avatar_url, u.email
     FROM notebook_shares ns
     LEFT JOIN users u ON ns.shared_with_user_id = u.id
     WHERE ns.notebook_id = $1 AND ns.revoked_at IS NULL
     ORDER BY ns.created_at`,
    [notebookId],
  );

  return result.rows.map(r => ({
    id: r.id,
    userId: r.shared_with_user_id,
    email: r.email || r.shared_with_email,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    permission: r.permission,
    accepted: !!r.accepted_at,
  }));
}

export async function updateMemberRole(
  notebookId: string,
  ownerUserId: string,
  targetUserId: string,
  newPermission: 'editor' | 'viewer',
): Promise<void> {
  const notebook = await query<{ user_id: string }>(
    'SELECT user_id FROM notebooks WHERE id = $1',
    [notebookId],
  );
  if (notebook.rows.length === 0 || notebook.rows[0].user_id !== ownerUserId) {
    throw new Error('Only the notebook owner can change roles');
  }

  await query(
    'UPDATE notebook_shares SET permission = $1 WHERE notebook_id = $2 AND shared_with_user_id = $3 AND revoked_at IS NULL',
    [newPermission, notebookId, targetUserId],
  );
}
