import { query } from '../db/pool.js';
import { logger } from '../lib/logger.js';

/**
 * Reconcile user_usage_counters from the actual data in cloud_documents
 * and document_versions. Fixes any counter drift from crashes or partial transactions.
 */
export async function runUsageReconciliation(): Promise<{ usersUpdated: number }> {
  // Reconcile cloud_notebook_count
  const nbResult = await query(
    `UPDATE user_usage_counters SET counter_value = COALESCE(
       (SELECT COUNT(*) FROM notebooks n
        WHERE n.user_id = user_usage_counters.user_id AND n.source_type = 'cloud')
     , 0),
     updated_at = now()
     WHERE counter_key = 'cloud_notebook_count'`,
  );

  // Reconcile cloud_storage_bytes
  const storageResult = await query(
    `UPDATE user_usage_counters SET counter_value = COALESCE(
       (SELECT SUM(cd.size_bytes) FROM cloud_documents cd
        JOIN notebooks n ON cd.notebook_id = n.id
        WHERE n.user_id = user_usage_counters.user_id)
     , 0) + COALESCE(
       (SELECT SUM(dv.size_bytes) FROM document_versions dv
        JOIN cloud_documents cd ON dv.document_id = cd.id
        JOIN notebooks n ON cd.notebook_id = n.id
        WHERE n.user_id = user_usage_counters.user_id)
     , 0),
     updated_at = now()
     WHERE counter_key = 'cloud_storage_bytes'`,
  );

  const usersUpdated = (nbResult.rowCount ?? 0) + (storageResult.rowCount ?? 0);
  logger.info('Usage reconciliation completed', { usersUpdated });
  return { usersUpdated };
}
