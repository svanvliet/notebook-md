import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Flight, FlightAssignment, FeatureFlag, UserGroup } from '../hooks/useAdmin';
import type { UserOption } from '../components/ui/UserPicker';
import { PageHeader, Button, DataTable, SlidePanel, ConfirmDialog, FormField, Badge, useToast, UserPicker, type Column } from '../components/ui';

interface FlightsPageProps {
  getFlights: () => Promise<{ flights: Flight[] }>;
  createFlight: (data: { name: string; description?: string; flagKeys?: string[]; showBadge?: boolean; badgeLabel?: string }) => Promise<{ id: string }>;
  getFlight: (id: string) => Promise<{ flight: Flight; flags: string[]; assignments: FlightAssignment[] }>;
  updateFlight: (id: string, data: { name?: string; description?: string; enabled?: boolean; showBadge?: boolean; badgeLabel?: string; rolloutPercentage?: number }) => Promise<{ message: string }>;
  deleteFlight: (id: string) => Promise<{ message: string }>;
  addFlightFlags: (id: string, flagKeys: string[]) => Promise<{ message: string }>;
  removeFlightFlag: (flightId: string, flagKey: string) => Promise<{ message: string }>;
  assignToFlight: (flightId: string, data: { groupId?: string; userId?: string }) => Promise<{ id: string }>;
  removeFlightAssignment: (flightId: string, assignmentId: string) => Promise<{ message: string }>;
  getFeatureFlags: () => Promise<{ flags: FeatureFlag[] }>;
  getGroups: () => Promise<{ groups: UserGroup[] }>;
  searchUsers: (q: string) => Promise<UserOption[]>;
}

