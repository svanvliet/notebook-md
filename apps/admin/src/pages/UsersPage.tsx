import { useEffect, useState, useCallback } from 'react';
import type { AdminUser, Pagination } from '../hooks/useAdmin';
import { Badge, Button, ConfirmDialog, DataTable, PageHeader, SlidePanel, useToast, type Column } from '../components/ui';

type ConfirmAction =
  | { type: 'suspend'; user: AdminUser }
  | { type: 'delete'; user: AdminUser }
  | null;

export default function UsersPage({
  getUsers,
  getUser,
  updateUser,
  deleteUser,
}: {
  getUsers: (p: { page?: number; limit?: number; search?: string }) => Promise<{ users: AdminUser[]; pagination: Pagination }>;
  getUser: (id: string) => Promise<{ user: AdminUser; notebookCount: number; activeSessions: number; linkedProviders: { provider: string; email: string }[] }>;
  updateUser: (id: string, data: { isSuspended?: boolean }) => Promise<{ message: string }>;
  deleteUser: (id: string) => Promise<{ message: string }>;
}) {
  const { addToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<(AdminUser & { notebookCount: number; activeSessions: number; identityLinks: { provider: string }[] }) | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getUsers({ page, limit: 20, search: search || undefined })
      .then((data) => {
        setUsers(data.users);
        setPagination(data.pagination);
      })
      .finally(() => setLoading(false));
  }, [getUsers, page, search]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const handleViewUser = async (id: string) => {
    setViewingUserId(id);
    try {
      const data = await getUser(id);
      setSelectedUser({ ...data.user, notebookCount: data.notebookCount, activeSessions: data.activeSessions, identityLinks: data.linkedProviders || [] });
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to load user', 'error');
    } finally {
      setViewingUserId(null);
    }
  };

  const executeConfirm = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      if (confirmAction.type === 'suspend') {
        const result = await updateUser(confirmAction.user.id, { isSuspended: !confirmAction.user.isSuspended });
        addToast(result.message, 'success');
      } else {
        const result = await deleteUser(confirmAction.user.id);
        addToast(result.message, 'success');
      }
      load();
      setSelectedUser(null);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Operation failed', 'error');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const columns: Column<AdminUser>[] = [
    {
      key: 'user',
      header: 'User',
      render: (u) => (
        <div>
          <p className="font-medium">{u.displayName}</p>
          <p className="text-xs text-gray-500">{u.email}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <Badge variant={u.isSuspended ? 'error' : 'success'} dot>
          {u.isSuspended ? 'Suspended' : 'Active'}
        </Badge>
      ),
    },
    {
      key: 'twoFactor',
      header: '2FA',
      render: (u) =>
        u.twoFactorEnabled ? (
          <Badge variant="success">✓ {u.twoFactorMethod}</Badge>
        ) : (
          <Badge variant="neutral">Off</Badge>
        ),
    },
    {
      key: 'admin',
      header: 'Admin',
      render: (u) => (u.isAdmin ? <Badge variant="info">⭐ Admin</Badge> : null),
    },
    {
      key: 'joined',
      header: 'Joined',
      render: (u) => (
        <span className="text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" loading={viewingUserId === u.id} onClick={(e) => { e.stopPropagation(); handleViewUser(u.id); }}>
            View
          </Button>
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setConfirmAction({ type: 'suspend', user: u }); }}>
            {u.isSuspended ? 'Unsuspend' : 'Suspend'}
          </Button>
          {!u.isAdmin && (
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setConfirmAction({ type: 'delete', user: u }); }}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6">
      <PageHeader title="Users" />

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name..."
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm flex-1 max-w-md"
        />
        <Button type="submit">Search</Button>
      </form>

      {/* Table */}
      <DataTable
        columns={columns}
        data={users}
        keyField="id"
        loading={loading}
        pagination={pagination ?? undefined}
        onPageChange={setPage}
        emptyIcon="👤"
        emptyMessage="No users found"
      />

      {/* User Detail Panel */}
      <SlidePanel
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title={selectedUser?.displayName ?? ''}
        wide
      >
        {selectedUser && (
          <>
            <dl className="grid grid-cols-2 gap-y-3 text-sm mb-6">
              <dt className="text-gray-500">Email</dt>
              <dd>{selectedUser.email}</dd>
              <dt className="text-gray-500">Status</dt>
              <dd>
                <Badge variant={selectedUser.isSuspended ? 'error' : 'success'} dot>
                  {selectedUser.isSuspended ? 'Suspended' : 'Active'}
                </Badge>
              </dd>
              <dt className="text-gray-500">2FA</dt>
              <dd>
                {selectedUser.twoFactorEnabled ? (
                  <Badge variant="success">✓ {selectedUser.twoFactorMethod}</Badge>
                ) : (
                  <Badge variant="neutral">Disabled</Badge>
                )}
              </dd>
              <dt className="text-gray-500">Admin</dt>
              <dd>{selectedUser.isAdmin ? <Badge variant="info">Yes</Badge> : 'No'}</dd>
              <dt className="text-gray-500">Notebooks</dt>
              <dd>{selectedUser.notebookCount}</dd>
              <dt className="text-gray-500">Active Sessions</dt>
              <dd>{selectedUser.activeSessions}</dd>
              <dt className="text-gray-500">Providers</dt>
              <dd>{selectedUser.identityLinks.map((l) => l.provider).join(', ') || 'None'}</dd>
              <dt className="text-gray-500">Joined</dt>
              <dd>{new Date(selectedUser.createdAt).toLocaleString()}</dd>
            </dl>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirmAction({ type: 'suspend', user: selectedUser })}>
                {selectedUser.isSuspended ? 'Unsuspend' : 'Suspend'}
              </Button>
              <Button variant="secondary" onClick={() => setSelectedUser(null)}>
                Close
              </Button>
            </div>
          </>
        )}
      </SlidePanel>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={executeConfirm}
        title={
          confirmAction?.type === 'delete'
            ? 'Delete User'
            : confirmAction?.type === 'suspend'
              ? confirmAction.user.isSuspended ? 'Unsuspend User' : 'Suspend User'
              : ''
        }
        message={
          confirmAction?.type === 'delete'
            ? `Permanently delete ${confirmAction.user.email}? This cannot be undone.`
            : confirmAction?.type === 'suspend'
              ? `${confirmAction.user.isSuspended ? 'Unsuspend' : 'Suspend'} ${confirmAction.user.email}?`
              : ''
        }
        confirmLabel={
          confirmAction?.type === 'delete'
            ? 'Delete'
            : confirmAction?.type === 'suspend'
              ? confirmAction.user.isSuspended ? 'Unsuspend' : 'Suspend'
              : 'Confirm'
        }
        destructive={confirmAction?.type === 'delete' || (confirmAction?.type === 'suspend' && !confirmAction.user.isSuspended)}
        loading={actionLoading}
      />
    </div>
  );
}
