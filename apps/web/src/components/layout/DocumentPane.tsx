import { useTranslation } from 'react-i18next';
import { XIcon } from '../icons/Icons';
import { MarkdownEditor } from '../editor/MarkdownEditor';
import { EditorErrorBoundary } from '../editor/EditorErrorBoundary';

export interface Tab {
  id: string;
  name: string;
  hasUnsavedChanges: boolean;
  content: string;
}

interface DocumentPaneProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onContentChange: (id: string, html: string) => void;
  onWordCountChange?: (words: number, chars: number) => void;
  /** Whether the active notebook has unpublished changes on a working branch */
  showPublish?: boolean;
  onPublish?: () => void;
  onDiscard?: () => void;
  /** Editor settings */
  fontFamily?: string;
  fontSize?: number;
  spellCheck?: boolean;
  margins?: 'narrow' | 'regular' | 'wide';
  lineNumbers?: boolean;
}

export function DocumentPane({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onContentChange,
  onWordCountChange,
  showPublish,
  onPublish,
  onDiscard,
  fontFamily,
  fontSize,
  spellCheck,
  margins,
  lineNumbers,
}: DocumentPaneProps) {
  const { t } = useTranslation();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="document-pane flex-1 flex flex-col min-w-0">
      {/* Tab bar */}
      {tabs.length > 0 && (
        <div className="document-tabs h-9 flex items-end border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-1 gap-0.5 shrink-0">
          <div className="flex items-end overflow-x-auto scrollbar-hide gap-0.5 flex-1 min-w-0">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`group flex items-center gap-1.5 px-3 h-8 text-sm rounded-t-md cursor-pointer transition-colors select-none shrink-0 ${
                  activeTabId === tab.id
                    ? 'bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 border border-b-0 border-gray-200 dark:border-gray-800'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                onClick={() => onTabSelect(tab.id)}
              >
                <span className="truncate max-w-[140px]">{tab.name}</span>
                {tab.hasUnsavedChanges && (
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
          {showPublish && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onPublish}
                className="flex items-center gap-1.5 px-3 h-7 mb-0.5 text-xs font-semibold rounded-md bg-green-600 hover:bg-green-700 text-white shadow-sm transition-colors"
                title="Publish changes — merge working branch"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 19V5m0 0l-5 5m5-5l5 5" />
                </svg>
                Publish
              </button>
              <button
                onClick={onDiscard}
                className="flex items-center gap-1.5 px-2.5 h-7 mb-0.5 text-xs rounded-md border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                title="Discard changes — delete working branch"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                Discard
              </button>
            </div>
          )}
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-950">
        {activeTab ? (
          <EditorErrorBoundary key={activeTab.id}>
            <MarkdownEditor
              content={activeTab.content}
              onChange={(html) => onContentChange(activeTab.id, html)}
              onWordCountChange={onWordCountChange}
              fontFamily={fontFamily}
              fontSize={fontSize}
              spellCheck={spellCheck}
              margins={margins}
              lineNumbers={lineNumbers}
            />
          </EditorErrorBoundary>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-600">
            <p className="text-sm">Open a file from the notebook pane to start editing</p>
          </div>
        )}
      </div>
    </div>
  );
}