export default function FlightsPage({
  getFlights, createFlight, getFlight, updateFlight, deleteFlight,
  addFlightFlags, removeFlightFlag, assignToFlight, removeFlightAssignment,
  getFeatureFlags, getGroups, searchUsers,
}: FlightsPageProps) {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newBadge, setNewBadge] = useState(false);
  const [newBadgeLabel, setNewBadgeLabel] = useState('Beta');

  // Detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ flight: Flight; flags: string[]; assignments: FlightAssignment[] } | null>(null);

  // For adding flags/assignments
  const [allFlags, setAllFlags] = useState<FeatureFlag[]>([]);
  const [allGroups, setAllGroups] = useState<UserGroup[]>([]);
  const [addFlagKey, setAddFlagKey] = useState('');
  const [assignGroupId, setAssignGroupId] = useState('');

  // Confirm dialogs
  const [deleteTarget, setDeleteTarget] = useState<Flight | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [removeAssignmentTarget, setRemoveAssignmentTarget] = useState<FlightAssignment | null>(null);
  const [removingAssignment, setRemovingAssignment] = useState(false);

  const load = () => {
    setLoading(true);
    getFlights().then(d => setFlights(d.flights)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [getFlights]);

  const loadDetail = (id: string) => {
    setSelectedId(id);
    getFlight(id).then(setDetail);
    getFeatureFlags().then(d => setAllFlags(d.flags));
    getGroups().then(d => setAllGroups(d.groups));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createFlight({ name: newName.trim(), description: newDesc.trim() || undefined, showBadge: newBadge, badgeLabel: newBadgeLabel });
      setNewName(''); setNewDesc(''); setNewBadge(false); setNewBadgeLabel('Beta');
      setShowCreate(false);
      addToast('Flight created', 'success');
      load();
    } catch {
      addToast('Failed to create flight', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (flight: Flight) => {
    try {
      await updateFlight(flight.id, { enabled: !flight.enabled });
      addToast(`Flight ${flight.enabled ? 'disabled' : 'enabled'}`, 'success');
      load();
      if (selectedId === flight.id) loadDetail(flight.id);
    } catch {
      addToast('Failed to update flight', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteFlight(deleteTarget.id);
      if (selectedId === deleteTarget.id) { setSelectedId(null); setDetail(null); }
      addToast('Flight deleted', 'success');
      load();
    } catch {
      addToast('Failed to delete flight', 'error');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleAddFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFlagKey || !selectedId) return;
    try {
      await addFlightFlags(selectedId, [addFlagKey]);
      setAddFlagKey('');
      addToast('Flag added', 'success');
      loadDetail(selectedId);
    } catch {
      addToast('Failed to add flag', 'error');
    }
  };

  const handleRemoveFlag = async (flagKey: string) => {
    if (!selectedId) return;
    try {
      await removeFlightFlag(selectedId, flagKey);
      addToast('Flag removed', 'success');
      loadDetail(selectedId);
    } catch {
      addToast('Failed to remove flag', 'error');
    }
  };

  const handleAssignUser = async (userId: string) => {
    if (!userId.trim() || !selectedId) return;
    try {
      await assignToFlight(selectedId, { userId: userId.trim() });
      addToast('User assigned', 'success');
      loadDetail(selectedId);
      load();
    } catch {
      addToast('Failed to assign user', 'error');
    }
  };

  const handleAssignGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignGroupId || !selectedId) return;
    try {
      await assignToFlight(selectedId, { groupId: assignGroupId });
      setAssignGroupId('');
      addToast('Group assigned', 'success');
      loadDetail(selectedId);
      load();
    } catch {
      addToast('Failed to assign group', 'error');
    }
  };

  const handleRemoveAssignment = async () => {
    if (!selectedId || !removeAssignmentTarget) return;
    setRemovingAssignment(true);
    try {
      await removeFlightAssignment(selectedId, removeAssignmentTarget.id);
      addToast('Assignment removed', 'success');
      loadDetail(selectedId);
      load();
    } catch {
      addToast('Failed to remove assignment', 'error');
    } finally {
      setRemovingAssignment(false);
      setRemoveAssignmentTarget(null);
    }
  };

  const availableFlags = allFlags.filter(f => !detail?.flags.includes(f.key));

  const columns = useMemo<Column<Flight>[]>(() => [
    { key: 'name', header: 'Name', render: (f) => <span className="font-medium">{f.name}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (f) => <Badge variant={f.enabled ? 'success' : 'neutral'}>{f.enabled ? 'Active' : 'Disabled'}</Badge>,
    },
    { key: 'rollout', header: 'Rollout', render: (f) => (
      <div className="flex items-center gap-2">
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${f.rolloutPercentage}%` }}></div>
        </div>
        <span className="text-xs font-mono shrink-0">{f.rolloutPercentage}%</span>
      </div>
    )},
    { key: 'flagCount', header: 'Flags', render: (f) => f.flagCount },
    { key: 'assignmentCount', header: 'Assignments', render: (f) => f.assignmentCount },
    {
      key: 'badge',
      header: 'Badge',
      render: (f) => f.showBadge ? <Badge variant="info">{f.badgeLabel}</Badge> : <span>—</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (f) => (
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          <Button variant={f.enabled ? 'danger' : 'primary'} size="sm" onClick={() => handleToggle(f)}>
            {f.enabled ? 'Disable' : 'Enable'}
          </Button>
          {!f.isPermanent && (
            <Button variant="danger" size="sm" onClick={() => setDeleteTarget(f)}>Delete</Button>
          )}
        </div>
      ),
    },
  ], [selectedId]);

  return (
    <div className="p-6">
      <PageHeader
        title="Flights"
        actions={<Button onClick={() => setShowCreate(!showCreate)}>+ New Flight</Button>}
      />

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <FormField label="Flight name" required>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Flight name" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full" required />
            </FormField>
            <FormField label="Description">
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full" />
            </FormField>
            <FormField label="Show badge">
              <label className="flex items-center gap-2 text-sm mt-1">
                <input type="checkbox" checked={newBadge} onChange={e => setNewBadge(e.target.checked)} />
                Show badge
              </label>
            </FormField>
            {newBadge && (
              <FormField label="Badge label">
                <input value={newBadgeLabel} onChange={e => setNewBadgeLabel(e.target.value)} placeholder="Badge label" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full" />
              </FormField>
            )}
          </div>
          <Button type="submit" loading={creating}>Create</Button>
        </form>
      )}

      <DataTable
        columns={columns}
        data={flights}
        keyField="id"
        loading={loading}
        emptyIcon="✈️"
        emptyMessage="No flights created yet."
        onRowClick={(f) => loadDetail(f.id)}
        selectedKey={selectedId}
      />

      {/* Detail panel */}
      <SlidePanel open={!!detail} onClose={() => { setSelectedId(null); setDetail(null); }} title={detail?.flight.name ?? 'Flight Details'} wide>
        {detail && (
          <div className="space-y-4">
            <div>
              {detail.flight.description && <p className="text-sm text-gray-500">{detail.flight.description}</p>}
            </div>

            {/* Rollout % */}
            <div>
              <h4 className="text-sm font-medium mb-2">Rollout Percentage</h4>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={0} max={100} step={5}
                  value={detail.flight.rolloutPercentage}
                  onChange={e => {
                    const pct = Number(e.target.value);
                    setDetail(prev => prev ? { ...prev, flight: { ...prev.flight, rolloutPercentage: pct } } : prev);
                  }}
                  onMouseUp={() => { if (selectedId) updateFlight(selectedId, { rolloutPercentage: detail.flight.rolloutPercentage }).then(() => { addToast('Rollout updated', 'success'); load(); }).catch(() => addToast('Failed to update rollout', 'error')); }}
                  className="flex-1"
                />
                <span className="text-sm font-mono w-10 text-right">{detail.flight.rolloutPercentage}%</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">0% = group-assigned only · 100% = all users</p>
            </div>

            {/* Flags */}
            <div>
              <h4 className="text-sm font-medium mb-2">Flags ({detail.flags.length})</h4>
              <div className="space-y-1 mb-2">
                {detail.flags.map(fk => (
                  <div key={fk} className="flex items-center justify-between text-xs bg-gray-50 px-2 py-1 rounded">
                    <span
                      className="font-mono text-blue-600 hover:underline cursor-pointer"
                      onClick={() => navigate('/feature-flags')}
                    >
                      {fk}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveFlag(fk)}>✕</Button>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddFlag} className="flex gap-2">
                <select value={addFlagKey} onChange={e => setAddFlagKey(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-xs flex-1">
                  <option value="">Select flag…</option>
                  {availableFlags.map(f => <option key={f.key} value={f.key}>{f.key}</option>)}
                </select>
                <Button type="submit" size="sm" disabled={!addFlagKey}>Add</Button>
              </form>
            </div>

            {/* Assignments */}
            <div>
              <h4 className="text-sm font-medium mb-2">Assignments ({detail.assignments.length})</h4>
              <div className="space-y-1 mb-2 max-h-32 overflow-auto">
                {detail.assignments.map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs bg-gray-50 px-2 py-1 rounded">
                    <span>{a.groupId ? `👥 ${a.groupName}` : `👤 ${a.email}`}</span>
                    <Button variant="ghost" size="sm" onClick={() => setRemoveAssignmentTarget(a)}>✕</Button>
                  </div>
                ))}
              </div>

              {/* Assign user */}
              <FormField label="Add user">
                <UserPicker
                  searchUsers={searchUsers}
                  onSelect={(user: UserOption) => handleAssignUser(user.id)}
                  placeholder="Search for user…"
                  excludeIds={detail.assignments.filter(a => a.userId).map(a => a.userId!)}
                />
              </FormField>

              {/* Assign group */}
              <form onSubmit={handleAssignGroup} className="flex gap-2">
                <select value={assignGroupId} onChange={e => setAssignGroupId(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-xs flex-1">
                  <option value="">Select group…</option>
                  {allGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <Button type="submit" size="sm" disabled={!assignGroupId}>+ Group</Button>
              </form>
            </div>
          </div>
        )}
      </SlidePanel>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Flight"
        message="Delete this flight? All assignments will be removed."
        confirmLabel="Delete"
        destructive
        loading={deleting}
      />

      <ConfirmDialog
        open={!!removeAssignmentTarget}
        onClose={() => setRemoveAssignmentTarget(null)}
        onConfirm={handleRemoveAssignment}
        title="Remove Assignment"
        message={`Remove ${removeAssignmentTarget?.groupId ? removeAssignmentTarget.groupName : removeAssignmentTarget?.email ?? 'this assignment'} from the flight?`}
        confirmLabel="Remove"
        destructive
        loading={removingAssignment}
      />
    </div>
  );
}
