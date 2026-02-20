/**
 * Add Notebook Modal — multi-step flow for creating a notebook from any source.
 *
 * Step 1: Select source type (Local, GitHub, OneDrive, Google Drive, iCloud)
 * Step 2: Configure source (varies by type)
 *   - Local: just name
 *   - GitHub: pick installation → repo → branch
 *   - Others: "Coming soon" placeholder
 * Step 3: Confirm
 */

import { useState, useEffect } from 'react';
import { XIcon } from '../icons/Icons';
import { SOURCE_TYPES, SourceIcon, type SourceType } from './SourceTypes';

const API_BASE = import.meta.env.VITE_API_URL || '';
import {
  listInstallations,
  listRepos,
  listBranches,
  getInstallUrl,
  type GitHubInstallation,
  type GitHubRepo,
  type Branch,
} from '../../api/github';
import {
  checkOneDriveAccess,
  listOneDriveFolders,
  type OneDriveFolder,
} from '../../api/onedrive';
import {
  checkGoogleDriveAccess,
  listGoogleDriveFolders,
  type GoogleDriveFolder,
} from '../../api/googledrive';

interface AddNotebookModalProps {
  onAdd: (name: string, sourceType: SourceType, sourceConfig: Record<string, unknown>) => void;
  onCancel: () => void;
  userId?: string;
  initialSource?: string | null;
  isDemoMode?: boolean;
  onDemoSignUp?: () => void;
}

type Step = 'source' | 'configure' | 'name';

