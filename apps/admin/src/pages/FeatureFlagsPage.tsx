import { useEffect, useState, useMemo } from 'react';
import type { FeatureFlag, FlagOverride } from '../hooks/useAdmin';
import {
  Badge, Button, ConfirmDialog, DataTable, type Column,
  PageHeader, SlidePanel, FormField, useToast,
} from '../components/ui';

export default function FeatureFlagsPage({
  getFeatureFlags,
  saveFeatureFlag,
  getFlagOverrides,
  createFlagOverride,
  deleteFlagOverride,
}: {
  getFeatureFlags: () => Promise<{ flags: FeatureFlag[] }>;
  saveFeatureFlag: (data: { key: string; enabled: boolean; description?: string }) => Promise<{ message: string }>;
  getFlagOverrides: (key: string) => Promise<{ overrides: FlagOverride[] }>;
  createFlagOverride: (key: string, data: { userId: string; enabled: boolean; reason?: string }) => Promise<{ message: string }>;
  deleteFlagOverride: (key: string, userId: string) => Promise<{ message: string }>;
}) {
  const { addToast } = useToast();

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Override detail
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<FlagOverride[]>([]);
  const [ovUserId, setOvUserId] = useState('');
  const [ovEnabled, setOvEnabled] = useState(true);
  const [ovReason, setOvReason] = useState('');
  const [addingOverride, setAddingOverride] = useState(false);

  // Toggle / delete confirm state
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<FeatureFlag | null>(null);
  const [confirmDeleteOverride, setConfirmDeleteOverride] = useState<string | null>(null);
  const [deletingOverride, setDeletingOverride] = useState(false);

  const load = () => {
    setLoading(true);
    getFeatureFlags()
      .then((d) => setFlags(d.flags))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [getFeatureFlags]);

  const loadOverrides = (key: string) => {
    setSelectedFlag(key);
    getFlagOverrides(key).then(d => setOverrides(d.overrides));
  };

  const handleToggle = async (flag: FeatureFlag) => {
    setTogglingKey(flag.key);
    try {
      await saveFeatureFlag({ key: flag.key, enabled: !flag.enabled, description: flag.description ?? undefined });
      addToast(`Flag "${flag.key}" ${flag.enabled ? 'disabled' : 'enabled'}`, 'success');
      load();
    } catch {
      addToast(`Failed to toggle flag "${flag.key}"`, 'error');
    } finally {
      setTogglingKey(null);
      setConfirmToggle(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setCreating(true);
    try {
      await saveFeatureFlag({ key: newKey.trim(), enabled: false, description: newDesc.trim() || undefined });
      addToast(`Flag "${newKey.trim()}" created`, 'success');
      setNewKey(''); setNewDesc('');
      setShowCreate(false);
      load();
    } catch {
      addToast('Failed to create flag', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleAddOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ovUserId.trim() || !selectedFlag) return;
    setAddingOverride(true);
    try {
      await createFlagOverride(selectedFlag, { userId: ovUserId.trim(), enabled: ovEnabled, reason: ovReason.trim() || undefined });
      addToast('Override created', 'success');
      setOvUserId(''); setOvReason(''); setOvEnabled(true);
      loadOverrides(selectedFlag);
    } catch {
      addToast('Failed to create override', 'error');
    } finally {
      setAddingOverride(false);
    }
  };

  const handleDeleteOverride = async (userId: string) => {
    if (!selectedFlag) return;
    setDeletingOverride(true);
    try {
      await deleteFlagOverride(selectedFlag, userId);
      addToast('Override deleted', 'success');
      loadOverrides(selectedFlag);
    } catch {
      addToast('Failed to delete override', 'error');
    } finally {
      setDeletingOverride(false);
      setConfirmDeleteOverride(null);
    }
  };

  const columns = useMemo<Column<FeatureFlag>[]>(() => [
    { key: 'key', header: 'Key', render: (f: FeatureFlag) => <span className="font-mono text-xs">{f.key}</span> },
    { key: 'description', header: 'Description', render: (f: FeatureFlag) => <span className="text-gray-600">{f.description || '—'}</span> },
    { key: 'status', header: 'Status', render: (f: FeatureFlag) => (
      <Badge variant={f.enabled ? 'success' : 'neutral'} dot>{f.enabled ? 'Enabled' : 'Disabled'}</Badge>
    )},
    { key: 'updatedAt', header: 'Updated', render: (f: FeatureFlag) => <span className="text-xs text-gray-500">{new Date(f.updatedAt).toLocaleString()}</span> },
    { key: 'actions', header: 'Actions', render: (f: FeatureFlag) => (
      <Button
        variant={f.enabled ? 'danger' : 'primary'}
        size="sm"
        loading={togglingKey === f.key}
        onClick={(e: React.MouseEvent) => { e.stopPropagation(); setConfirmToggle(f); }}
      >
        {f.enabled ? 'Disable' : 'Enable'}
      </Button>
    )},
  ], [togglingKey]);

  return (
    <div className="p-6">
      <PageHeader
        title="Feature Flags"
        actions={<Button onClick={() => setShowCreate(true)}>+ New Flag</Button>}
      />

      {/* Create flag slide panel */}
      <SlidePanel open={showCreate} onClose={() => setShowCreate(false)} title="Create Feature Flag">
        <form onSubmit={handleCreate} className="space-y-4">
          <FormField label="Flag Key" required>
            <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="flag_key" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full" required />
          </FormField>
          <FormField label="Description">
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full" />
          </FormField>
          <Button type="submit" loading={creating}>Create Flag</Button>
        </form>
      </SlidePanel>

      {/* Overrides slide panel */}
      <SlidePanel open={!!selectedFlag} onClose={() => setSelectedFlag(null)} title={`Overrides: ${selectedFlag ?? ''}`}>
        <div className="space-y-1 mb-4 max-h-60 overflow-auto">
          {overrides.map(o => (
            <div key={o.userId} className="flex items-center justify-between text-xs bg-gray-50 px-2 py-1 rounded">
              <div>
                <span className="font-medium">{o.email || o.userId}</span>
                <Badge variant={o.enabled ? 'success' : 'error'} className="ml-2">{o.enabled ? 'ON' : 'OFF'}</Badge>
                {o.reason && <span className="text-gray-400 ml-1">({o.reason})</span>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteOverride(o.userId)}>✕</Button>
            </div>
          ))}
          {overrides.length === 0 && <p className="text-gray-400 text-xs">No overrides</p>}
        </div>

        <form onSubmit={handleAddOverride} className="space-y-3">
          <FormField label="User ID" required>
            <input value={ovUserId} onChange={e => setOvUserId(e.target.value)} placeholder="User ID" className="border border-gray-300 rounded px-2 py-1 text-xs w-full" required />
          </FormField>
          <div className="flex gap-2">
            <FormField label="State" className="shrink-0">
              <select value={ovEnabled ? 'true' : 'false'} onChange={e => setOvEnabled(e.target.value === 'true')} className="border border-gray-300 rounded px-2 py-1 text-xs">
                <option value="true">Force ON</option>
                <option value="false">Force OFF</option>
              </select>
            </FormField>
            <FormField label="Reason" className="flex-1">
              <input value={ovReason} onChange={e => setOvReason(e.target.value)} placeholder="Reason (optional)" className="border border-gray-300 rounded px-2 py-1 text-xs w-full" />
            </FormField>
          </div>
          <Button type="submit" loading={addingOverride} className="w-full">Add Override</Button>
        </form>
      </SlidePanel>

      {/* Confirm toggle dialog */}
      <ConfirmDialog
        open={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        onConfirm={() => confirmToggle && handleToggle(confirmToggle)}
        title={confirmToggle?.enabled ? 'Disable Flag' : 'Enable Flag'}
        message={`Are you sure you want to ${confirmToggle?.enabled ? 'disable' : 'enable'} "${confirmToggle?.key}"?`}
        confirmLabel={confirmToggle?.enabled ? 'Disable' : 'Enable'}
        destructive={!!confirmToggle?.enabled}
        loading={!!togglingKey}
      />

      {/* Confirm delete override dialog */}
      <ConfirmDialog
        open={!!confirmDeleteOverride}
        onClose={() => setConfirmDeleteOverride(null)}
        onConfirm={() => confirmDeleteOverride && handleDeleteOverride(confirmDeleteOverride)}
        title="Delete Override"
        message={`Are you sure you want to delete the override for "${confirmDeleteOverride}"?`}
        confirmLabel="Delete"
        destructive
        loading={deletingOverride}
      />

      <DataTable<FeatureFlag>
        columns={columns}
        data={flags}
        keyField="key"
        loading={loading}
        emptyIcon="🚩"
        emptyMessage="No feature flags configured"
        onRowClick={(f: FeatureFlag) => loadOverrides(f.key)}
        selectedKey={selectedFlag}
      />
    </div>
  );
}
