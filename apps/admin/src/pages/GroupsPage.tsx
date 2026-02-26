import { useEffect, useState, useMemo } from 'react';
import type { UserGroup, GroupMember } from '../hooks/useAdmin';
import { PageHeader, Button, DataTable, SlidePanel, ConfirmDialog, FormField, Badge, useToast, type Column } from '../components/ui';

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
  const { addToast } = useToast();
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newSelfEnroll, setNewSelfEnroll] = useState(false);

  // Detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ group: UserGroup; members: GroupMember[] } | null>(null);
  const [addUserId, setAddUserId] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  // Confirm dialogs
  const [deleteTarget, setDeleteTarget] = useState<UserGroup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<GroupMember | null>(null);
  const [removingMember, setRemovingMember] = useState(false);

  const load = () => {
    setLoading(true);
    getGroups().then(d => setGroups(d.groups)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [getGroups]);

  const loadDetail = (id: string) => {
    setSelectedId(id);
    getGroup(id).then(setDetail);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createGroup({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        emailDomain: newDomain.trim() || undefined,
        allowSelfEnroll: newSelfEnroll,
      });
      setNewName(''); setNewDesc(''); setNewDomain(''); setNewSelfEnroll(false);
      setShowCreate(false);
      addToast('Group created', 'success');
      load();
    } catch {
      addToast('Failed to create group', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteGroup(deleteTarget.id);
      if (selectedId === deleteTarget.id) { setSelectedId(null); setDetail(null); }
      addToast('Group deleted', 'success');
      load();
    } catch {
      addToast('Failed to delete group', 'error');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUserId.trim() || !selectedId) return;
    setAddingMember(true);
    try {
      await addGroupMembers(selectedId, [addUserId.trim()]);
      setAddUserId('');
      addToast('Member added', 'success');
      loadDetail(selectedId);
      load();
    } catch {
      addToast('Failed to add member', 'error');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!selectedId || !removeMemberTarget) return;
    setRemovingMember(true);
    try {
      await removeGroupMember(selectedId, removeMemberTarget.userId);
      addToast('Member removed', 'success');
      loadDetail(selectedId);
      load();
    } catch {
      addToast('Failed to remove member', 'error');
    } finally {
      setRemovingMember(false);
      setRemoveMemberTarget(null);
    }
  };

  const handleToggleSelfEnroll = async (group: UserGroup) => {
    try {
      await updateGroup(group.id, { allowSelfEnroll: !group.allowSelfEnroll });
      addToast(`Self-enrollment ${group.allowSelfEnroll ? 'disabled' : 'enabled'}`, 'success');
      load();
      if (selectedId === group.id) loadDetail(group.id);
    } catch {
      addToast('Failed to update group', 'error');
    }
  };

  const columns = useMemo<Column<UserGroup>[]>(() => [
    { key: 'name', header: 'Name', render: (g) => <span className="font-medium">{g.name}</span> },
    { key: 'emailDomain', header: 'Domain', render: (g) => <span className="text-gray-500 text-xs font-mono">{g.emailDomain || '—'}</span> },
    { key: 'memberCount', header: 'Members', render: (g) => g.memberCount },
    {
      key: 'allowSelfEnroll',
      header: 'Self-Enroll',
      render: (g) => (
        <Badge
          variant={g.allowSelfEnroll ? 'success' : 'neutral'}
          onClick={() => handleToggleSelfEnroll(g)}
        >
          {g.allowSelfEnroll ? 'Yes' : 'No'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (g) => (
        <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteTarget(g); }}>
          Delete
        </Button>
      ),
    },
  ], [selectedId]);

  return (
    <div className="p-6">
      <PageHeader
        title="Groups"
        actions={<Button onClick={() => setShowCreate(!showCreate)}>+ New Group</Button>}
      />

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <FormField label="Group name" required>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Group name" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full" required />
            </FormField>
            <FormField label="Description">
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full" />
            </FormField>
            <FormField label="Email domain">
              <input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="e.g. example.com" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full" />
            </FormField>
            <FormField label="Self-enrollment">
              <label className="flex items-center gap-2 text-sm mt-1">
                <input type="checkbox" checked={newSelfEnroll} onChange={e => setNewSelfEnroll(e.target.checked)} />
                Allow self-enrollment
              </label>
            </FormField>
          </div>
          <Button type="submit" loading={creating}>Create</Button>
        </form>
      )}

      <DataTable
        columns={columns}
        data={groups}
        keyField="id"
        loading={loading}
        emptyIcon="👥"
        emptyMessage="No groups created yet."
        onRowClick={(g) => loadDetail(g.id)}
        selectedKey={selectedId}
      />

      {/* Detail panel */}
      <SlidePanel open={!!detail} onClose={() => { setSelectedId(null); setDetail(null); }} title={detail?.group.name ?? 'Group Details'}>
        {detail && (
          <>
            {detail.group.description && <p className="text-sm text-gray-500 mb-3">{detail.group.description}</p>}
            {detail.group.emailDomain && <p className="text-xs text-gray-400 mb-3">Domain: <span className="font-mono">{detail.group.emailDomain}</span></p>}

            <h4 className="text-sm font-medium mb-2">Members ({detail.members.length})</h4>
            <div className="max-h-48 overflow-auto mb-3">
              {detail.members.map(m => (
                <div key={m.userId} className="flex items-center justify-between py-1 text-xs">
                  <span className="truncate">{m.email}</span>
                  <Button variant="ghost" size="sm" onClick={() => setRemoveMemberTarget(m)}>✕</Button>
                </div>
              ))}
              {detail.members.length === 0 && <p className="text-gray-400 text-xs">No members yet</p>}
            </div>

            <form onSubmit={handleAddMember} className="flex gap-2">
              <input value={addUserId} onChange={e => setAddUserId(e.target.value)} placeholder="Email address" className="border border-gray-300 rounded px-2 py-1 text-xs flex-1" />
              <Button type="submit" size="sm" loading={addingMember}>Add</Button>
            </form>
          </>
        )}
      </SlidePanel>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Group"
        message="Delete this group? This will remove all members and flight assignments."
        confirmLabel="Delete"
        destructive
        loading={deleting}
      />

      <ConfirmDialog
        open={!!removeMemberTarget}
        onClose={() => setRemoveMemberTarget(null)}
        onConfirm={handleRemoveMember}
        title="Remove Member"
        message={`Remove ${removeMemberTarget?.email ?? 'this member'} from the group?`}
        confirmLabel="Remove"
        destructive
        loading={removingMember}
      />
    </div>
  );
}