export function AddNotebookModal({ onAdd, onCancel, userId, initialSource, isDemoMode, onDemoSignUp }: AddNotebookModalProps) {
  const validSource = initialSource && initialSource in SOURCE_TYPES ? initialSource as SourceType : null;
  const [step, setStep] = useState<Step>(validSource ? 'configure' : 'source');
  const [sourceType, setSourceType] = useState<SourceType | null>(validSource);
  const [sourceConfig, setSourceConfig] = useState<Record<string, unknown>>({});
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSelectSource(type: SourceType) {
    const info = SOURCE_TYPES[type];
    if (!info.available) return;
    setSourceType(type);
    setError(null);
    if (type === 'local') {
      setStep('name');
    } else {
      setStep('configure');
    }
  }

  function handleConfigured(config: Record<string, unknown>, suggestedName: string) {
    setSourceConfig(config);
    setName(suggestedName);
    setStep('name');
  }

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    onAdd(trimmed, sourceType!, sourceConfig);
  }

  function goBack() {
    if (step === 'name' && sourceType !== 'local') {
      setStep('configure');
    } else {
      setStep('source');
      setSourceType(null);
      setSourceConfig({});
    }
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {step === 'source' && 'Add Notebook'}
            {step === 'configure' && `Configure ${SOURCE_TYPES[sourceType!]?.label}`}
            {step === 'name' && 'Name Your Notebook'}
          </h2>
          <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 min-h-[220px]">
          {step === 'source' && <SourcePicker onSelect={handleSelectSource} isDemoMode={isDemoMode} onDemoSignUp={onDemoSignUp} />}
          {step === 'configure' && sourceType === 'github' && (
            <GitHubConfig onConfigured={handleConfigured} onBack={goBack} />
          )}
          {step === 'configure' && sourceType === 'onedrive' && (
            <OneDriveConfig onConfigured={handleConfigured} onBack={goBack} userId={userId} />
          )}
          {step === 'configure' && sourceType === 'google-drive' && (
            <GoogleDriveConfig onConfigured={handleConfigured} onBack={goBack} userId={userId} />
          )}
          {step === 'configure' && sourceType && sourceType !== 'github' && sourceType !== 'onedrive' && sourceType !== 'google-drive' && (
            <ComingSoon sourceType={sourceType} onBack={goBack} />
          )}
          {step === 'name' && (
            <NameStep
              name={name}
              onChange={setName}
              error={error}
              sourceType={sourceType!}
              onBack={goBack}
              onCreate={handleCreate}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Source picker ─────────────────────────────────────────────────

function SourcePicker({ onSelect, isDemoMode, onDemoSignUp }: { onSelect: (type: SourceType) => void; isDemoMode?: boolean; onDemoSignUp?: () => void }) {
  const types = Object.entries(SOURCE_TYPES) as [SourceType, typeof SOURCE_TYPES[SourceType]][];

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Choose where your notebook files are stored:</p>
      {types.map(([type, info]) => {
        const isRemote = type !== 'local';
        const demoLocked = isDemoMode && isRemote && info.available;
        const disabled = !info.available || (isDemoMode && isRemote);
        return (
          <button
            key={type}
            onClick={() => demoLocked && onDemoSignUp ? onDemoSignUp() : onSelect(type)}
            disabled={!info.available && !demoLocked}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
              demoLocked
                ? 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer'
                : !disabled
                  ? 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer'
                  : 'border-gray-100 dark:border-gray-800 opacity-50 cursor-not-allowed'
            }`}
          >
            <SourceIcon sourceType={type} className="w-5 h-5" />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-900 dark:text-white">{info.label}</span>
              {!info.available && (
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">Coming soon</span>
              )}
              {demoLocked && (
                <span className="ml-2 text-xs text-blue-500 dark:text-blue-400">Sign up to connect →</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Step 2a: GitHub config ────────────────────────────────────────────────

function GitHubConfig({ onConfigured, onBack }: { onConfigured: (config: Record<string, unknown>, name: string) => void; onBack: () => void }) {
  const [installations, setInstallations] = useState<GitHubInstallation[]>([]);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedInstall, setSelectedInstall] = useState<GitHubInstallation | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInstallations();
  }, []);

  async function loadInstallations() {
    try {
      setLoading(true);
      const installs = await listInstallations();
      setInstallations(installs);
      if (installs.length === 1) {
        handleSelectInstallation(installs[0]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectInstallation(install: GitHubInstallation) {
    setSelectedInstall(install);
    setSelectedRepo(null);
    setSelectedBranch(null);
    setBranches([]);
    try {
      setLoading(true);
      setError(null);
      const { repos } = await listRepos(install.installationId);
      setRepos(repos);
    } catch (err) {
      const msg = (err as Error).message;
      // If installation was removed, refresh the list
      if (msg.includes('removed') || msg.includes('re-install')) {
        setInstallations((prev) => prev.filter((i) => i.installationId !== install.installationId));
        setSelectedInstall(null);
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectRepo(repo: GitHubRepo) {
    setSelectedRepo(repo);
    setSelectedBranch(null);
    try {
      setLoading(true);
      setError(null);
      const branchList = await listBranches(repo.owner, repo.name);
      setBranches(branchList);
      setSelectedBranch(repo.default_branch);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleConfirmBranch() {
    if (!selectedRepo || !selectedBranch) return;
    onConfigured(
      {
        installationId: selectedInstall!.installationId,
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
        rootPath: `${selectedRepo.owner}/${selectedRepo.name}`,
        defaultBranch: selectedRepo.default_branch,
        branch: selectedBranch,
      },
      selectedRepo.name,
    );
  }

  async function handleInstallApp() {
    try {
      const url = await getInstallUrl();
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <div className="flex gap-2">
          <button onClick={onBack} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">Back</button>
          <button onClick={loadInstallations} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">Retry</button>
        </div>
      </div>
    );
  }

  // No installations — prompt to install the app
  if (installations.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          To access your GitHub repositories, you need to install the Notebook.md GitHub App on your account or organization.
        </p>
        <div className="flex gap-2">
          <button onClick={onBack} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">Back</button>
          <button onClick={handleInstallApp} className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 flex items-center gap-2">
            <SourceIcon sourceType="github" className="w-4 h-4" />
            Install GitHub App
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          If the app is already installed on your GitHub account, click <strong>Install GitHub App</strong> above and select your account to re-authorize it for this Notebook.md account.
        </p>
      </div>
    );
  }

  // Pick installation (if multiple)
  if (!selectedInstall || (installations.length > 1 && repos.length === 0)) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Select a GitHub account:</p>
        {installations.map((install) => (
          <button
            key={install.id}
            onClick={() => handleSelectInstallation(install)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-left"
          >
            <SourceIcon sourceType="github" className="w-4 h-4" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">{install.accountLogin}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{install.accountType}</span>
          </button>
        ))}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <button onClick={handleInstallApp} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            Install on another account…
          </button>
        </div>
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-2">← Back</button>
      </div>
    );
  }

  // Pick branch (after repo selected)
  if (selectedRepo && branches.length > 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Select a branch from <strong>{selectedRepo.owner}/{selectedRepo.name}</strong>:
          </p>
          <button onClick={() => { setSelectedRepo(null); setBranches([]); setSelectedBranch(null); }} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            Change repo
          </button>
        </div>
        <select
          value={selectedBranch ?? ''}
          onChange={(e) => setSelectedBranch(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {branches.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}{b.name === selectedRepo.default_branch ? ' (default)' : ''}{b.protected ? ' 🔒' : ''}
            </option>
          ))}
        </select>
        <div className="flex gap-2 pt-2">
          <button onClick={() => { setSelectedRepo(null); setBranches([]); setSelectedBranch(null); }} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">← Back</button>
          <button
            onClick={handleConfirmBranch}
            disabled={!selectedBranch}
            className="ml-auto px-4 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Select
          </button>
        </div>
      </div>
    );
  }

  // Pick repo
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">Select a repository from <strong>{selectedInstall.accountLogin}</strong>:</p>
        {installations.length > 1 && (
          <button onClick={() => { setSelectedInstall(null); setRepos([]); }} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
            Change account
          </button>
        )}
      </div>
      <div className="max-h-[240px] overflow-y-auto space-y-1">
        {repos.map((repo) => (
          <button
            key={repo.id}
            onClick={() => handleSelectRepo(repo)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
              selectedRepo?.id === repo.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30'
            }`}
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate block">{repo.name}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">{repo.default_branch} • {repo.private ? 'Private' : 'Public'}</span>
            </div>
          </button>
        ))}
      </div>
      <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mt-2">← Back</button>
    </div>
  );
}

// ── Step 2b: OneDrive config ──────────────────────────────────────────────

interface OneDriveConfigProps {
  onConfigured: (config: Record<string, unknown>, name: string) => void;
  onBack: () => void;
  userId?: string;
}

function OneDriveConfig({ onConfigured, onBack, userId }: OneDriveConfigProps) {
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(false);
  const [folders, setFolders] = useState<OneDriveFolder[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAccess();
  }, []);

  async function checkAccess() {
    try {
      setLoading(true);
      const status = await checkOneDriveAccess();
      setLinked(status.linked);
      if (status.linked) {
        await loadFolders('');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadFolders(path: string) {
    try {
      setLoading(true);
      setError(null);
      const items = await listOneDriveFolders(path);
      setFolders(items);
      setCurrentPath(path);
      if (path) {
        setBreadcrumbs(path.split('/'));
      } else {
        setBreadcrumbs([]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function navigateTo(index: number) {
    if (index < 0) {
      loadFolders('');
    } else {
      const path = breadcrumbs.slice(0, index + 1).join('/');
      loadFolders(path);
    }
  }

  function selectFolder(folder: OneDriveFolder) {
    loadFolders(folder.path);
  }

  function useCurrentFolder() {
    const folderName = currentPath ? currentPath.split('/').pop()! : 'OneDrive';
    onConfigured(
      {
        rootPath: currentPath || '/',
        provider: 'onedrive',
      },
      folderName,
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!linked) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          To access OneDrive, you need to link your Microsoft account. Go to your account settings and connect Microsoft.
        </p>
        <div className="flex gap-2">
          <button onClick={onBack} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">Back</button>
          <button onClick={() => {
              const params = new URLSearchParams({
                returnTo: '/?source=onedrive',
                ...(userId ? { linkToUser: userId } : {}),
              });
              window.location.href = `${API_BASE}/auth/oauth/microsoft?${params.toString()}`;
            }} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2">
            <SourceIcon sourceType="onedrive" className="w-4 h-4" />
            Link Microsoft Account
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <div className="flex gap-2">
          <button onClick={onBack} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">Back</button>
          <button onClick={checkAccess} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        <button onClick={() => navigateTo(-1)} className="hover:text-blue-600 dark:hover:text-blue-400">
          OneDrive
        </button>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            <span>/</span>
            <button onClick={() => navigateTo(i)} className="hover:text-blue-600 dark:hover:text-blue-400">
              {crumb}
            </button>
          </span>
        ))}
      </div>

      {/* Folder list */}
      <div className="max-h-[200px] overflow-y-auto space-y-1">
        {folders.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No subfolders here</p>
        ) : (
          folders.map((folder) => (
            <button
              key={folder.path}
              onClick={() => selectFolder(folder)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-left"
            >
              <svg className="w-4 h-4 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate block">{folder.name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{folder.childCount} items</span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-800">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">← Back</button>
        <button
          onClick={useCurrentFolder}
          className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium"
        >
          Use this folder
        </button>
      </div>
    </div>
  );
}

// ── Step 2b-2: Google Drive config ────────────────────────────────────────

interface GoogleDriveConfigProps {
  onConfigured: (config: Record<string, unknown>, name: string) => void;
  onBack: () => void;
  userId?: string;
}

function GoogleDriveConfig({ onConfigured, onBack, userId }: GoogleDriveConfigProps) {
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [folders, setFolders] = useState<GoogleDriveFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAccess();
  }, []);

  async function checkAccess() {
    try {
      setLoading(true);
      const status = await checkGoogleDriveAccess();
      setLinked(status.linked);
      setNeedsReauth(!status.linked && status.reason === 'insufficient_scope');
      if (status.linked) {
        await loadFolders('root');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadFolders(parentId: string) {
    try {
      setLoading(true);
      setError(null);
      const items = await listGoogleDriveFolders(parentId);
      setFolders(items);
      setCurrentFolderId(parentId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function navigateInto(folder: GoogleDriveFolder) {
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    loadFolders(folder.id);
  }

  function navigateTo(index: number) {
    if (index < 0) {
      setBreadcrumbs([]);
      loadFolders('root');
    } else {
      const target = breadcrumbs[index];
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
      loadFolders(target.id);
    }
  }

  function useCurrentFolder() {
    const folderName = breadcrumbs.length > 0
      ? breadcrumbs[breadcrumbs.length - 1].name
      : 'Google Drive';
    onConfigured(
      {
        rootPath: currentFolderId,
        provider: 'google-drive',
      },
      folderName,
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!linked) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {needsReauth
            ? 'Your Google account is linked but doesn\'t have Drive permissions. Please re-authorize to grant file access.'
            : 'To access Google Drive, you need to link your Google account with Drive permissions.'}
        </p>
        <div className="flex gap-2">
          <button onClick={onBack} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">Back</button>
          <button onClick={() => {
              const params = new URLSearchParams({
                returnTo: '/?source=google-drive',
                ...(userId ? { linkToUser: userId } : {}),
              });
              window.location.href = `${API_BASE}/auth/oauth/google?${params.toString()}`;
            }} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2">
            <SourceIcon sourceType="google-drive" className="w-4 h-4" />
            {needsReauth ? 'Re-authorize Google Drive' : 'Link Google Account'}
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <div className="flex gap-2">
          <button onClick={onBack} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">Back</button>
          <button onClick={checkAccess} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        <button onClick={() => navigateTo(-1)} className="hover:text-blue-600 dark:hover:text-blue-400">
          My Drive
        </button>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <span>/</span>
            <button onClick={() => navigateTo(i)} className="hover:text-blue-600 dark:hover:text-blue-400">
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      {/* Folder list */}
      <div className="max-h-[200px] overflow-y-auto space-y-1">
        {folders.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No subfolders here</p>
        ) : (
          folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => navigateInto(folder)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 text-left"
            >
              <svg className="w-4 h-4 text-green-500 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{folder.name}</span>
            </button>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-800">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">← Back</button>
        <button
          onClick={useCurrentFolder}
          className="px-4 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium"
        >
          Use this folder
        </button>
      </div>
    </div>
  );
}

// ── Step 2c: Coming soon placeholder ──────────────────────────────────────

function ComingSoon({ sourceType, onBack }: { sourceType: SourceType; onBack: () => void }) {
  const info = SOURCE_TYPES[sourceType];
  return (
    <div className="text-center py-8">
      <SourceIcon sourceType={sourceType} className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {info.label} integration is coming soon!
      </p>
      <button onClick={onBack} className="px-4 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
        ← Back
      </button>
    </div>
  );
}

// ── Step 3: Name the notebook ─────────────────────────────────────────────

function NameStep({
  name,
  onChange,
  error,
  sourceType,
  onBack,
  onCreate,
}: {
  name: string;
  onChange: (v: string) => void;
  error: string | null;
  sourceType: SourceType;
  onBack: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <SourceIcon sourceType={sourceType} className="w-4 h-4" />
        <span>{SOURCE_TYPES[sourceType].label}</span>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notebook name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCreate()}
          autoFocus
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="My Notebook"
        />
        {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
      </div>
      <div className="flex justify-between">
        <button onClick={onBack} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
          ← Back
        </button>
        <button onClick={onCreate} className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium">
          Create Notebook
        </button>
      </div>
    </div>
  );
}
