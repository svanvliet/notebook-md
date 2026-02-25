import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { XIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons/Icons';
import { MarkdownEditor } from '../editor/MarkdownEditor';
import { EditorErrorBoundary } from '../editor/EditorErrorBoundary';
import { CollaboratorAvatars } from '../editor/CollaboratorAvatars';
import { useCollaboration } from '../../hooks/useCollaboration';

const VersionHistoryPanel = lazy(() => import('../notebook/VersionHistoryPanel'));

export interface Tab {
  id: string;
  name: string;
  hasUnsavedChanges: boolean;
  content: string;
  loading?: boolean;
  readOnly?: boolean;
  /** Cloud document info — when set, enables collaboration features */
  cloudDoc?: {
    notebookId: string;
    path: string;
  };
}

interface DocumentPaneProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onContentChange: (id: string, html: string) => void;
  onWordCountChange?: (words: number, chars: number) => void;
  onEditorReady?: (editor: unknown) => void;
  /** Whether the active notebook has unpublished changes on a working branch */
  showPublish?: boolean;
  onPublish?: () => void;
  onDiscard?: () => void;
  /** Pending PR info for the active notebook */
  pendingPr?: { prNumber: number; prUrl: string } | null;
  /** Editor settings */
  fontFamily?: string;
  fontSize?: number;
  spellCheck?: boolean;
  margins?: 'narrow' | 'regular' | 'wide';
  lineNumbers?: boolean;
  /** Current user info for collaboration presence */
  currentUser?: { name: string; color?: string };
}

