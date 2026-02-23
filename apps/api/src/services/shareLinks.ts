import { query } from '../db/pool.js';
import { generateToken } from '../lib/crypto.js';
import { auditLog } from '../lib/audit.js';

export interface ShareLink {
  id: string;
  notebookId: string;
  token: string;
  visibility: 'private' | 'public';
  isActive: boolean;
  createdAt: Date;
}

export async function createShareLink(
  notebookId: string,
  userId: string,
  visibility: 'private' | 'public' = 'private',
): Promise<ShareLink> {
  // Verify caller is owner
  const notebook = await query<{ user_id: string }>(
    'SELECT user_id FROM notebooks WHERE id = $1',
    [notebookId],
  );
  if (notebook.rows.length === 0 || notebook.rows[0].user_id !== userId) {
    throw new Error('Only the notebook owner can create share links');
  }

  const token = generateToken();

  const result = await query<{ id: string; created_at: Date }>(
    `INSERT INTO notebook_public_links (notebook_id, link_token, visibility, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [notebookId, token, visibility, userId],
  );

  await auditLog({
    userId,
    action: 'share_link_created',
    details: { notebookId, visibility },
  });

  return {
    id: result.rows[0].id,
    notebookId,
    token,
    visibility,
    isActive: true,
    createdAt: result.rows[0].created_at,
  };
}

export async function revokeShareLink(linkId: string, userId: string): Promise<void> {
  const result = await query<{ notebook_id: string }>(
    `SELECT npl.notebook_id FROM notebook_public_links npl
     JOIN notebooks n ON npl.notebook_id = n.id
     WHERE npl.id = $1 AND n.user_id = $2`,
    [linkId, userId],
  );

  if (result.rows.length === 0) {
    throw new Error('Share link not found or not authorized');
  }

  await query(
    'UPDATE notebook_public_links SET is_active = false, revoked_at = now() WHERE id = $1',
    [linkId],
  );

  await auditLog({
    userId,
    action: 'share_link_revoked',
    details: { linkId, notebookId: result.rows[0].notebook_id },
  });
}

export async function toggleLinkVisibility(
  linkId: string,
  userId: string,
  visibility: 'private' | 'public',
): Promise<void> {
  const result = await query(
    `UPDATE notebook_public_links SET visibility = $1
     WHERE id = $2 AND notebook_id IN (SELECT id FROM notebooks WHERE user_id = $3)`,
    [visibility, linkId, userId],
  );

  if (result.rowCount === 0) {
    throw new Error('Share link not found or not authorized');
  }
}

export async function resolvePublicLink(token: string) {
  const result = await query<{
    notebook_id: string;
    notebook_name: string;
    visibility: string;
    owner_name: string;
  }>(
    `SELECT npl.notebook_id, n.name as notebook_name, npl.visibility, u.display_name as owner_name
     FROM notebook_public_links npl
     JOIN notebooks n ON npl.notebook_id = n.id
     JOIN users u ON n.user_id = u.id
     WHERE npl.link_token = $1 AND npl.is_active = true AND npl.visibility = 'public'`,
    [token],
  );

  if (result.rows.length === 0) return null;

  return {
    notebookId: result.rows[0].notebook_id,
    notebookName: result.rows[0].notebook_name,
    ownerName: result.rows[0].owner_name,
  };
}

export async function getShareLinks(notebookId: string, userId: string) {
  const result = await query<{
    id: string;
    link_token: string;
    visibility: string;
    is_active: boolean;
    created_at: Date;
  }>(
    `SELECT npl.id, npl.link_token, npl.visibility, npl.is_active, npl.created_at
     FROM notebook_public_links npl
     JOIN notebooks n ON npl.notebook_id = n.id
     WHERE npl.notebook_id = $1 AND n.user_id = $2
     ORDER BY npl.created_at DESC`,
    [notebookId, userId],
  );

  return result.rows.map(r => ({
    id: r.id,
    token: r.link_token,
    visibility: r.visibility,
    isActive: r.is_active,
    createdAt: r.created_at,
  }));
}
