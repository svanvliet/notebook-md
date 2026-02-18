import { useTranslation } from 'react-i18next';
import { XIcon } from '../icons/Icons';
import { MarkdownEditor } from '../editor/MarkdownEditor';

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
}

export function DocumentPane({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onContentChange,
  onWordCountChange,
}: DocumentPaneProps) {
  const { t } = useTranslation();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Tab bar */}
      {tabs.length > 0 && (
        <div className="h-9 flex items-end border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 overflow-x-auto px-1 gap-0.5 shrink-0">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`group flex items-center gap-1.5 px-3 h-8 text-sm rounded-t-md cursor-pointer transition-colors select-none ${
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
      )}

      {/* Editor area */}
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-950">
        {activeTab ? (
          <MarkdownEditor
            key={activeTab.id}
            content={activeTab.content}
            onChange={(html) => onContentChange(activeTab.id, html)}
            onWordCountChange={onWordCountChange}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-600">
            <p className="text-sm">Open a file from the notebook pane to start editing</p>
          </div>
        )}
      </div>
    </div>
  );
}
