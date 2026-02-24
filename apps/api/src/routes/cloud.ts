import { Router } from 'express';
import type { Request, Response } from 'express';
import archiver from 'archiver';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../services/featureFlags.js';
import { query } from '../db/pool.js';
import { decrypt } from '../lib/encryption.js';

const router = Router();

// Helper: check if user is owner or has an active share on a notebook
async function hasNotebookAccess(notebookId: string, userId: string): Promise<{ hasAccess: boolean; permission: string }> {
  const owner = await query<{ user_id: string }>('SELECT user_id FROM notebooks WHERE id = $1', [notebookId]);
  if (owner.rows.length > 0 && owner.rows[0].user_id === userId) {
    return { hasAccess: true, permission: 'owner' };
  }
  const share = await query<{ permission: string }>(
    'SELECT permission FROM notebook_shares WHERE notebook_id = $1 AND shared_with_user_id = $2 AND revoked_at IS NULL AND accepted_at IS NOT NULL',
    [notebookId, userId],
  );
  if (share.rows.length > 0) {
    return { hasAccess: true, permission: share.rows[0].permission };
  }
  return { hasAccess: false, permission: '' };
}

// Helper: check if user is owner or has access via a document's notebook
async function hasDocumentAccess(docId: string, userId: string): Promise<{ hasAccess: boolean; permission: string }> {
  const doc = await query<{ notebook_id: string }>('SELECT notebook_id FROM cloud_documents WHERE id = $1', [docId]);
  if (doc.rows.length === 0) return { hasAccess: false, permission: '' };
  return hasNotebookAccess(doc.rows[0].notebook_id, userId);
}

// GET /api/cloud/notebooks/:id/export — Download as .zip
router.get('/notebooks/:id/export', requireAuth, requireFeature('cloud_notebooks'), async (req: Request, res: Response) => {
  const notebookId = req.params.id;

  // Verify access (owner or shared member)
  const { hasAccess } = await hasNotebookAccess(notebookId, req.userId!);
  if (!hasAccess) {
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

// ── Version History ────────────────────────────────────────────────────

// GET /api/cloud/documents/:docId/versions — List versions
router.get('/documents/:docId/versions', requireAuth, requireFeature('cloud_notebooks'), async (req: Request, res: Response) => {
  const docId = req.params.docId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = (page - 1) * limit;

  // Verify access via document → notebook (owner or shared member)
  const { hasAccess } = await hasDocumentAccess(docId, req.userId!);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const versions = await query<{
    id: string;
    version_number: number;
    content_enc: string | null;
    size_bytes: number;
    created_by: string;
    created_at: Date;
    display_name: string | null;
  }>(
    `SELECT dv.id, dv.version_number, dv.size_bytes, dv.created_by, dv.created_at, u.display_name
     FROM document_versions dv
     LEFT JOIN users u ON dv.created_by = u.id
     WHERE dv.document_id = $1
     ORDER BY dv.version_number DESC
     LIMIT $2 OFFSET $3`,
    [docId, limit, offset],
  );

  const total = await query<{ count: string }>(
    'SELECT count(*) FROM document_versions WHERE document_id = $1',
    [docId],
  );

  res.json({
    versions: versions.rows.map(v => ({
      id: v.id,
      versionNumber: v.version_number,
      sizeBytes: v.size_bytes,
      createdBy: v.display_name ?? 'Unknown',
      createdAt: v.created_at,
    })),
    total: parseInt(total.rows[0].count),
    page,
    limit,
  });
});

// GET /api/cloud/documents/:docId/versions/:versionId — Get version content
router.get('/documents/:docId/versions/:versionId', requireAuth, requireFeature('cloud_notebooks'), async (req: Request, res: Response) => {
  const { docId, versionId } = req.params;

  // Verify access
  const { hasAccess } = await hasDocumentAccess(docId, req.userId!);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const version = await query<{ content_enc: string | null; version_number: number; created_at: Date }>(
    'SELECT content_enc, version_number, created_at FROM document_versions WHERE id = $1 AND document_id = $2',
    [versionId, docId],
  );

  if (version.rows.length === 0) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }

  const content = version.rows[0].content_enc ? decrypt(version.rows[0].content_enc) : '';
  res.json({ content, versionNumber: version.rows[0].version_number, createdAt: version.rows[0].created_at });
});

// POST /api/cloud/documents/:docId/versions/:versionId/restore — Restore version
router.post('/documents/:docId/versions/:versionId/restore', requireAuth, requireFeature('cloud_notebooks'), async (req: Request, res: Response) => {
  const { docId, versionId } = req.params;

  // Verify editor access
  const { hasAccess, permission } = await hasDocumentAccess(docId, req.userId!);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (permission === 'viewer') {
    res.status(403).json({ error: 'Viewers cannot restore versions' });
    return;
  }

  // Get version content
  const version = await query<{ content_enc: string | null }>(
    'SELECT content_enc FROM document_versions WHERE id = $1 AND document_id = $2',
    [versionId, docId],
  );

  if (version.rows.length === 0) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }

  // Save current content as a new version before restoring
  const current = await query<{ content_enc: string | null }>(
    'SELECT content_enc FROM cloud_documents WHERE id = $1',
    [docId],
  );

  if (current.rows[0]) {
    const maxVer = await query<{ max: number | null }>(
      'SELECT max(version_number) as max FROM document_versions WHERE document_id = $1',
      [docId],
    );
    const nextVer = (maxVer.rows[0].max ?? 0) + 1;
    const sizeBytes = current.rows[0].content_enc ? Buffer.byteLength(current.rows[0].content_enc, 'utf-8') : 0;

    await query(
      `INSERT INTO document_versions (document_id, version_number, content_enc, size_bytes, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [docId, nextVer, current.rows[0].content_enc, sizeBytes, req.userId!],
    );
  }

  // Restore the old version content to the document
  await query(
    'UPDATE cloud_documents SET content_enc = $1, updated_at = now(), updated_by = $2 WHERE id = $3',
    [version.rows[0].content_enc, req.userId!, docId],
  );

  res.json({ message: 'Version restored' });
});

export default router;
