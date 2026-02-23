import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../services/featureFlags.js';
import { sendInvite, acceptInvite, revokeAccess, getMembers, updateMemberRole } from '../services/sharing.js';
import { createShareLink, revokeShareLink, toggleLinkVisibility, getShareLinks } from '../services/shareLinks.js';
import { sendShareInviteEmail } from '../lib/email.js';
import { query } from '../db/pool.js';

const router = Router();

// ── Invites ──────────────────────────────────────────────────────────────

// POST /api/cloud/notebooks/:id/invites — Send invite
router.post('/notebooks/:id/invites', requireAuth, requireFeature('cloud_sharing'), async (req: Request, res: Response) => {
  const { email, permission } = req.body;
  if (!email || !permission || !['editor', 'viewer'].includes(permission)) {
    res.status(400).json({ error: 'Valid email and permission (editor/viewer) required' });
    return;
  }

  try {
    const invite = await sendInvite(req.params.id, req.userId!, email, permission);

    // Get owner name for email
    const ownerResult = await query<{ display_name: string }>(
      'SELECT display_name FROM users WHERE id = $1',
      [req.userId!],
    );
    const notebookResult = await query<{ name: string }>(
      'SELECT name FROM notebooks WHERE id = $1',
      [req.params.id],
    );

    // Send invite email (fire-and-forget)
    const ownerName = ownerResult.rows[0]?.display_name ?? 'Someone';
    const notebookName = notebookResult.rows[0]?.name ?? 'a notebook';
    sendShareInviteEmail(email, ownerName, notebookName, invite.token).catch(() => {});

    res.status(201).json({
      invite: { id: invite.id, email: invite.email, permission: invite.permission, expiresAt: invite.expiresAt },
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// GET /api/cloud/notebooks/:id/invites — List pending invites
router.get('/notebooks/:id/invites', requireAuth, requireFeature('cloud_sharing'), async (req: Request, res: Response) => {
  const members = await getMembers(req.params.id);
  const pending = members.filter(m => !m.accepted);
  res.json({ invites: pending });
});

// DELETE /api/cloud/notebooks/:id/invites/:inviteId — Revoke pending invite
router.delete('/notebooks/:id/invites/:inviteId', requireAuth, requireFeature('cloud_sharing'), async (req: Request, res: Response) => {
  await query(
    'UPDATE notebook_shares SET revoked_at = now() WHERE id = $1 AND notebook_id = $2',
    [req.params.inviteId, req.params.id],
  );
  res.json({ message: 'Invite revoked' });
});

// POST /api/cloud/invites/:token/accept — Accept invite
router.post('/invites/:token/accept', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await acceptInvite(req.params.token, req.userId!);
    res.json({ notebookId: result.notebookId, message: 'Invite accepted' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ── Members ──────────────────────────────────────────────────────────────

// GET /api/cloud/notebooks/:id/members — List members
router.get('/notebooks/:id/members', requireAuth, requireFeature('cloud_sharing'), async (req: Request, res: Response) => {
  const members = await getMembers(req.params.id);
  res.json({ members });
});

// PATCH /api/cloud/notebooks/:id/members/:userId — Change role
router.patch('/notebooks/:id/members/:userId', requireAuth, requireFeature('cloud_sharing'), async (req: Request, res: Response) => {
  const { permission } = req.body;
  if (!permission || !['editor', 'viewer'].includes(permission)) {
    res.status(400).json({ error: 'Valid permission (editor/viewer) required' });
    return;
  }

  try {
    await updateMemberRole(req.params.id, req.userId!, req.params.userId, permission);
    res.json({ message: 'Role updated' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// DELETE /api/cloud/notebooks/:id/members/:userId — Remove member
router.delete('/notebooks/:id/members/:userId', requireAuth, requireFeature('cloud_sharing'), async (req: Request, res: Response) => {
  try {
    await revokeAccess(req.params.id, req.userId!, req.params.userId);
    res.json({ message: 'Access revoked' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ── Share Links ──────────────────────────────────────────────────────────

// POST /api/cloud/notebooks/:id/share-links — Create share link
router.post('/notebooks/:id/share-links', requireAuth, requireFeature('cloud_sharing'), async (req: Request, res: Response) => {
  try {
    const link = await createShareLink(req.params.id, req.userId!, req.body.visibility);
    res.status(201).json({ link });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// GET /api/cloud/notebooks/:id/share-links — List share links
router.get('/notebooks/:id/share-links', requireAuth, requireFeature('cloud_sharing'), async (req: Request, res: Response) => {
  const links = await getShareLinks(req.params.id, req.userId!);
  res.json({ links });
});

// PATCH /api/cloud/share-links/:linkId — Toggle visibility
router.patch('/share-links/:linkId', requireAuth, requireFeature('cloud_sharing'), async (req: Request, res: Response) => {
  const { visibility } = req.body;
  if (!visibility || !['private', 'public'].includes(visibility)) {
    res.status(400).json({ error: 'Valid visibility (private/public) required' });
    return;
  }

  try {
    await toggleLinkVisibility(req.params.linkId, req.userId!, visibility);
    res.json({ message: 'Visibility updated' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /api/cloud/share-links/:linkId/revoke — Revoke link
router.post('/share-links/:linkId/revoke', requireAuth, requireFeature('cloud_sharing'), async (req: Request, res: Response) => {
  try {
    await revokeShareLink(req.params.linkId, req.userId!);
    res.json({ message: 'Link revoked' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