export function DocumentPane({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onContentChange,
  onWordCountChange,
  onEditorReady,
  showPublish,
  onPublish,
  onDiscard,
  pendingPr,
  fontFamily,
  fontSize,
  spellCheck,
  margins,
  lineNumbers,
  currentUser,
}: DocumentPaneProps) {
  const { t } = useTranslation();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Collaboration hook — only active for cloud docs
  const cloudDoc = activeTab?.cloudDoc ?? null;
  const collab = useCollaboration(
    cloudDoc?.notebookId ?? null,
    cloudDoc?.path ?? null,
    currentUser,
  );

  const updateScrollButtons = useCallback(() => {
    const el = tabsContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = tabsContainerRef.current;
    if (!el) return;
    updateScrollButtons();
    el.addEventListener('scroll', updateScrollButtons, { passive: true });
    const ro = new ResizeObserver(updateScrollButtons);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateScrollButtons); ro.disconnect(); };
  }, [tabs.length, updateScrollButtons]);

  // Auto-scroll active tab into view
  useEffect(() => {
    const el = tabsContainerRef.current;
    if (!el || !activeTabId) return;
    const activeEl = el.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement;
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  const scrollTabs = (direction: 'left' | 'right') => {
    const el = tabsContainerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -150 : 150, behavior: 'smooth' });
  };

  return (
    <div className="document-pane flex-1 flex flex-col min-w-0">
      {/* Tab bar */}
      {tabs.length > 0 && (
        <div className="document-tabs h-9 flex items-end border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-1 gap-0.5 shrink-0">
          {canScrollLeft && (
            <button onClick={() => scrollTabs('left')} className="self-center p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0" aria-label="Scroll tabs left">
              <ChevronLeftIcon className="w-3 h-3" />
            </button>
          )}
          <div ref={tabsContainerRef} className="flex items-end overflow-x-auto scrollbar-hide gap-0.5 flex-1 min-w-0">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                className={`group flex items-center gap-1.5 px-3 h-8 text-sm rounded-t-md cursor-pointer transition-colors select-none shrink-0 ${
                  activeTabId === tab.id
                    ? 'bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border border-b-0 border-gray-200 dark:border-gray-800'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                onClick={() => onTabSelect(tab.id)}
              >
                <span className="truncate max-w-[140px]">{tab.name}</span>
                {tab.readOnly && (
                  <svg className="w-3 h-3 shrink-0 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
                {tab.hasUnsavedChanges && !tab.readOnly && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" title={t('editor.unsavedChanges')} />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tab.id);
                  }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition-all"
                  aria-label={`Close ${tab.name}`}
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          {canScrollRight && (
            <button onClick={() => scrollTabs('right')} className="self-center p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0" aria-label="Scroll tabs right">
              <ChevronRightIcon className="w-3 h-3" />
            </button>
          )}
          {showPublish && (
            <div className="flex items-center gap-1 shrink-0">
              {pendingPr && (
                <a
                  href={pendingPr.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 h-7 mb-0.5 text-xs font-medium rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/60 transition-colors"
                  title={`PR #${pendingPr.prNumber} pending — click to view on GitHub`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z" />
                  </svg>
                  PR #{pendingPr.prNumber}
                </a>
              )}
              <button
                onClick={onPublish}
                disabled={!!pendingPr}
                className={`flex items-center gap-1.5 px-3 h-7 mb-0.5 text-xs font-semibold rounded-md shadow-sm transition-colors ${
                  pendingPr
                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
                title={pendingPr ? 'PR pending — waiting for merge' : 'Publish changes — merge working branch'}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 19V5m0 0l-5 5m5-5l5 5" />
                </svg>
                Publish
              </button>
              <button
                onClick={onDiscard}
                className="flex items-center gap-1.5 px-2.5 h-7 mb-0.5 text-xs rounded-md border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                title={pendingPr ? 'Discard changes and close PR' : 'Discard changes — delete working branch'}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                Discard
              </button>
            </div>
          )}
          {/* Cloud collaboration UI */}
          {cloudDoc && (
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {/* Connection status */}
              <span className={`w-2 h-2 rounded-full shrink-0 ${collab.isConnected ? 'bg-green-500' : collab.error ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`} title={collab.isConnected ? 'Connected' : collab.error ?? 'Reconnecting…'} />
              <CollaboratorAvatars users={collab.connectedUsers} />
              {/* Version history toggle */}
              <button
                onClick={() => setShowVersionHistory(v => !v)}
                className="flex items-center gap-1 px-2 h-7 mb-0.5 text-xs rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Version history"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-950">
        {activeTab ? (
          activeTab.loading ? (
            <div
              className="py-10 animate-pulse"
              style={{ paddingLeft: margins === 'narrow' ? '2rem' : margins === 'wide' ? '12rem' : '4rem',
                       paddingRight: margins === 'narrow' ? '2rem' : margins === 'wide' ? '12rem' : '4rem' }}
            >
              <div className="h-7 bg-gray-200 dark:bg-gray-800 rounded w-2/5 mb-6" />
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full" />
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-5/6" />
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-4/6" />
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full" />
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
              </div>
              <div className="mt-8 space-y-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full" />
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-5/6" />
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-2/3" />
              </div>
            </div>
          ) : collab.isAttempting && !collab.provider ? (
            /* Cloud doc — wait for collab provider to connect before mounting editor */
            <div
              className="py-10 animate-pulse"
              style={{ paddingLeft: margins === 'narrow' ? '2rem' : margins === 'wide' ? '12rem' : '4rem',
                       paddingRight: margins === 'narrow' ? '2rem' : margins === 'wide' ? '12rem' : '4rem' }}
            >
              <div className="h-7 bg-gray-200 dark:bg-gray-800 rounded w-2/5 mb-6" />
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full" />
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-5/6" />
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-4/6" />
              </div>
              {collab.error && (
                <p className="mt-4 text-sm text-red-500">{collab.error}</p>
              )}
            </div>
          ) : (
          <EditorErrorBoundary key={`${activeTab.id}-${collab.provider ? 'collab' : 'solo'}`}>
            <MarkdownEditor
              content={activeTab.content}
              onChange={(html) => onContentChange(activeTab.id, html)}
              onWordCountChange={onWordCountChange}
              onEditorReady={onEditorReady}
              fontFamily={fontFamily}
              fontSize={fontSize}
              spellCheck={spellCheck}
              margins={margins}
              lineNumbers={lineNumbers}
              readOnly={activeTab.readOnly}
              collaborative={collab.provider && currentUser ? { provider: collab.provider, user: { name: currentUser.name, color: currentUser.color ?? '#3B82F6' }, isSynced: collab.isSynced } : undefined}
            />
          </EditorErrorBoundary>
          )
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-600">
            <p className="text-sm">Open a file from the notebook pane to start editing</p>
          </div>
        )}
      </div>

      {/* Version History Panel */}
      {showVersionHistory && cloudDoc && (
        <Suspense fallback={null}>
          <VersionHistoryPanel
            notebookId={cloudDoc.notebookId}
            documentPath={cloudDoc.path}
            onClose={() => setShowVersionHistory(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
