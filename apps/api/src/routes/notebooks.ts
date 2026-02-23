import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';
import { canCreateCloudNotebook } from '../services/entitlements.js';
import { incrementNotebookCount, decrementNotebookCount, updateStorageUsage } from '../services/usageAccounting.js';
import type { Request, Response } from 'express';

const router = Router();

// GET /api/notebooks — List user's notebooks
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const result = await query<{
    id: string;
    name: string;
    source_type: string;
    source_config: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
  }>(
    'SELECT id, name, source_type, source_config, created_at, updated_at FROM notebooks WHERE user_id = $1 ORDER BY name',
    [req.userId!],
  );

  res.json({
    notebooks: result.rows.map(r => ({
      id: r.id,
      name: r.name,
      sourceType: r.source_type,
      sourceConfig: r.source_config,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

// POST /api/notebooks — Create a notebook
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { name, sourceType, sourceConfig } = req.body;

  if (!name || !sourceType) {
    res.status(400).json({ error: 'Name and sourceType are required' });
    return;
  }

  // Cloud notebook entitlement check
  if (sourceType === 'cloud') {
    const check = await canCreateCloudNotebook(req.userId!);
    if (!check.allowed) {
      res.status(403).json({ error: check.reason });
      return;
    }
  }

  const result = await query<{ id: string; created_at: Date }>(
    `INSERT INTO notebooks (user_id, name, source_type, source_config) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [req.userId!, name, sourceType, sourceConfig ?? {}],
  );

  const notebookId = result.rows[0].id;

  // Cloud-specific post-creation
  if (sourceType === 'cloud') {
    await incrementNotebookCount(req.userId!);
    // Auto-create owner membership in notebook_shares
    await query(
      `INSERT INTO notebook_shares (notebook_id, owner_user_id, shared_with_user_id, permission, accepted_at)
       VALUES ($1, $2, $2, 'editor', now())`,
      [notebookId, req.userId!],
    );
  }

  await auditLog({
    userId: req.userId,
    action: sourceType === 'cloud' ? 'add_cloud_notebook' : 'add_notebook',
    details: { name, sourceType },
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? undefined,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({
    notebook: {
      id: notebookId,
      name,
      sourceType,
      sourceConfig: sourceConfig ?? {},
      createdAt: result.rows[0].created_at,
    },
  });
});

// PUT /api/notebooks/:id — Update a notebook
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  const notebookId = req.params.id as string;
  const { name, sourceConfig } = req.body;

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
  if (sourceConfig !== undefined) { updates.push(`source_config = $${idx++}`); values.push(JSON.stringify(sourceConfig)); }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  updates.push(`updated_at = now()`);
  values.push(notebookId, req.userId!);

  const result = await query(
    `UPDATE notebooks SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx}`,
    values,
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Notebook not found' });
    return;
  }

  res.json({ message: 'Notebook updated' });
});

// DELETE /api/notebooks/:id — Delete a notebook
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const notebookId = req.params.id as string;

  // Check if this is a Cloud notebook and compute storage to reclaim
  const notebookResult = await query<{ source_type: string }>(
    'SELECT source_type FROM notebooks WHERE id = $1 AND user_id = $2',
    [notebookId, req.userId!],
  );

  if (notebookResult.rows.length === 0) {
    res.status(404).json({ error: 'Notebook not found' });
    return;
  }

  const isCloud = notebookResult.rows[0].source_type === 'cloud';
  let totalBytes = 0;

  if (isCloud) {
    // Compute total storage to reclaim (documents + versions)
    const storageResult = await query<{ total: string }>(
      `SELECT COALESCE(SUM(size_bytes), 0) as total FROM (
         SELECT size_bytes FROM cloud_documents WHERE notebook_id = $1
         UNION ALL
         SELECT dv.size_bytes FROM document_versions dv
         JOIN cloud_documents cd ON dv.document_id = cd.id WHERE cd.notebook_id = $1
       ) combined`,
      [notebookId],
    );
    totalBytes = parseInt(storageResult.rows[0].total, 10);
  }

  // CASCADE deletes cloud_documents, notebook_shares, document_versions
  const result = await query(
    'DELETE FROM notebooks WHERE id = $1 AND user_id = $2',
    [notebookId, req.userId!],
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Notebook not found' });
    return;
  }

  // Update usage counters for cloud notebooks
  if (isCloud) {
    await decrementNotebookCount(req.userId!);
    if (totalBytes > 0) {
      await updateStorageUsage(req.userId!, -totalBytes);
    }
  }

  await auditLog({
    userId: req.userId,
    action: isCloud ? 'delete_cloud_notebook' : 'remove_notebook',
    details: { notebookId },
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? undefined,
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Notebook deleted' });
});

export default router;
