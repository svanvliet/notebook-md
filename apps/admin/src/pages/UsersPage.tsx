import { useEffect, useState, useCallback } from 'react';
import type { AdminUser, Pagination } from '../hooks/useAdmin';

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
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<(AdminUser & { notebookCount: number; activeSessions: number; identityLinks: { provider: string }[] }) | null>(null);

  const load = useCallback(() => {
    getUsers({ page, limit: 20, search: search || undefined }).then((data) => {
      setUsers(data.users);
      setPagination(data.pagination);
    });
  }, [getUsers, page, search]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const handleSuspendToggle = async (user: AdminUser) => {
    if (!confirm(`${user.isSuspended ? 'Unsuspend' : 'Suspend'} ${user.email}?`)) return;
    await updateUser(user.id, { isSuspended: !user.isSuspended });
    load();
    setSelectedUser(null);
  };

  const handleDelete = async (user: AdminUser) => {
    if (!confirm(`Permanently delete ${user.email}? This cannot be undone.`)) return;
    await deleteUser(user.id);
    load();
    setSelectedUser(null);
  };

  const handleViewUser = async (id: string) => {
    const data = await getUser(id);
    setSelectedUser({ ...data.user, notebookCount: data.notebookCount, activeSessions: data.activeSessions, identityLinks: data.linkedProviders || [] });
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Users</h2>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name..."
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm flex-1 max-w-md"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-blue-700">
          Search
        </button>
      </form>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 font-medium">User</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">2FA</th>
              <th className="text-left px-4 py-2 font-medium">Admin</th>
              <th className="text-left px-4 py-2 font-medium">Joined</th>
              <th className="text-left px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <p className="font-medium">{u.displayName}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${u.isSuspended ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {u.isSuspended ? 'Suspended' : 'Active'}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {u.twoFactorEnabled ? (
                    <span className="text-green-600 text-xs">✓ {u.twoFactorMethod}</span>
                  ) : (
                    <span className="text-gray-400 text-xs">Off</span>
                  )}
                </td>
                <td className="px-4 py-2">{u.isAdmin ? '⭐' : ''}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => handleViewUser(u.id)} className="text-blue-600 hover:underline text-xs mr-2">
                    View
                  </button>
                  <button onClick={() => handleSuspendToggle(u)} className="text-orange-600 hover:underline text-xs mr-2">
                    {u.isSuspended ? 'Unsuspend' : 'Suspend'}
                  </button>
                  {!u.isAdmin && (
                    <button onClick={() => handleDelete(u)} className="text-red-600 hover:underline text-xs">
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedUser(null)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{selectedUser.displayName}</h3>
            <dl className="grid grid-cols-2 gap-y-2 text-sm mb-4">
              <dt className="text-gray-500">Email</dt>
              <dd>{selectedUser.email}</dd>
              <dt className="text-gray-500">Status</dt>
              <dd>{selectedUser.isSuspended ? '🔴 Suspended' : '🟢 Active'}</dd>
              <dt className="text-gray-500">2FA</dt>
              <dd>{selectedUser.twoFactorEnabled ? `✓ ${selectedUser.twoFactorMethod}` : 'Disabled'}</dd>
              <dt className="text-gray-500">Admin</dt>
              <dd>{selectedUser.isAdmin ? 'Yes' : 'No'}</dd>
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
              <button onClick={() => handleSuspendToggle(selectedUser)} className="px-3 py-1.5 bg-orange-600 text-white rounded text-sm hover:bg-orange-700">
                {selectedUser.isSuspended ? 'Unsuspend' : 'Suspend'}
              </button>
              <button onClick={() => setSelectedUser(null)} className="px-3 py-1.5 border rounded text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
