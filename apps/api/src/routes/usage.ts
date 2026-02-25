import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getUsage, getBannerState, getEntitlements } from '../services/entitlements.js';

const router = Router();

// GET /api/usage/me — Usage counters + banner state
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const usage = await getUsage(req.userId!);
  const bannerState = await getBannerState(req.userId!);
  const entitlements = await getEntitlements(req.userId!);

  res.json({
    cloudNotebooks: usage.cloudNotebookCount,
    cloudNotebookCount: usage.cloudNotebookCount,
    storageBytesUsed: usage.cloudStorageBytes,
    storageLimit: entitlements.maxStorageBytes,
    bannerState,
  });
});

export default router;
