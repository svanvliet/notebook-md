import { useEffect, useState } from 'react';
import type { Flight, FlightAssignment, FeatureFlag, UserGroup } from '../hooks/useAdmin';

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
}

export default function FlightsPage({
  getFlights, createFlight, getFlight, updateFlight, deleteFlight,
  addFlightFlags, removeFlightFlag, assignToFlight, removeFlightAssignment,
  getFeatureFlags, getGroups,
}: FlightsPageProps) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [showCreate, setShowCreate] = useState(false);
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
  const [assignUserId, setAssignUserId] = useState('');
  const [assignGroupId, setAssignGroupId] = useState('');

  const load = () => getFlights().then(d => setFlights(d.flights));
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
    await createFlight({ name: newName.trim(), description: newDesc.trim() || undefined, showBadge: newBadge, badgeLabel: newBadgeLabel });
    setNewName(''); setNewDesc(''); setNewBadge(false); setNewBadgeLabel('Beta');
    setShowCreate(false);
    load();
  };

  const handleToggle = async (flight: Flight) => {
    await updateFlight(flight.id, { enabled: !flight.enabled });
    load();
    if (selectedId === flight.id) loadDetail(flight.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this flight? All assignments will be removed.')) return;
    await deleteFlight(id);
    if (selectedId === id) { setSelectedId(null); setDetail(null); }
    load();
  };

  const handleAddFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFlagKey || !selectedId) return;
    await addFlightFlags(selectedId, [addFlagKey]);
    setAddFlagKey('');
    loadDetail(selectedId);
  };

  const handleRemoveFlag = async (flagKey: string) => {
    if (!selectedId) return;
    await removeFlightFlag(selectedId, flagKey);
    loadDetail(selectedId);
  };

  const handleAssignUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignUserId.trim() || !selectedId) return;
    await assignToFlight(selectedId, { userId: assignUserId.trim() });
    setAssignUserId('');
    loadDetail(selectedId);
    load();
  };

  const handleAssignGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignGroupId || !selectedId) return;
    await assignToFlight(selectedId, { groupId: assignGroupId });
    setAssignGroupId('');
    loadDetail(selectedId);
    load();
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (!selectedId) return;
    await removeFlightAssignment(selectedId, assignmentId);
    loadDetail(selectedId);
    load();
  };

  const availableFlags = allFlags.filter(f => !detail?.flags.includes(f.key));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Flights</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-blue-700">
          + New Flight
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Flight name" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" required />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newBadge} onChange={e => setNewBadge(e.target.checked)} />
              Show badge
            </label>
            {newBadge && (
              <input value={newBadgeLabel} onChange={e => setNewBadgeLabel(e.target.value)} placeholder="Badge label" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
            )}
          </div>
          <button type="submit" className="bg-green-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-green-700">Create</button>
        </form>
      )}

      <div className="flex gap-6">
        {/* Flights list */}
        <div className="flex-1">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {flights.length === 0 ? (
              <p className="text-gray-500 text-sm p-4">No flights created yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Name</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">Rollout</th>
                    <th className="text-left px-4 py-2 font-medium">Flags</th>
                    <th className="text-left px-4 py-2 font-medium">Assignments</th>
                    <th className="text-left px-4 py-2 font-medium">Badge</th>
                    <th className="text-left px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {flights.map(f => (
                    <tr key={f.id} className={`border-b last:border-b-0 hover:bg-gray-50 cursor-pointer ${selectedId === f.id ? 'bg-blue-50' : ''}`} onClick={() => loadDetail(f.id)}>
                      <td className="px-4 py-2 font-medium">{f.name}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${f.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {f.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs font-mono">{f.rolloutPercentage}%</td>
                      <td className="px-4 py-2">{f.flagCount}</td>
                      <td className="px-4 py-2">{f.assignmentCount}</td>
                      <td className="px-4 py-2">
                        {f.showBadge ? <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">{f.badgeLabel}</span> : '—'}
                      </td>
                      <td className="px-4 py-2 space-x-2">
                        <button onClick={e => { e.stopPropagation(); handleToggle(f); }} className={`text-xs hover:underline ${f.enabled ? 'text-red-600' : 'text-green-600'}`}>
                          {f.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={e => { e.stopPropagation(); handleDelete(f.id); }} className="text-red-600 text-xs hover:underline">Delete</button>
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
          <div className="w-96 bg-white border border-gray-200 rounded-lg p-4 space-y-4">
            <div>
              <h3 className="font-semibold">{detail.flight.name}</h3>
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
                  onMouseUp={() => { if (selectedId) updateFlight(selectedId, { rolloutPercentage: detail.flight.rolloutPercentage }).then(() => load()); }}
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
                    <span className="font-mono">{fk}</span>
                    <button onClick={() => handleRemoveFlag(fk)} className="text-red-500 hover:underline">✕</button>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddFlag} className="flex gap-2">
                <select value={addFlagKey} onChange={e => setAddFlagKey(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-xs flex-1">
                  <option value="">Select flag…</option>
                  {availableFlags.map(f => <option key={f.key} value={f.key}>{f.key}</option>)}
                </select>
                <button type="submit" className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700" disabled={!addFlagKey}>Add</button>
              </form>
            </div>

            {/* Assignments */}
            <div>
              <h4 className="text-sm font-medium mb-2">Assignments ({detail.assignments.length})</h4>
              <div className="space-y-1 mb-2 max-h-32 overflow-auto">
                {detail.assignments.map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs bg-gray-50 px-2 py-1 rounded">
                    <span>{a.groupId ? `👥 ${a.groupName}` : `👤 ${a.email}`}</span>
                    <button onClick={() => handleRemoveAssignment(a.id)} className="text-red-500 hover:underline">✕</button>
                  </div>
                ))}
              </div>

              {/* Assign user */}
              <form onSubmit={handleAssignUser} className="flex gap-2 mb-2">
                <input value={assignUserId} onChange={e => setAssignUserId(e.target.value)} placeholder="User ID" className="border border-gray-300 rounded px-2 py-1 text-xs flex-1" />
                <button type="submit" className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700">+ User</button>
              </form>

              {/* Assign group */}
              <form onSubmit={handleAssignGroup} className="flex gap-2">
                <select value={assignGroupId} onChange={e => setAssignGroupId(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-xs flex-1">
                  <option value="">Select group…</option>
                  {allGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button type="submit" className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700" disabled={!assignGroupId}>+ Group</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
