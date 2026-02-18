/**
 * OneDrive-specific API routes (folder browsing for notebook setup).
 * File CRUD goes through the generic source proxy (/api/sources/onedrive/*).
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getValidAccessToken } from '../services/token-refresh.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(requireAuth);

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// ── GET /api/onedrive/status — Check if user has OneDrive access ─────────

router.get('/status', async (req: Request, res: Response) => {
  try {
    const token = await getValidAccessToken(req.userId!, 'microsoft');
    if (!token) {
      res.json({ linked: false });
      return;
    }

    // Verify token works by fetching user profile
    const profileRes = await fetch(`${GRAPH_BASE}/me?$select=displayName`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (profileRes.ok) {
      const profile = (await profileRes.json()) as { displayName: string };
      res.json({ linked: true, displayName: profile.displayName });
    } else {
      res.json({ linked: false });
    }
  } catch (err) {
    logger.error('OneDrive status check failed', { error: (err as Error).message });
    res.json({ linked: false });
  }
});

// ── GET /api/onedrive/folders — Browse OneDrive folders ──────────────────

router.get('/folders', async (req: Request, res: Response) => {
  const token = await getValidAccessToken(req.userId!, 'microsoft');
  if (!token) {
    res.status(401).json({ error: 'No valid Microsoft credentials. Please link your Microsoft account.' });
    return;
  }

  const folderPath = (req.query.path as string) ?? '';

  try {
    // Build Graph API URL — root or subfolder
    let url: string;
    if (!folderPath) {
      url = `${GRAPH_BASE}/me/drive/root/children?$filter=folder ne null&$select=name,folder,parentReference&$top=100`;
    } else {
      const encodedPath = encodeURIComponent(folderPath).replace(/%2F/g, '/');
      url = `${GRAPH_BASE}/me/drive/root:/${encodedPath}:/children?$filter=folder ne null&$select=name,folder,parentReference&$top=100`;
    }

    const graphRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!graphRes.ok) {
      const body = await graphRes.text();
      logger.error('OneDrive folder listing failed', { status: graphRes.status, body });
      res.status(graphRes.status === 401 ? 401 : 502).json({ error: 'Failed to list OneDrive folders' });
      return;
    }

    const data = (await graphRes.json()) as {
      value: Array<{
        name: string;
        folder?: { childCount: number };
        parentReference?: { path: string };
      }>;
    };

    const folders = data.value
      .filter((item) => item.folder)
      .map((item) => ({
        name: item.name,
        path: folderPath ? `${folderPath}/${item.name}` : item.name,
        childCount: item.folder!.childCount,
      }));

    res.json(folders);
  } catch (err) {
    logger.error('OneDrive folder browse error', { error: (err as Error).message });
    res.status(502).json({ error: 'Failed to browse OneDrive folders' });
  }
});

export default router;
