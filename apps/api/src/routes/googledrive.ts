/**
 * Google Drive–specific API routes.
 *
 * - GET /api/googledrive/status  — Check if user has linked Google account with Drive access
 * - GET /api/googledrive/folders — Browse Google Drive folders for notebook setup
 *
 * File CRUD goes through the generic source proxy (/api/sources/google-drive/*).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getValidAccessToken } from '../services/token-refresh.js';
import { logger } from '../lib/logger.js';

const router = Router();
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';

router.use(requireAuth);

// ── GET /api/googledrive/status ───────────────────────────────────────────

router.get('/status', async (req: Request, res: Response) => {
  try {
    const accessToken = await getValidAccessToken(req.userId!, 'google');
    if (!accessToken) {
      res.json({ linked: false });
      return;
    }

    // Quick check: try listing 1 file to confirm Drive scope
    const checkUrl = `${DRIVE_BASE}/files?pageSize=1&fields=files(id)`;
    const checkRes = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (checkRes.ok) {
      res.json({ linked: true });
    } else {
      res.json({ linked: false, reason: 'insufficient_scope' });
    }
  } catch (err) {
    logger.error('Google Drive status check failed', { error: (err as Error).message });
    res.json({ linked: false });
  }
});

// ── GET /api/googledrive/folders ──────────────────────────────────────────

router.get('/folders', async (req: Request, res: Response) => {
  const accessToken = await getValidAccessToken(req.userId!, 'google');
  if (!accessToken) {
    res.status(401).json({ error: 'No valid Google credentials. Please link your Google account.' });
    return;
  }

  const parentId = (req.query.parentId as string) || 'root';

  try {
    // List only folders within the parent
    const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const fields = 'files(id,name,mimeType)';
    const url = `${DRIVE_BASE}/files?q=${encodeURIComponent(q)}&fields=${fields}&pageSize=200&orderBy=name`;

    const driveRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!driveRes.ok) {
      const body = await driveRes.text();
      logger.error('Google Drive folders failed', { status: driveRes.status, body });
      res.status(502).json({ error: 'Failed to list Google Drive folders' });
      return;
    }

    const data = (await driveRes.json()) as {
      files: Array<{ id: string; name: string }>;
    };

    res.json(data.files.map((f) => ({
      id: f.id,
      name: f.name,
    })));
  } catch (err) {
    logger.error('Google Drive folders error', { error: (err as Error).message });
    res.status(502).json({ error: 'Failed to browse Google Drive' });
  }
});

export default router;
