import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { auditLog } from '../lib/audit.js';
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

  const result = await query<{ id: string; created_at: Date }>(
    `INSERT INTO notebooks (user_id, name, source_type, source_config) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [req.userId!, name, sourceType, sourceConfig ?? {}],
  );

  await auditLog({
    userId: req.userId,
    action: 'add_notebook',
    details: { name, sourceType },
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? undefined,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({
    notebook: {
      id: result.rows[0].id,
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

  const result = await query(
    'DELETE FROM notebooks WHERE id = $1 AND user_id = $2',
    [notebookId, req.userId!],
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Notebook not found' });
    return;
  }

  await auditLog({
    userId: req.userId,
    action: 'remove_notebook',
    details: { notebookId },
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? undefined,
    userAgent: req.headers['user-agent'],
  });

  res.json({ message: 'Notebook deleted' });
});

export default router;
