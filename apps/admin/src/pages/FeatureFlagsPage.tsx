import { useEffect, useState } from 'react';
import type { FeatureFlag } from '../hooks/useAdmin';

export default function FeatureFlagsPage({
  getFeatureFlags,
  saveFeatureFlag,
}: {
  getFeatureFlags: () => Promise<{ flags: FeatureFlag[] }>;
  saveFeatureFlag: (data: { key: string; enabled: boolean; description?: string }) => Promise<{ message: string }>;
}) {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const load = () => getFeatureFlags().then((d) => setFlags(d.flags));
  useEffect(() => { load(); }, [getFeatureFlags]);

  const handleToggle = async (flag: FeatureFlag) => {
    await saveFeatureFlag({ key: flag.key, enabled: !flag.enabled, description: flag.description ?? undefined });
    load();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    await saveFeatureFlag({ key: newKey.trim(), enabled: false, description: newDesc.trim() || undefined });
    setNewKey('');
    setNewDesc('');
    setShowCreate(false);
    load();
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
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="flag_key"
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm flex-1"
              required
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm flex-1"
            />
            <button type="submit" className="bg-green-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-green-700">
              Create
            </button>
          </div>
        </form>
      )}

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
                <th className="text-left px-4 py-2 font-medium">Updated</th>
                <th className="text-left px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.key} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{f.key}</td>
                  <td className="px-4 py-2 text-gray-600">{f.description || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${f.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {f.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {new Date(f.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <button onClick={() => handleToggle(f)} className={`text-xs hover:underline ${f.enabled ? 'text-red-600' : 'text-green-600'}`}>
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
  );
}
