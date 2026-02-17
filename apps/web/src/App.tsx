import { useState, useCallback } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { NotebookPane } from './components/layout/NotebookPane';
import { DocumentPane } from './components/layout/DocumentPane';
import type { Tab } from './components/layout/DocumentPane';
import { StatusBar } from './components/layout/StatusBar';
import { WelcomeScreen } from './components/welcome/WelcomeScreen';
import { useDisplayMode } from './hooks/useDisplayMode';
import { useSidebarResize } from './hooks/useSidebarResize';

export default function App() {
  const { mode, setMode } = useDisplayMode();
  const sidebar = useSidebarResize();

  // Temporary auth state — will be replaced with real auth in Phase 2
  const [isSignedIn, setIsSignedIn] = useState(false);

  // Tab state — will be driven by the editor in Phase 1.3+
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const handleTabClose = useCallback(
    (id: string) => {
      setTabs((prev) => prev.filter((t) => t.id !== id));
      if (activeTabId === id) {
        setActiveTabId((prev) => {
          const remaining = tabs.filter((t) => t.id !== id);
          return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        });
      }
    },
    [activeTabId, tabs],
  );

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
        />
        <DocumentPane
          tabs={tabs}
          activeTabId={activeTabId}
          onTabSelect={setActiveTabId}
          onTabClose={handleTabClose}
        />
      </div>
      <StatusBar wordCount={0} charCount={0} lastSaved={null} message={null} />
    </div>
  );
}
