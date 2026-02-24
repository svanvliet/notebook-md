import { useEffect, useState } from 'react';
import type { UserGroup, GroupMember } from '../hooks/useAdmin';

interface GroupsPageProps {
  getGroups: () => Promise<{ groups: UserGroup[] }>;
  createGroup: (data: { name: string; description?: string; allowSelfEnroll?: boolean; emailDomain?: string }) => Promise<{ id: string }>;
  getGroup: (id: string) => Promise<{ group: UserGroup; members: GroupMember[] }>;
  updateGroup: (id: string, data: { name?: string; description?: string; allowSelfEnroll?: boolean; emailDomain?: string | null }) => Promise<{ message: string }>;
  deleteGroup: (id: string) => Promise<{ message: string }>;
  addGroupMembers: (id: string, userIds: string[]) => Promise<{ message: string }>;
  removeGroupMember: (groupId: string, userId: string) => Promise<{ message: string }>;
}

export default function GroupsPage({
  getGroups, createGroup, getGroup, updateGroup, deleteGroup, addGroupMembers, removeGroupMember,
}: GroupsPageProps) {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newSelfEnroll, setNewSelfEnroll] = useState(false);

  // Detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ group: UserGroup; members: GroupMember[] } | null>(null);
  const [addUserId, setAddUserId] = useState('');

  const load = () => getGroups().then(d => setGroups(d.groups));
  useEffect(() => { load(); }, [getGroups]);

  const loadDetail = (id: string) => {
    setSelectedId(id);
    getGroup(id).then(setDetail);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await createGroup({
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      emailDomain: newDomain.trim() || undefined,
      allowSelfEnroll: newSelfEnroll,
    });
    setNewName(''); setNewDesc(''); setNewDomain(''); setNewSelfEnroll(false);
    setShowCreate(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this group? This will remove all members and flight assignments.')) return;
    await deleteGroup(id);
    if (selectedId === id) { setSelectedId(null); setDetail(null); }
    load();
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUserId.trim() || !selectedId) return;
    await addGroupMembers(selectedId, [addUserId.trim()]);
    setAddUserId('');
    loadDetail(selectedId);
    load();
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedId) return;
    await removeGroupMember(selectedId, userId);
    loadDetail(selectedId);
    load();
  };

  const handleToggleSelfEnroll = async (group: UserGroup) => {
    await updateGroup(group.id, { allowSelfEnroll: !group.allowSelfEnroll });
    load();
    if (selectedId === group.id) loadDetail(group.id);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Groups</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-blue-700">
          + New Group
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Group name" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" required />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
            <input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="Email domain (e.g. example.com)" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newSelfEnroll} onChange={e => setNewSelfEnroll(e.target.checked)} />
              Allow self-enrollment
            </label>
          </div>
          <button type="submit" className="bg-green-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-green-700">Create</button>
        </form>
      )}

      <div className="flex gap-6">
        {/* Groups list */}
        <div className="flex-1">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {groups.length === 0 ? (
              <p className="text-gray-500 text-sm p-4">No groups created yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Name</th>
                    <th className="text-left px-4 py-2 font-medium">Domain</th>
                    <th className="text-left px-4 py-2 font-medium">Members</th>
                    <th className="text-left px-4 py-2 font-medium">Self-Enroll</th>
                    <th className="text-left px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => (
                    <tr key={g.id} className={`border-b last:border-b-0 hover:bg-gray-50 cursor-pointer ${selectedId === g.id ? 'bg-blue-50' : ''}`} onClick={() => loadDetail(g.id)}>
                      <td className="px-4 py-2 font-medium">{g.name}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs font-mono">{g.emailDomain || '—'}</td>
                      <td className="px-4 py-2">{g.memberCount}</td>
                      <td className="px-4 py-2">
                        <button onClick={e => { e.stopPropagation(); handleToggleSelfEnroll(g); }} className={`text-xs px-2 py-0.5 rounded-full ${g.allowSelfEnroll ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {g.allowSelfEnroll ? 'Yes' : 'No'}
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={e => { e.stopPropagation(); handleDelete(g.id); }} className="text-red-600 text-xs hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {detail && (
          <div className="w-80 bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold mb-1">{detail.group.name}</h3>
            {detail.group.description && <p className="text-sm text-gray-500 mb-3">{detail.group.description}</p>}
            {detail.group.emailDomain && <p className="text-xs text-gray-400 mb-3">Domain: <span className="font-mono">{detail.group.emailDomain}</span></p>}

            <h4 className="text-sm font-medium mb-2">Members ({detail.members.length})</h4>
            <div className="max-h-48 overflow-auto mb-3">
              {detail.members.map(m => (
                <div key={m.userId} className="flex items-center justify-between py-1 text-xs">
                  <span className="truncate">{m.email}</span>
                  <button onClick={() => handleRemoveMember(m.userId)} className="text-red-500 hover:underline ml-2 shrink-0">✕</button>
                </div>
              ))}
              {detail.members.length === 0 && <p className="text-gray-400 text-xs">No members yet</p>}
            </div>

            <form onSubmit={handleAddMember} className="flex gap-2">
              <input value={addUserId} onChange={e => setAddUserId(e.target.value)} placeholder="User ID" className="border border-gray-300 rounded px-2 py-1 text-xs flex-1" />
              <button type="submit" className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700">Add</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
