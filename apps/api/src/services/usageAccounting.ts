import { query, getClient } from '../db/pool.js';

/**
 * Usage accounting — increment/decrement counters transactionally.
 * Uses UPSERT to handle first-time counter creation.
 */

export async function incrementNotebookCount(userId: string): Promise<void> {
  await query(
    `INSERT INTO user_usage_counters (user_id, counter_key, counter_value, updated_at)
     VALUES ($1, 'cloud_notebook_count', 1, now())
     ON CONFLICT (user_id, counter_key)
     DO UPDATE SET counter_value = user_usage_counters.counter_value + 1, updated_at = now()`,
    [userId],
  );
}

export async function decrementNotebookCount(userId: string): Promise<void> {
  await query(
    `UPDATE user_usage_counters
     SET counter_value = GREATEST(counter_value - 1, 0), updated_at = now()
     WHERE user_id = $1 AND counter_key = 'cloud_notebook_count'`,
    [userId],
  );
}

export async function updateStorageUsage(userId: string, deltaBytes: number): Promise<void> {
  if (deltaBytes === 0) return;

  await query(
    `INSERT INTO user_usage_counters (user_id, counter_key, counter_value, updated_at)
     VALUES ($1, 'cloud_storage_bytes', GREATEST($2::bigint, 0), now())
     ON CONFLICT (user_id, counter_key)
     DO UPDATE SET counter_value = GREATEST(user_usage_counters.counter_value + $2::bigint, 0), updated_at = now()`,
    [userId, deltaBytes],
  );
}

export async function initializeUsageCounters(userId: string): Promise<void> {
  await query(
    `INSERT INTO user_usage_counters (user_id, counter_key, counter_value)
     VALUES ($1, 'cloud_notebook_count', 0), ($1, 'cloud_storage_bytes', 0)
     ON CONFLICT (user_id, counter_key) DO NOTHING`,
    [userId],
  );
}

export async function reconcileUsage(userId: string): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Recompute notebook count
    const nbCount = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM notebooks WHERE user_id = $1 AND source_type = 'cloud'`,
      [userId],
    );

    // Recompute storage: cloud_documents + document_versions
    const storageResult = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(size_bytes), 0) as total FROM (
         SELECT size_bytes FROM cloud_documents cd
         JOIN notebooks n ON cd.notebook_id = n.id
         WHERE n.user_id = $1
         UNION ALL
         SELECT dv.size_bytes FROM document_versions dv
         JOIN cloud_documents cd ON dv.document_id = cd.id
         JOIN notebooks n ON cd.notebook_id = n.id
         WHERE n.user_id = $1
       ) combined`,
      [userId],
    );

    await client.query(
      `INSERT INTO user_usage_counters (user_id, counter_key, counter_value, last_reconciled_at, updated_at)
       VALUES ($1, 'cloud_notebook_count', $2, now(), now())
       ON CONFLICT (user_id, counter_key)
       DO UPDATE SET counter_value = $2, last_reconciled_at = now(), updated_at = now()`,
      [userId, parseInt(nbCount.rows[0].count, 10)],
    );

    await client.query(
      `INSERT INTO user_usage_counters (user_id, counter_key, counter_value, last_reconciled_at, updated_at)
       VALUES ($1, 'cloud_storage_bytes', $2, now(), now())
       ON CONFLICT (user_id, counter_key)
       DO UPDATE SET counter_value = $2, last_reconciled_at = now(), updated_at = now()`,
      [userId, parseInt(storageResult.rows[0].total, 10)],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
