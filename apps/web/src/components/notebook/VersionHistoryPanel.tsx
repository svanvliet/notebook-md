import { useState, useEffect, useCallback } from 'react';
import { XIcon } from '../icons/Icons';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface Version {
  id: string;
  versionNumber: number;
  sizeBytes: number;
  createdBy: string;
  createdAt: string;
}

interface VersionHistoryPanelProps {
  documentId: string;
  onClose: () => void;
  onPreview?: (content: string, versionNumber: number) => void;
}

export default function VersionHistoryPanel({ documentId, onClose, onPreview }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/cloud/documents/${documentId}/versions`, { credentials: 'include' });
      const data = await res.json();
      setVersions(data.versions ?? []);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { loadVersions(); }, [loadVersions]);

  const previewVersion = async (versionId: string, versionNumber: number) => {
    const res = await fetch(`${API_BASE}/api/cloud/documents/${documentId}/versions/${versionId}`, { credentials: 'include' });
    const data = await res.json();
    onPreview?.(data.content, versionNumber);
  };

  const restoreVersion = async (versionId: string) => {
    setRestoring(versionId);
    try {
      const res = await fetch(`${API_BASE}/api/cloud/documents/${documentId}/versions/${versionId}/restore`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setMessage('Version restored');
        loadVersions();
      } else {
        const data = await res.json();
        setMessage(data.error ?? 'Failed to restore');
      }
    } finally {
      setRestoring(null);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-lg z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Version History</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <XIcon />
        </button>
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {loading && <p className="p-4 text-sm text-gray-500">Loading...</p>}
        {!loading && versions.length === 0 && <p className="p-4 text-sm text-gray-500">No versions yet</p>}
        {versions.map(v => (
          <div key={v.id} className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900 dark:text-white">v{v.versionNumber}</span>
              <span className="text-xs text-gray-500">{formatSize(v.sizeBytes)}</span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {v.createdBy} · {new Date(v.createdAt).toLocaleString()}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => previewVersion(v.id, v.versionNumber)}
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
              >
                Preview
              </button>
              <button
                onClick={() => restoreVersion(v.id)}
                disabled={restoring === v.id}
                className="text-xs text-green-600 hover:text-green-800 dark:text-green-400 disabled:opacity-50"
              >
                {restoring === v.id ? 'Restoring...' : 'Restore'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Status message */}
      {message && (
        <div className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
          {message}
        </div>
      )}
    </div>
  );
}
