import { useEffect, useState, useCallback, useRef } from 'react';
import type { AdminUser, Pagination } from '../hooks/useAdmin';
import { Badge, Button, ConfirmDialog, DataTable, PageHeader, SlidePanel, useToast, type Column } from '../components/ui';

type ConfirmAction =
  | { type: 'suspend'; user: AdminUser }
  | { type: 'delete'; user: AdminUser }
  | null;

interface UserDetail {
  user: AdminUser;
  notebookCount: number;
  activeSessions: number;
  linkedProviders: { provider: string; email: string }[];
  groups: { id: string; name: string }[];
  flights: { id: string; name: string }[];
  resolvedFlags: Record<string, { enabled: boolean; variant: string | null; badge: string | null; source: string }>;
}

export default function UsersPage({
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  searchUsers,
  forceLogout,
}: {
  getUsers: (p: { page?: number; limit?: number; search?: string; sort?: string; order?: 'asc' | 'desc'; status?: string }) => Promise<{ users: AdminUser[]; pagination: Pagination }>;
  getUser: (id: string) => Promise<UserDetail>;
  updateUser: (id: string, data: { isSuspended?: boolean }) => Promise<{ message: string }>;
  deleteUser: (id: string) => Promise<{ message: string }>;
  searchUsers: (q: string) => Promise<{ id: string; email: string; displayName: string; avatarUrl: string | null }[]>;
  forceLogout: (userId: string) => Promise<{ message: string; count: number }>;
}) {
  const { addToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [sort, setSort] = useState<string>('created_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'overview' | 'groups' | 'flags' | 'sessions'>('overview');

  // Debounced search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchInput]);

  const load = useCallback(() => {
    setLoading(true);
    getUsers({ page, limit: 20, search: search || undefined, sort, order, status: statusFilter })
      .then((data) => {
        setUsers(data.users);
        setPagination(data.pagination);
      })
      .finally(() => setLoading(false));
  }, [getUsers, page, search, sort, order, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleViewUser = async (id: string) => {
    setViewingUserId(id);
    try {
      const data = await getUser(id);
      setSelectedUser(data);
      setActiveTab('overview');
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

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <button
      className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
      onClick={() => {
        if (sort === field) {
          setOrder(order === 'asc' ? 'desc' : 'asc');
        } else {
          setSort(field);
          setOrder('desc');
        }
        setPage(1);
      }}
    >
      {label}
      {sort === field && <span>{order === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );

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
      key: 'lastActive',
      header: () => <SortHeader field="last_active_at" label="Last Active" />,
      render: (u) => (
        <span className="text-xs text-gray-500">
          {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'joined',
      header: () => <SortHeader field="created_at" label="Joined" />,
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

  const user = selectedUser?.user;

  return (
    <div className="p-6">
      <PageHeader title="Users" />

      {/* Status filter */}
      <div className="flex gap-2 mb-4">
        {['all', 'active', 'suspended'].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1 text-sm rounded-full ${statusFilter === s ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by email or name..."
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm flex-1 max-w-md"
        />
      </div>

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
        title={user?.displayName ?? ''}
        wide
      >
        {user && selectedUser && (
          <>
            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-4">
              {(['overview', 'groups', 'flags', 'sessions'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  {tab === 'groups' ? 'Groups & Flights' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <>
                <dl className="grid grid-cols-2 gap-y-3 text-sm mb-6">
                  <dt className="text-gray-500">Email</dt>
                  <dd>{user.email}</dd>
                  <dt className="text-gray-500">Status</dt>
                  <dd>
                    <Badge variant={user.isSuspended ? 'error' : 'success'} dot>
                      {user.isSuspended ? 'Suspended' : 'Active'}
                    </Badge>
                  </dd>
                  <dt className="text-gray-500">2FA</dt>
                  <dd>
                    {user.twoFactorEnabled ? (
                      <Badge variant="success">✓ {user.twoFactorMethod}</Badge>
                    ) : (
                      <Badge variant="neutral">Disabled</Badge>
                    )}
                  </dd>
                  <dt className="text-gray-500">Admin</dt>
                  <dd>{user.isAdmin ? <Badge variant="info">Yes</Badge> : 'No'}</dd>
                  <dt className="text-gray-500">Notebooks</dt>
                  <dd>{selectedUser.notebookCount}</dd>
                  <dt className="text-gray-500">Active Sessions</dt>
                  <dd>{selectedUser.activeSessions}</dd>
                  <dt className="text-gray-500">Providers</dt>
                  <dd>{selectedUser.linkedProviders.map((l) => l.provider).join(', ') || 'None'}</dd>
                  <dt className="text-gray-500">Joined</dt>
                  <dd>{new Date(user.createdAt).toLocaleString()}</dd>
                  <dt className="text-gray-500">Last Active</dt>
                  <dd>{user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString() : '—'}</dd>
                </dl>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setConfirmAction({ type: 'suspend', user })}>
                    {user.isSuspended ? 'Unsuspend' : 'Suspend'}
                  </Button>
                  <Button variant="secondary" onClick={() => setSelectedUser(null)}>
                    Close
                  </Button>
                </div>
              </>
            )}

            {/* Groups & Flights Tab */}
            {activeTab === 'groups' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Groups</h3>
                  {selectedUser.groups.length === 0 ? (
                    <p className="text-sm text-gray-400">No groups</p>
                  ) : (
                    <ul className="space-y-1">
                      {selectedUser.groups.map((g) => (
                        <li key={g.id} className="text-sm">
                          <a href={`/groups`} className="text-blue-600 hover:underline">{g.name}</a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Flights</h3>
                  {selectedUser.flights.length === 0 ? (
                    <p className="text-sm text-gray-400">No flights</p>
                  ) : (
                    <ul className="space-y-1">
                      {selectedUser.flights.map((f) => (
                        <li key={f.id} className="text-sm">
                          <a href={`/flights`} className="text-blue-600 hover:underline">{f.name}</a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* Flags Tab */}
            {activeTab === 'flags' && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Resolved Feature Flags</h3>
                {Object.keys(selectedUser.resolvedFlags).length === 0 ? (
                  <p className="text-sm text-gray-400">No flags</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left">
                        <th className="px-2 py-2 font-medium text-gray-500">Flag</th>
                        <th className="px-2 py-2 font-medium text-gray-500">Enabled</th>
                        <th className="px-2 py-2 font-medium text-gray-500">Variant</th>
                        <th className="px-2 py-2 font-medium text-gray-500">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(selectedUser.resolvedFlags).map(([key, flag]) => (
                        <tr key={key} className="border-b border-gray-100">
                          <td className="px-2 py-2 font-mono text-xs">{key}</td>
                          <td className="px-2 py-2">
                            <Badge variant={flag.enabled ? 'success' : 'neutral'}>
                              {flag.enabled ? 'Yes' : 'No'}
                            </Badge>
                          </td>
                          <td className="px-2 py-2 text-xs">{flag.variant ?? '—'}</td>
                          <td className="px-2 py-2 text-xs text-gray-500">{flag.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Sessions Tab */}
            {activeTab === 'sessions' && (
              <div className="space-y-4">
                <div className="text-sm">
                  <span className="text-gray-500">Active Sessions:</span>{' '}
                  <span className="font-medium">{selectedUser.activeSessions}</span>
                </div>
                <Button variant="danger" onClick={async () => {
                  try {
                    const result = await forceLogout(user.id);
                    addToast(`${result.count} session(s) revoked`, 'success');
                    handleViewUser(user.id);
                  } catch (err) {
                    addToast(err instanceof Error ? err.message : 'Failed to force logout', 'error');
                  }
                }}>
                  Force Logout All Sessions
                </Button>
              </div>
            )}
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
