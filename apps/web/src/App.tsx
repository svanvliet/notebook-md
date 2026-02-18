import { useState, useCallback } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { NotebookPane } from './components/layout/NotebookPane';
import { DocumentPane } from './components/layout/DocumentPane';
import type { Tab } from './components/layout/DocumentPane';
import { StatusBar } from './components/layout/StatusBar';
import { WelcomeScreen } from './components/welcome/WelcomeScreen';
import { InputModal } from './components/common/InputModal';
import { useDisplayMode } from './hooks/useDisplayMode';
import { useSidebarResize } from './hooks/useSidebarResize';
import { useNotebookManager } from './hooks/useNotebookManager';

export default function App() {
  const { mode, setMode } = useDisplayMode();
  const sidebar = useSidebarResize();
  const nb = useNotebookManager();

  // Temporary auth state — will be replaced with real auth in Phase 2
  const [isSignedIn, setIsSignedIn] = useState(false);

  // Status bar state
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

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

  // Welcome screen when not signed in
  if (!isSignedIn) {
    return (
      <div>
        <WelcomeScreen />
        {/* Dev shortcut to skip auth */}
        <button
          onClick={() => setIsSignedIn(true)}
          className="fixed bottom-4 right-4 px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-md hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          Skip to app (dev)
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <TitleBar displayMode={mode} onDisplayModeChange={setMode} />
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
    </div>
  );
}
