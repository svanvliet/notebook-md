import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';

interface ShareInfo {
  notebookName: string;
  ownerName: string;
  files: { path: string; size: number }[];
}

interface DocumentContent {
  content: string;
  path: string;
}

export default function PublicDocumentViewer() {
  const { token } = useParams<{ token: string }>();
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    apiFetch(`/api/public/shares/${token}/resolve`)
      .then(res => res.json())
      .then(data => {
        setShareInfo(data);
        // Auto-select first .md file
        const mdFile = data.files?.find((f: any) => f.path.endsWith('.md'));
        if (mdFile) setSelectedFile(mdFile.path);
      })
      .catch(() => setError('This share link is invalid or has been revoked.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || !selectedFile) return;
    apiFetch(`/api/public/shares/${token}/documents/${encodeURIComponent(selectedFile)}`)
      .then(res => res.json())
      .then(data => setDocument(data))
      .catch(() => setDocument(null));
  }, [token, selectedFile]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!shareInfo) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{shareInfo.notebookName}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Shared by {shareInfo.ownerName} · View only</p>
      </header>

      <div className="flex">
        {/* File sidebar */}
        <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Files</h3>
          <ul className="space-y-1">
            {shareInfo.files.map(f => (
              <li key={f.path}>
                <button
                  onClick={() => setSelectedFile(f.path)}
                  className={`w-full text-left px-2 py-1 rounded text-sm ${
                    selectedFile === f.path
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {f.path}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Content area */}
        <main className="flex-1 p-8">
          {document ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-4xl mx-auto">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-mono">
                {document.content}
              </pre>
            </div>
          ) : selectedFile ? (
            <p className="text-gray-500 text-center">Loading document...</p>
          ) : (
            <p className="text-gray-500 text-center">Select a file to view</p>
          )}
        </main>
      </div>
    </div>
  );
}
