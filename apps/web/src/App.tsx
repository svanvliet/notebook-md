import { useState, useCallback } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { NotebookPane } from './components/layout/NotebookPane';
import { DocumentPane } from './components/layout/DocumentPane';
import type { Tab } from './components/layout/DocumentPane';
import { StatusBar } from './components/layout/StatusBar';
import { WelcomeScreen } from './components/welcome/WelcomeScreen';
import { useDisplayMode } from './hooks/useDisplayMode';
import { useSidebarResize } from './hooks/useSidebarResize';

const DEMO_CONTENT = `<h1>Welcome to Notebook.md</h1>
<p>This is a <strong>live WYSIWYG Markdown editor</strong>. Try editing this content!</p>
<h2>Features</h2>
<ul>
  <li>Rich text editing with Markdown support</li>
  <li><strong>Bold</strong>, <em>italic</em>, <s>strikethrough</s>, <code>inline code</code></li>
  <li>Syntax-highlighted code blocks</li>
</ul>
<h3>Task List</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="true">Try the WYSIWYG editor</li>
  <li data-type="taskItem" data-checked="false">Use slash (/) commands to insert elements</li>
  <li data-type="taskItem" data-checked="false">Toggle raw HTML view with ⌘⇧M</li>
</ul>
<h3>Code Example</h3>
<pre><code class="language-typescript">function greet(name: string): string {
  return \`Hello, \${name}!\`;
}</code></pre>
<blockquote><p>Tip: Use the toolbar above or keyboard shortcuts to format text.</p></blockquote>`;

export default function App() {
  const { mode, setMode } = useDisplayMode();
  const sidebar = useSidebarResize();

  // Temporary auth state — will be replaced with real auth in Phase 2
  const [isSignedIn, setIsSignedIn] = useState(false);

  // Tab state
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'demo', name: 'Welcome.md', hasUnsavedChanges: false, content: DEMO_CONTENT },
  ]);
  const [activeTabId, setActiveTabId] = useState<string | null>('demo');

  // Status bar state
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

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

  const handleContentChange = useCallback((id: string, html: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, content: html, hasUnsavedChanges: true } : t)),
    );
  }, []);

  const handleWordCountChange = useCallback((words: number, chars: number) => {
    setWordCount(words);
    setCharCount(chars);
  }, []);

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
          onContentChange={handleContentChange}
          onWordCountChange={handleWordCountChange}
        />
      </div>
      <StatusBar wordCount={wordCount} charCount={charCount} lastSaved={null} message={null} />
    </div>
  );
}
