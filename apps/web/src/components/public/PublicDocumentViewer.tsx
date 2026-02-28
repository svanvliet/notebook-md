import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';
import { markdownToHtml, isMarkdownContent } from '../editor/markdownConverter';
import { NotebookIcon, ChevronRightIcon } from '../icons/Icons';
import '../editor/editor.css';

interface ShareInfo {
  notebookName: string;
  ownerName: string;
  files: { path: string; size: number }[];
}

interface DocumentContent {
  content: string;
  path: string;
}

/* ── Tree helpers ─────────────────────────────────────────── */

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
}

function buildTree(files: { path: string }[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  const getOrCreateFolder = (folderPath: string): TreeNode => {
    if (folderMap.has(folderPath)) return folderMap.get(folderPath)!;
    const parts = folderPath.split('/');
    const name = parts[parts.length - 1];
    const node: TreeNode = { name, path: folderPath, isFolder: true, children: [] };
    folderMap.set(folderPath, node);
    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      getOrCreateFolder(parentPath).children.push(node);
    }
    return node;
  };

  for (const f of files) {
    const parts = f.path.split('/');
    const name = parts[parts.length - 1];
    const fileNode: TreeNode = { name, path: f.path, isFolder: false, children: [] };
    if (parts.length === 1) {
      root.push(fileNode);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      getOrCreateFolder(parentPath).children.push(fileNode);
    }
  }

  // Sort: folders first, then alphabetically
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(n => { if (n.isFolder) sortNodes(n.children); });
  };
  sortNodes(root);
  return root;
}

function pickInitialFile(files: { path: string }[]): string | null {
  // 1. README.md at root
  const readme = files.find(f => /^readme\.md$/i.test(f.path));
  if (readme) return readme.path;
  // 2. First .md at root (no slash)
  const rootMd = files.find(f => !f.path.includes('/') && f.path.endsWith('.md'));
  if (rootMd) return rootMd.path;
  // 3. First .md anywhere
  const anyMd = files.find(f => f.path.endsWith('.md'));
  if (anyMd) return anyMd.path;
  // 4. First file
  return files[0]?.path ?? null;
}

/* ── File icon (lightweight copy from NotebookTree) ───────── */

