import { useEffect, useState, useMemo } from 'react';
import type { Announcement } from '../hooks/useAdmin';
import { PageHeader, Button, DataTable, ConfirmDialog, FormField, Badge, useToast, type Column } from '../components/ui';

function simpleMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 underline">$1</a>')
    .replace(/\n/g, '<br>');
}

export default function AnnouncementsPage({
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
}: {
  getAnnouncements: () => Promise<{ announcements: Announcement[] }>;
  createAnnouncement: (data: { title: string; body: string }) => Promise<{ id: string }>;
  updateAnnouncement: (id: string, data: { title?: string; body?: string; active?: boolean }) => Promise<{ message: string }>;
  deleteAnnouncement: (id: string) => Promise<{ message: string }>;
}) {
  const { addToast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [saving, setSaving] = useState(false);

  // Confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    getAnnouncements().then((d) => setAnnouncements(d.announcements)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [getAnnouncements]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createAnnouncement({ title: newTitle.trim(), body: newBody.trim() });
      setNewTitle('');
      setNewBody('');
      setShowCreate(false);
      addToast('Announcement created', 'success');
      load();
    } catch {
      addToast('Failed to create announcement', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (a: Announcement) => {
    try {
      await updateAnnouncement(a.id, { active: !a.active });
      addToast(`Announcement ${a.active ? 'deactivated' : 'activated'}`, 'success');
      load();
    } catch {
      addToast('Failed to update announcement', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAnnouncement(deleteTarget.id);
      addToast('Announcement deleted', 'success');
      load();
    } catch {
      addToast('Failed to delete announcement', 'error');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleEditSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateAnnouncement(editing.id, { title: editing.title, body: editing.body });
      setEditing(null);
      addToast('Announcement updated', 'success');
      load();
    } catch {
      addToast('Failed to update announcement', 'error');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<Column<Announcement>[]>(() => [
    {
      key: 'title',
      header: 'Title',
      render: (a) => {
        if (editing?.id === a.id) {
          return (
            <input
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full"
              onClick={(e) => e.stopPropagation()}
            />
          );
        }
        return <span className="font-semibold">{a.title}</span>;
      },
    },
    {
      key: 'body',
      header: 'Body',
      render: (a) => {
        if (editing?.id === a.id) {
          return (
            <div className="flex gap-2">
              <textarea
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                rows={2}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full flex-1"
                onClick={(e) => e.stopPropagation()}
              />
              <div
                className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm bg-gray-50 overflow-auto"
                style={{ minHeight: '3rem' }}
                dangerouslySetInnerHTML={{ __html: simpleMarkdown(editing.body) }}
              />
            </div>
          );
        }
        return <span className="text-sm text-gray-600">{a.body}</span>;
      },
    },
    {
      key: 'active',
      header: 'Status',
      render: (a) => (
        <Badge variant={a.active ? 'success' : 'neutral'}>
          {a.active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (a) => <span className="text-xs text-gray-400">{new Date(a.createdAt).toLocaleString()}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (a) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {editing?.id === a.id ? (
            <>
              <Button size="sm" onClick={handleEditSave} loading={saving}>Save</Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>Edit</Button>
              <Button variant="ghost" size="sm" onClick={() => handleToggleActive(a)}>
                {a.active ? 'Deactivate' : 'Activate'}
              </Button>
              <Button variant="danger" size="sm" onClick={() => setDeleteTarget(a)}>Delete</Button>
            </>
          )}
        </div>
      ),
    },
  ], [editing, saving]);

  return (
    <div className="p-6">
      <PageHeader
        title="Announcements"
        actions={<Button onClick={() => setShowCreate(!showCreate)}>+ New Announcement</Button>}
      />

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <FormField label="Title" required className="mb-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Title"
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full"
              required
            />
          </FormField>
          <FormField label="Body" className="mb-2">
            <div className="flex gap-4">
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Body (Markdown supported)"
                rows={3}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full flex-1"
              />
              <div className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm bg-gray-50 overflow-auto" style={{ minHeight: '4.5rem' }}>
                {newBody ? (
                  <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(newBody) }} />
                ) : (
                  <span className="text-gray-400">Preview</span>
                )}
              </div>
            </div>
          </FormField>
          <Button type="submit" loading={creating}>Create</Button>
        </form>
      )}

      <DataTable
        columns={columns}
        data={announcements}
        keyField="id"
        loading={loading}
        emptyIcon="📢"
        emptyMessage="No announcements."
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Announcement"
        message={`Delete announcement "${deleteTarget?.title}"?`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
      />
    </div>
  );
}
