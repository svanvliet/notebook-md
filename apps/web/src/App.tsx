import { useState, useCallback, useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { NotebookPane } from './components/layout/NotebookPane';
import { DocumentPane } from './components/layout/DocumentPane';
import type { Tab } from './components/layout/DocumentPane';
import { StatusBar } from './components/layout/StatusBar';
import { WelcomeScreen } from './components/welcome/WelcomeScreen';
import { InputModal } from './components/common/InputModal';
import { SaveLocationPicker } from './components/common/SaveLocationPicker';
import { SettingsModal } from './components/settings/SettingsModal';
import { AccountModal } from './components/account/AccountModal';
import { useDisplayMode } from './hooks/useDisplayMode';
import { useSidebarResize } from './hooks/useSidebarResize';
import { useNotebookManager } from './hooks/useNotebookManager';
import { useAuth } from './hooks/useAuth';
import { useSettings } from './hooks/useSettings';

export default function App() {
  const { mode, setMode } = useDisplayMode();
  const sidebar = useSidebarResize();
  const nb = useNotebookManager();
  const auth = useAuth();
  const { settings, updateSettings } = useSettings(auth.isSignedIn);

  // Status bar state
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Modal states
  const [showSettings, setShowSettings] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  // Handle magic link and email verification from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magicToken = params.get('token');
    const path = window.location.pathname;

    if (path === '/auth/magic-link' && magicToken) {
      auth.verifyMagicLink(magicToken).then(() => {
        window.history.replaceState({}, '', '/');
      });
    } else if (path === '/auth/verify-email' && magicToken) {
      fetch(`/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: magicToken }),
      }).then(() => {
        window.history.replaceState({}, '', '/');
      });
    }

    // Clean up auth=success from OAuth callback
    if (params.has('auth')) {
      params.delete('auth');
      params.delete('new');
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  const handleWordCountChange = useCallback((words: number, chars: number) => {
    setWordCount(words);
    setCharCount(chars);
  }, []);

  // Map OpenTab[] to Tab[] for DocumentPane
  const docTabs: Tab[] = nb.tabs.map((t) => ({
    id: t.id,
    name: t.name,
    hasUnsavedChanges: t.hasUnsavedChanges,
    content: t.content,
  }));

  const lastSaved = nb.activeTab?.lastSaved
    ? new Date(nb.activeTab.lastSaved).toLocaleTimeString()
    : null;

  // Drag-and-drop handler for markdown files
  const SUPPORTED_EXTS = new Set(['md', 'mdx', 'markdown', 'txt']);
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (!e.dataTransfer.files?.length) return;
      for (const file of Array.from(e.dataTransfer.files)) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        if (!SUPPORTED_EXTS.has(ext)) continue;
        const content = await file.text();
        nb.handleDropImport(file.name, content);
      }
    },
    [nb],
  );

  // Welcome screen when not signed in
  if (!auth.isSignedIn && !auth.loading) {
    const handleOAuth = (provider: string) => {
      window.location.href = `/auth/oauth/${provider}?returnTo=/`;
    };
    return (
      <div>
        <WelcomeScreen
          onSignIn={auth.signIn}
          onSignUp={auth.signUp}
          onMagicLink={auth.requestMagicLink}
          onOAuth={handleOAuth}
          error={auth.error}
          onClearError={auth.clearError}
        />
        {/* Dev shortcut to skip auth */}
        {process.env.NODE_ENV !== 'production' && (
          <button
            onClick={auth.devSkipAuth}
            className="fixed bottom-4 right-4 px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-md hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            Skip to app (dev)
          </button>
        )}
      </div>
    );
  }

  // Loading state
  if (auth.loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <TitleBar
        displayMode={mode}
        onDisplayModeChange={setMode}
        user={auth.user}
        onSignOut={auth.signOut}
        onOpenAccount={() => setShowAccount(true)}
        onOpenSettings={() => setShowSettings(true)}
      />
      <div className="flex-1 flex min-h-0">
        <NotebookPane
          width={sidebar.width}
          collapsed={sidebar.collapsed}
          onToggleCollapse={sidebar.toggleCollapse}
          onResizeMouseDown={sidebar.onMouseDown}
          notebooks={nb.notebooks}
          files={nb.files}
          onCreateNotebook={nb.handleCreateNotebook}
          onDeleteNotebook={nb.handleDeleteNotebook}
          onRenameNotebook={nb.handleRenameNotebook}
          onCreateFile={nb.handleCreateFile}
          onImportFile={nb.handleImportFile}
          onDeleteFile={nb.handleDeleteFile}
          onRenameFile={nb.handleRenameFile}
          onOpenFile={nb.handleOpenFile}
          activeFilePath={nb.activeTabId}
        />
        <DocumentPane
          tabs={docTabs}
          activeTabId={nb.activeTabId}
          onTabSelect={nb.setActiveTabId}
          onTabClose={nb.handleTabClose}
          onContentChange={nb.handleContentChange}
          onWordCountChange={handleWordCountChange}
        />
      </div>
      <StatusBar
        wordCount={wordCount}
        charCount={charCount}
        lastSaved={lastSaved}
        message={nb.statusMessage}
      />

      {/* Drag-and-drop overlay */}
      {dragOver && nb.notebooks.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-500/10 border-2 border-dashed border-blue-400 pointer-events-none">
          <div className="bg-white dark:bg-gray-900 px-6 py-4 rounded-lg shadow-lg text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Drop Markdown file to import</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">.md, .mdx, .markdown, .txt</p>
          </div>
        </div>
      )}

      {/* Input modal for notebook/file creation */}
      {nb.modalRequest && (
        <InputModal
          title={nb.modalRequest.title}
          label={nb.modalRequest.label}
          placeholder={nb.modalRequest.placeholder}
          onSubmit={nb.modalRequest.onSubmit}
          onCancel={() => nb.setModalRequest(null)}
        />
      )}

      {/* Save location picker for imported files */}
      {nb.saveLocationRequest && (
        <SaveLocationPicker
          fileName={nb.saveLocationRequest.fileName}
          notebooks={nb.notebooks}
          files={nb.files}
          onSave={nb.saveLocationRequest.onSave}
          onCancel={() => nb.setSaveLocationRequest(null)}
        />
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onUpdate={updateSettings}
          displayMode={mode}
          onDisplayModeChange={setMode}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Account modal */}
      {showAccount && auth.user && (
        <AccountModal
          user={auth.user}
          onUpdateProfile={auth.updateProfile}
          onChangePassword={auth.changePassword}
          onDeleteAccount={auth.deleteAccount}
          onSignOut={auth.signOut}
          onClose={() => setShowAccount(false)}
        />
      )}
    </div>
  );
}
