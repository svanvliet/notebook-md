import { useEffect, useState } from 'react';
import type { Announcement } from '../hooks/useAdmin';

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
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [editing, setEditing] = useState<Announcement | null>(null);

  const load = () => getAnnouncements().then((d) => setAnnouncements(d.announcements));
  useEffect(() => { load(); }, [getAnnouncements]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await createAnnouncement({ title: newTitle.trim(), body: newBody.trim() });
    setNewTitle('');
    setNewBody('');
    setShowCreate(false);
    load();
  };

  const handleToggleActive = async (a: Announcement) => {
    await updateAnnouncement(a.id, { active: !a.active });
    load();
  };

  const handleDelete = async (a: Announcement) => {
    if (!confirm(`Delete announcement "${a.title}"?`)) return;
    await deleteAnnouncement(a.id);
    load();
  };

  const handleEditSave = async () => {
    if (!editing) return;
    await updateAnnouncement(editing.id, { title: editing.title, body: editing.body });
    setEditing(null);
    load();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Announcements</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-blue-700"
        >
          + New Announcement
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Title"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full mb-2"
            required
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Body (Markdown supported)"
            rows={3}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full mb-2"
          />
          <button type="submit" className="bg-green-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-green-700">
            Create
          </button>
        </form>
      )}

      <div className="space-y-3">
        {announcements.length === 0 ? (
          <p className="text-gray-500 text-sm">No announcements.</p>
        ) : (
          announcements.map((a) => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-4">
              {editing?.id === a.id ? (
                <div>
                  <input
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full mb-2"
                  />
                  <textarea
                    value={editing.body}
                    onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                    rows={3}
                    className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full mb-2"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleEditSave} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">
                      Save
                    </button>
                    <button onClick={() => setEditing(null)} className="border px-3 py-1 rounded text-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold">{a.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${a.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {a.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{a.body}</p>
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => setEditing(a)} className="text-blue-600 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => handleToggleActive(a)} className="text-orange-600 hover:underline">
                      {a.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => handleDelete(a)} className="text-red-600 hover:underline">
                      Delete
                    </button>
                    <span className="text-gray-400 ml-auto">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
