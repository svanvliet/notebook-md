import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getUserPlan, getEntitlements, getUsage, getBannerState } from '../services/entitlements.js';

const router = Router();

// GET /api/entitlements/me — Current plan + entitlement values
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const plan = await getUserPlan(req.userId!);
  const entitlements = await getEntitlements(req.userId!);

  res.json({
    plan,
    entitlements: {
      maxCloudNotebooks: entitlements.maxCloudNotebooks,
      maxStorageBytes: entitlements.maxStorageBytes,
      maxDocSizeBytes: entitlements.maxDocSizeBytes,
    },
  });
});

export default router;
