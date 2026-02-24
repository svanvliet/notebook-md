import { useEffect, useState } from 'react';
import type { FeatureFlag, FlagOverride } from '../hooks/useAdmin';

export default function FeatureFlagsPage({
  getFeatureFlags,
  saveFeatureFlag,
  getFlagOverrides,
  createFlagOverride,
  deleteFlagOverride,
}: {
  getFeatureFlags: () => Promise<{ flags: FeatureFlag[] }>;
  saveFeatureFlag: (data: { key: string; enabled: boolean; description?: string; rolloutPercentage?: number }) => Promise<{ message: string }>;
  getFlagOverrides: (key: string) => Promise<{ overrides: FlagOverride[] }>;
  createFlagOverride: (key: string, data: { userId: string; enabled: boolean; reason?: string }) => Promise<{ message: string }>;
  deleteFlagOverride: (key: string, userId: string) => Promise<{ message: string }>;
}) {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPct, setNewPct] = useState(100);

  // Override detail
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<FlagOverride[]>([]);
  const [ovUserId, setOvUserId] = useState('');
  const [ovEnabled, setOvEnabled] = useState(true);
  const [ovReason, setOvReason] = useState('');

  const load = () => getFeatureFlags().then((d) => setFlags(d.flags));
  useEffect(() => { load(); }, [getFeatureFlags]);

  const loadOverrides = (key: string) => {
    setSelectedFlag(key);
    getFlagOverrides(key).then(d => setOverrides(d.overrides));
  };

  const handleToggle = async (flag: FeatureFlag) => {
    await saveFeatureFlag({ key: flag.key, enabled: !flag.enabled, description: flag.description ?? undefined, rolloutPercentage: flag.rolloutPercentage });
    load();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    await saveFeatureFlag({ key: newKey.trim(), enabled: false, description: newDesc.trim() || undefined, rolloutPercentage: newPct });
    setNewKey(''); setNewDesc(''); setNewPct(100);
    setShowCreate(false);
    load();
  };

  const handleRolloutChange = async (flag: FeatureFlag, pct: number) => {
    await saveFeatureFlag({ key: flag.key, enabled: flag.enabled, description: flag.description ?? undefined, rolloutPercentage: pct });
    load();
  };

  const handleAddOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ovUserId.trim() || !selectedFlag) return;
    await createFlagOverride(selectedFlag, { userId: ovUserId.trim(), enabled: ovEnabled, reason: ovReason.trim() || undefined });
    setOvUserId(''); setOvReason(''); setOvEnabled(true);
    loadOverrides(selectedFlag);
  };

  const handleDeleteOverride = async (userId: string) => {
    if (!selectedFlag) return;
    await deleteFlagOverride(selectedFlag, userId);
    loadOverrides(selectedFlag);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Feature Flags</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-blue-700"
        >
          + New Flag
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex gap-3">
            <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="flag_key" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm flex-1" required />
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm flex-1" />
            <input type="number" min={0} max={100} value={newPct} onChange={e => setNewPct(Number(e.target.value))} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-20" title="Rollout %" />
            <button type="submit" className="bg-green-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-green-700">Create</button>
          </div>
        </form>
      )}

      <div className="flex gap-6">
        <div className="flex-1">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {flags.length === 0 ? (
              <p className="text-gray-500 text-sm p-4">No feature flags configured.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Key</th>
                    <th className="text-left px-4 py-2 font-medium">Description</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">Rollout</th>
                    <th className="text-left px-4 py-2 font-medium">Updated</th>
                    <th className="text-left px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {flags.map((f) => (
                    <tr key={f.key} className={`border-b last:border-b-0 hover:bg-gray-50 cursor-pointer ${selectedFlag === f.key ? 'bg-blue-50' : ''}`} onClick={() => loadOverrides(f.key)}>
                      <td className="px-4 py-2 font-mono text-xs">{f.key}</td>
                      <td className="px-4 py-2 text-gray-600">{f.description || '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${f.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {f.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <select value={f.rolloutPercentage} onChange={e => { e.stopPropagation(); handleRolloutChange(f, Number(e.target.value)); }} onClick={e => e.stopPropagation()} className="border border-gray-300 rounded px-1 py-0.5 text-xs w-16">
                          {[0, 5, 10, 25, 50, 75, 100].map(p => <option key={p} value={p}>{p}%</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">{new Date(f.updatedAt).toLocaleString()}</td>
                      <td className="px-4 py-2">
                        <button onClick={e => { e.stopPropagation(); handleToggle(f); }} className={`text-xs hover:underline ${f.enabled ? 'text-red-600' : 'text-green-600'}`}>
                          {f.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Overrides panel */}
        {selectedFlag && (
          <div className="w-80 bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-sm mb-3">Overrides: <span className="font-mono">{selectedFlag}</span></h3>
            <div className="space-y-1 mb-3 max-h-48 overflow-auto">
              {overrides.map(o => (
                <div key={o.userId} className="flex items-center justify-between text-xs bg-gray-50 px-2 py-1 rounded">
                  <div>
                    <span className="font-medium">{o.email || o.userId}</span>
                    <span className={`ml-2 px-1.5 py-0.5 rounded-full ${o.enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {o.enabled ? 'ON' : 'OFF'}
                    </span>
                    {o.reason && <span className="text-gray-400 ml-1">({o.reason})</span>}
                  </div>
                  <button onClick={() => handleDeleteOverride(o.userId)} className="text-red-500 hover:underline ml-2">✕</button>
                </div>
              ))}
              {overrides.length === 0 && <p className="text-gray-400 text-xs">No overrides</p>}
            </div>

            <form onSubmit={handleAddOverride} className="space-y-2">
              <input value={ovUserId} onChange={e => setOvUserId(e.target.value)} placeholder="User ID" className="border border-gray-300 rounded px-2 py-1 text-xs w-full" required />
              <div className="flex gap-2">
                <select value={ovEnabled ? 'true' : 'false'} onChange={e => setOvEnabled(e.target.value === 'true')} className="border border-gray-300 rounded px-2 py-1 text-xs">
                  <option value="true">Force ON</option>
                  <option value="false">Force OFF</option>
                </select>
                <input value={ovReason} onChange={e => setOvReason(e.target.value)} placeholder="Reason (optional)" className="border border-gray-300 rounded px-2 py-1 text-xs flex-1" />
              </div>
              <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 w-full">Add Override</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