function FileIcon({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  const isMd = ext === 'md' || ext === 'mdx' || ext === 'markdown';
  if (isMd) {
    return (
      <svg className={`${className} text-blue-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    );
  }
  return (
    <svg className={`${className} text-gray-400 dark:text-gray-500`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

/* ── Sidebar tree node ────────────────────────────────────── */

function TreeItem({
  node, depth, selectedFile, expandedFolders, onSelect, onToggle,
}: {
  node: TreeNode; depth: number; selectedFile: string | null;
  expandedFolders: Set<string>; onSelect: (p: string) => void; onToggle: (p: string) => void;
}) {
  const isExpanded = expandedFolders.has(node.path);

  if (node.isFolder) {
    return (
      <li>
        <button
          onClick={() => onToggle(node.path)}
          className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <ChevronRightIcon className={`w-3 h-3 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          <svg className="w-4 h-4 shrink-0 text-blue-500 dark:text-blue-400" viewBox="0 0 24 24" fill="currentColor">
            {isExpanded
              ? <path d="M19.906 9c.382 0 .749.057 1.094.162V9a3 3 0 0 0-3-3h-3.879a.75.75 0 0 1-.53-.22L11.47 3.66A2.25 2.25 0 0 0 9.879 3H6a3 3 0 0 0-3 3v3.162A3.756 3.756 0 0 1 4.094 9h15.812ZM4.094 10.5a2.25 2.25 0 0 0-2.227 2.568l.857 6A2.25 2.25 0 0 0 4.951 21h14.098a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-2.227-2.568H4.094Z" />
              : <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 9h-15a4.483 4.483 0 0 0-3 1.146Z" />
            }
          </svg>
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && (
          <ul>
            {node.children.map(child => (
              <TreeItem key={child.path} node={child} depth={depth + 1}
                selectedFile={selectedFile} expandedFolders={expandedFolders}
                onSelect={onSelect} onToggle={onToggle} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={() => onSelect(node.path)}
        className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-sm ${
          selectedFile === node.path
            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <FileIcon name={node.name} className="w-4 h-4 shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}

/* ── Main component ───────────────────────────────────────── */

export default function PublicDocumentViewer() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentContent | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const tree = useMemo(() => (shareInfo ? buildTree(shareInfo.files) : []), [shareInfo]);

  // Auto-expand folders containing the selected file
  useEffect(() => {
    if (!selectedFile) return;
    const parts = selectedFile.split('/');
    if (parts.length <= 1) return;
    const folders = new Set(expandedFolders);
    for (let i = 1; i < parts.length; i++) {
      folders.add(parts.slice(0, i).join('/'));
    }
    setExpandedFolders(folders);
    // Only run when selected file changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile]);

  useEffect(() => {
    if (!token) return;
    apiFetch(`/api/public/shares/${token}/resolve`)
      .then(res => {
        if (!res.ok) throw new Error(res.status === 403 ? 'disabled' : 'invalid');
        return res.json();
      })
      .then(data => {
        setShareInfo(data);
        const initial = pickInitialFile(data.files ?? []);
        if (initial) setSelectedFile(initial);
      })
      .catch((err) => {
        const msg = err.message === 'disabled'
          ? 'Public links are currently disabled.'
          : 'This share link is invalid or has been revoked.';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || !selectedFile) return;
    setDocLoading(true);
    apiFetch(`/api/public/shares/${token}/documents/${encodeURIComponent(selectedFile)}`)
      .then(res => res.json())
      .then(data => setDocument(data))
      .catch(() => setDocument(null))
      .finally(() => setDocLoading(false));
  }, [token, selectedFile]);

  const renderedHtml = useMemo(() => {
    if (!document?.content) return '';
    const raw = document.content;
    // Content may be raw markdown or TipTap HTML
    return isMarkdownContent(raw) ? markdownToHtml(raw) : raw;
  }, [document]);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="animate-pulse text-gray-400">Loading...</div>
    </div>
  );
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <p className="text-lg text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button
          onClick={() => navigate('/', { replace: true })}
          className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
        >
          Go to Notebook.md
        </button>
      </div>
    </div>
  );
  if (!shareInfo) return null;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header with branding */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <a href="/" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity" title="Notebook.md">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <NotebookIcon className="w-4 h-4 text-white" />
            </div>
          </a>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-gray-900 dark:text-white truncate">{shareInfo.notebookName}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Shared by {shareInfo.ownerName} · View only</p>
          </div>
        </div>
        <a
          href="/"
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
        >
          Try Notebook.md
        </a>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* File sidebar */}
        <aside className="w-56 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto shrink-0">
          <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-4 pt-3 pb-2">Files</h3>
          <ul className="pb-3">
            {tree.map(node => (
              <TreeItem key={node.path} node={node} depth={0}
                selectedFile={selectedFile} expandedFolders={expandedFolders}
                onSelect={setSelectedFile} onToggle={toggleFolder} />
            ))}
          </ul>
        </aside>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto">
          {docLoading ? (
            <div className="p-8 text-center">
              <div className="animate-pulse text-gray-400">Loading document...</div>
            </div>
          ) : document ? (
            <div className="px-8 py-6 max-w-5xl">
              <article
                className="prose dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            </div>
          ) : selectedFile ? (
            <p className="text-gray-500 dark:text-gray-400 text-center p-8">Unable to load document.</p>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center p-8">Select a file to view</p>
          )}
        </main>
      </div>

      {/* Bottom CTA banner */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between shrink-0">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Create and share beautiful notebooks with <span className="font-medium text-gray-700 dark:text-gray-300">Notebook.md</span>
        </p>
        <a
          href="/"
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
        >
          Sign up free
        </a>
      </footer>
    </div>
  );
}
