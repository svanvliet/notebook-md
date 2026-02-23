import { Router } from 'express';
import type { Request, Response } from 'express';
import archiver from 'archiver';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../services/featureFlags.js';
import { query } from '../db/pool.js';
import { decrypt } from '../lib/encryption.js';

const router = Router();

// GET /api/cloud/notebooks/:id/export — Download as .zip
router.get('/notebooks/:id/export', requireAuth, requireFeature('cloud_notebooks'), async (req: Request, res: Response) => {
  const notebookId = req.params.id;

  // Verify access (owner or shared member)
  const access = await query<{ permission: string }>(
    `SELECT permission FROM notebook_shares
     WHERE notebook_id = $1 AND shared_with_user_id = $2 AND revoked_at IS NULL`,
    [notebookId, req.userId!],
  );

  if (access.rows.length === 0) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  // Get notebook name
  const notebook = await query<{ name: string }>(
    'SELECT name FROM notebooks WHERE id = $1',
    [notebookId],
  );

  if (notebook.rows.length === 0) {
    res.status(404).json({ error: 'Notebook not found' });
    return;
  }

  const name = notebook.rows[0].name.replace(/[^a-zA-Z0-9_-]/g, '_');

  // Get all documents
  const docs = await query<{ path: string; content_enc: string | null }>(
    'SELECT path, content_enc FROM cloud_documents WHERE notebook_id = $1 ORDER BY path',
    [notebookId],
  );

  // Create zip
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  for (const doc of docs.rows) {
    const content = doc.content_enc ? decrypt(doc.content_enc) : '';
    archive.append(content, { name: doc.path });
  }

  await archive.finalize();
});

export default router;
