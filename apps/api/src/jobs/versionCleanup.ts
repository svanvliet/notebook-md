import { query } from '../db/pool.js';
import { logger } from '../lib/logger.js';

const MAX_VERSIONS_PER_DOC = 100;
const MAX_AGE_DAYS = 90;

/**
 * Clean up old document versions:
 * 1. Delete versions older than MAX_AGE_DAYS
 * 2. Keep at most MAX_VERSIONS_PER_DOC per document (newest)
 * 3. Update storage usage counters accordingly
 */
export async function runVersionCleanup(): Promise<{ deleted: number; reclaimedBytes: number }> {
  let totalDeleted = 0;
  let totalReclaimed = 0;

  // 1. Delete versions older than MAX_AGE_DAYS
  const aged = await query<{ id: string; size_bytes: number; document_id: string }>(
    `DELETE FROM document_versions
     WHERE created_at < now() - interval '${MAX_AGE_DAYS} days'
     RETURNING id, size_bytes, document_id`,
  );
  totalDeleted += aged.rowCount ?? 0;
  totalReclaimed += aged.rows.reduce((sum, r) => sum + (r.size_bytes ?? 0), 0);

  // 2. Delete excess versions (keep newest MAX_VERSIONS_PER_DOC per document)
  const excess = await query<{ id: string; size_bytes: number }>(
    `DELETE FROM document_versions WHERE id IN (
       SELECT dv.id FROM document_versions dv
       WHERE dv.version_number <= (
         SELECT dv2.version_number FROM document_versions dv2
         WHERE dv2.document_id = dv.document_id
         ORDER BY dv2.version_number DESC
         OFFSET ${MAX_VERSIONS_PER_DOC}
         LIMIT 1
       )
     )
     RETURNING id, size_bytes`,
  );
  totalDeleted += excess.rowCount ?? 0;
  totalReclaimed += excess.rows.reduce((sum, r) => sum + (r.size_bytes ?? 0), 0);

  // 3. Update storage usage counters for affected users
  if (totalReclaimed > 0) {
    // Recalculate from source of truth for all users with cloud notebooks
    await query(
      `UPDATE user_usage_counters SET counter_value = COALESCE(
         (SELECT SUM(cd.size_bytes) FROM cloud_documents cd
          JOIN notebooks n ON cd.notebook_id = n.id
          WHERE n.user_id = user_usage_counters.user_id)
       , 0) + COALESCE(
         (SELECT SUM(dv.size_bytes) FROM document_versions dv
          JOIN cloud_documents cd ON dv.document_id = cd.id
          JOIN notebooks n ON cd.notebook_id = n.id
          WHERE n.user_id = user_usage_counters.user_id)
       , 0)
       WHERE counter_key = 'cloud_storage_bytes'`,
    );
  }

  logger.info('Version cleanup completed', { deleted: totalDeleted, reclaimedBytes: totalReclaimed });
  return { deleted: totalDeleted, reclaimedBytes: totalReclaimed };
}
