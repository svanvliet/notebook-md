import { useState, useEffect, useCallback } from 'react';
import { XIcon } from '../icons/Icons';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface ShareNotebookModalProps {
  notebookId: string;
  notebookName: string;
  onClose: () => void;
  initialTab?: Tab;
}

type Tab = 'invite' | 'members' | 'links';

interface Member {
  userId: string;
  email: string;
  displayName: string;
  permission: string;
  accepted: boolean;
}

interface ShareLink {
  id: string;
  token: string;
  visibility: string;
  isActive: boolean;
  createdAt: string;
}

export default function ShareNotebookModal({ notebookId, notebookName, onClose, initialTab }: ShareNotebookModalProps) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'invite');
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'editor' | 'viewer'>('editor');
  const [members, setMembers] = useState<Member[]>([]);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  const loadMembers = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/cloud/notebooks/${notebookId}/members`, { credentials: 'include' });
    const data = await res.json();
    setMembers(data.members ?? []);
  }, [notebookId]);

  const loadLinks = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/cloud/notebooks/${notebookId}/share-links`, { credentials: 'include' });
    const data = await res.json();
    setLinks(data.links ?? []);
  }, [notebookId]);

  useEffect(() => {
    loadMembers();
    loadLinks();
  }, [loadMembers, loadLinks]);

  const sendInvite = async () => {
    if (!email.trim()) return;
    setSending(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/cloud/notebooks/${notebookId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, permission }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage(data.error ?? 'Failed to send invite');
      } else {
        setMessage('Invite sent!');
        setEmail('');
        loadMembers();
      }
    } finally {
      setSending(false);
    }
  };

  const removeMember = async (userId: string) => {
    await fetch(`${API_BASE}/api/cloud/notebooks/${notebookId}/members/${userId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    loadMembers();
  };

  const changeRole = async (userId: string, newPermission: string) => {
    await fetch(`${API_BASE}/api/cloud/notebooks/${notebookId}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ permission: newPermission }),
    });
    loadMembers();
  };

  const createLink = async (visibility: 'private' | 'public') => {
    await fetch(`${API_BASE}/api/cloud/notebooks/${notebookId}/share-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ visibility }),
    });
    loadLinks();
  };

  const revokeLink = async (linkId: string) => {
    await fetch(`${API_BASE}/api/cloud/share-links/${linkId}/revoke`, {
      method: 'POST',
      credentials: 'include',
    });
    loadLinks();
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/s/${token}`;
    navigator.clipboard.writeText(url);
    setMessage('Link copied!');
    setTimeout(() => setMessage(''), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Share "{notebookName}"</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <XIcon />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-600 mb-4">
          {(['invite', 'members', 'links'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize ${
                tab === t
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Invite tab */}
        {tab === 'invite' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email address"
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <select
                value={permission}
                onChange={e => setPermission(e.target.value as 'editor' | 'viewer')}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                onClick={sendInvite}
                disabled={sending || !email.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Invite
              </button>
            </div>
            {message && <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>}
          </div>
        )}

        {/* Members tab */}
        {tab === 'members' && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {members.length === 0 && <p className="text-sm text-gray-500">No members yet</p>}
            {members.map(m => (
              <div key={m.userId} className="flex items-center justify-between py-2 px-1">
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{m.displayName || m.email}</span>
                  {m.displayName && m.email && <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">({m.email})</span>}
                  {!m.accepted && <span className="ml-2 text-xs text-yellow-600">(pending)</span>}
                </div>
                <div className="flex items-center gap-2">
                  {m.permission !== 'owner' && (
                    <>
                      <select
                        value={m.permission}
                        onChange={e => changeRole(m.userId, e.target.value)}
                        className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-1 py-0.5"
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={() => removeMember(m.userId)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </>
                  )}
                  {m.permission === 'owner' && <span className="text-xs text-gray-500">Owner</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Links tab */}
        {tab === 'links' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => createLink('public')}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Create Public Link
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {links.filter(l => l.isActive).map(l => (
                <div key={l.id} className="flex items-center justify-between py-2 px-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="text-sm">
                    <span className="font-medium text-gray-900 dark:text-white capitalize">{l.visibility}</span>
                    <span className="text-gray-500 dark:text-gray-400 ml-2">
                      Created {new Date(l.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyLink(l.token)}
                      className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => revokeLink(l.id)}
                      className="text-xs px-2 py-1 text-red-600 hover:text-red-800"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
              {links.filter(l => l.isActive).length === 0 && (
                <p className="text-sm text-gray-500">No active share links</p>
              )}
            </div>

            {message && <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
