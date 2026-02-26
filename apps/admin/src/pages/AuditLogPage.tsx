import { useEffect, useState, useCallback, useMemo } from 'react';
import type { AuditEntry, Pagination } from '../hooks/useAdmin';
import { PageHeader, DataTable, Badge, type Column } from '../components/ui';

const ACTION_BADGE_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  sign_in: 'success',
  sign_up: 'info',
  sign_out: 'neutral',
  password_change: 'warning',
  '2fa_enable': 'success',
  '2fa_disable': 'warning',
  admin_action: 'error',
  provider_link: 'info',
  provider_unlink: 'warning',
};

export default function AuditLogPage({
  getAuditLog,
}: {
  getAuditLog: (p: { page?: number; limit?: number; action?: string; userId?: string }) => Promise<{ entries: AuditEntry[]; pagination: Pagination }>;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getAuditLog({ page, limit: 50, action: actionFilter || undefined }).then((data) => {
      setEntries(data.entries);
      setPagination(data.pagination);
    }).finally(() => setLoading(false));
  }, [getAuditLog, page, actionFilter]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo<Column<AuditEntry>[]>(() => [
    {
      key: 'createdAt',
      header: 'Time',
      render: (e) => <span className="text-xs text-gray-500 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</span>,
    },
    {
      key: 'user',
      header: 'User',
      render: (e) => (
        <div>
          <p className="text-xs">{e.userName || 'Unknown'}</p>
          <p className="text-xs text-gray-400">{e.userEmail}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (e) => <Badge variant={ACTION_BADGE_VARIANT[e.action] ?? 'neutral'}>{e.action}</Badge>,
    },
    {
      key: 'details',
      header: 'Details',
      className: 'max-w-xs truncate',
      render: (e) => <span className="text-xs text-gray-600">{JSON.stringify(e.details)}</span>,
    },
    {
      key: 'ipAddress',
      header: 'IP',
      render: (e) => <span className="text-xs text-gray-500">{e.ipAddress}</span>,
    },
  ], []);

  return (
    <div className="p-6">
      <PageHeader title="Audit Log" />

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

      <DataTable
        columns={columns}
        data={entries}
        keyField="id"
        loading={loading}
        emptyIcon="📋"
        emptyMessage="No audit log entries found"
        pagination={pagination ?? undefined}
        onPageChange={setPage}
      />
    </div>
  );
}
