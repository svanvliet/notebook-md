import { useEffect, useState, useCallback } from 'react';
import type { AuditEntry, Pagination } from '../hooks/useAdmin';

export default function AuditLogPage({
  getAuditLog,
}: {
  getAuditLog: (p: { page?: number; limit?: number; action?: string; userId?: string }) => Promise<{ entries: AuditEntry[]; pagination: Pagination }>;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');

  const load = useCallback(() => {
    getAuditLog({ page, limit: 50, action: actionFilter || undefined }).then((data) => {
      setEntries(data.entries);
      setPagination(data.pagination);
    });
  }, [getAuditLog, page, actionFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Audit Log</h2>

      <div className="flex gap-2 mb-4">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">All actions</option>
          <option value="sign_in">Sign In</option>
          <option value="sign_up">Sign Up</option>
          <option value="sign_out">Sign Out</option>
          <option value="password_change">Password Change</option>
          <option value="2fa_enable">2FA Enable</option>
          <option value="2fa_disable">2FA Disable</option>
          <option value="admin_action">Admin Action</option>
          <option value="provider_link">Provider Link</option>
          <option value="provider_unlink">Provider Unlink</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Time</th>
              <th className="text-left px-4 py-2 font-medium">User</th>
              <th className="text-left px-4 py-2 font-medium">Action</th>
              <th className="text-left px-4 py-2 font-medium">Details</th>
              <th className="text-left px-4 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <p className="text-xs">{e.userName || 'Unknown'}</p>
                  <p className="text-xs text-gray-400">{e.userEmail}</p>
                </td>
                <td className="px-4 py-2">
                  <span className="inline-block px-2 py-0.5 bg-gray-100 rounded text-xs font-mono">
                    {e.action}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-gray-600 max-w-xs truncate">
                  {JSON.stringify(e.details)}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{e.ipAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center gap-2 mt-4">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-50">
            Prev
          </button>
          <span className="text-sm text-gray-600">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 border rounded text-sm disabled:opacity-50">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
