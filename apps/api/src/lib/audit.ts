import { query } from '../db/pool.js';

interface AuditEntry {
  userId?: string | null;
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  await query(
    `INSERT INTO audit_log (user_id, action, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4::inet, $5)`,
    [
      entry.userId ?? null,
      entry.action,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.ipAddress ?? null,
      entry.userAgent ?? null,
    ],
  );
}
