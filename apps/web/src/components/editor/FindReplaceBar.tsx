import { useEffect, useRef, useCallback, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { SearchReplaceStorage } from './SearchReplace';
import { getSearchStorage } from './SearchReplace';

interface FindReplaceBarProps {
  editor: Editor;
  onClose: () => void;
}

export function FindReplaceBar({ editor, onClose }: FindReplaceBarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [showReplace, setShowReplace] = useState(false);

  const storage: SearchReplaceStorage = getSearchStorage(editor);
  const resultCount = storage.results?.length ?? 0;
  const currentIndex = storage.currentIndex ?? -1;

  // Focus search input on mount and on external focus requests
  useEffect(() => {
    searchRef.current?.focus();
    // Pre-fill with selected text
    const { from, to } = editor.state.selection;
    if (from !== to) {
      const text = editor.state.doc.textBetween(from, to);
      if (text && text.length < 200 && !text.includes('\n')) {
        setSearchTerm(text);
        editor.commands.setSearchTerm(text);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = () => searchRef.current?.focus();
    window.addEventListener('search-replace-focus', handler);
    return () => window.removeEventListener('search-replace-focus', handler);
  }, []);

  const handleSearch = useCallback(
    (term: string) => {
      setSearchTerm(term);
      editor.commands.setSearchTerm(term);
    },
    [editor],
  );

  const handleClose = useCallback(() => {
    editor.commands.closeSearch();
    onClose();
  }, [editor, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        editor.commands.focus();
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        editor.commands.findNext();
      }
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        editor.commands.findPrev();
      }
    },
    [editor, handleClose],
  );

  const caseSensitive = storage.caseSensitive ?? false;
  const wholeWord = storage.wholeWord ?? false;

  const toggleBtnClass = (active: boolean) =>
    `w-7 h-6 flex items-center justify-center rounded text-xs font-medium border transition-colors ${
      active
        ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 shadow-sm">
      {/* Search row */}
      <div className="flex items-center gap-1.5">
        {/* Expand/collapse replace */}
        <button
          onClick={() => setShowReplace(!showReplace)}
          className="w-5 h-5 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
          title={showReplace ? 'Hide replace' : 'Show replace'}
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {showReplace ? (
              <polyline points="3,4 6,8 9,4" />
            ) : (
              <polyline points="4,3 8,6 4,9" />
            )}
          </svg>
        </button>

        {/* Search input */}
        <div className="flex items-center gap-0 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 focus-within:ring-1 focus-within:ring-blue-500 flex-1 max-w-xs">
          <input
            ref={searchRef}
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find"
            className="h-6 px-2 text-sm bg-transparent text-gray-800 dark:text-gray-200 focus:outline-none flex-1 min-w-0"
          />
          {/* Toggle buttons inside search box */}
          <button
            onClick={() => editor.commands.toggleCaseSensitive()}
            className={toggleBtnClass(caseSensitive)}
            title="Match case"
          >
            Aa
          </button>
          <button
            onClick={() => editor.commands.toggleWholeWord()}
            className={`${toggleBtnClass(wholeWord)} mr-0.5`}
            title="Whole word"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="3" width="5" height="10" rx="1" />
              <rect x="10" y="3" width="5" height="10" rx="1" />
            </svg>
          </button>
        </div>

        {/* Result count */}
        <span className="text-xs text-gray-400 dark:text-gray-500 min-w-[60px] text-center shrink-0 tabular-nums">
          {searchTerm
            ? resultCount > 0
              ? `${currentIndex + 1} of ${resultCount}`
              : 'No results'
            : ''}
        </span>

        {/* Navigation */}
        <button
          onClick={() => editor.commands.findPrev()}
          disabled={resultCount === 0}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
          title="Previous match (Shift+Enter)"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="2,8 6,4 10,8" />
          </svg>
        </button>
        <button
          onClick={() => editor.commands.findNext()}
          disabled={resultCount === 0}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
          title="Next match (Enter)"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="2,4 6,8 10,4" />
          </svg>
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          title="Close (Esc)"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="3" x2="11" y2="11" />
            <line x1="11" y1="3" x2="3" y2="11" />
          </svg>
        </button>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div className="flex items-center gap-1.5 pl-[26px]">
          <input
            ref={replaceRef}
            type="text"
            value={replaceTerm}
            onChange={(e) => {
              setReplaceTerm(e.target.value);
              editor.commands.setReplaceTerm(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                handleClose();
                editor.commands.focus();
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                editor.commands.replaceCurrent();
              }
            }}
            placeholder="Replace"
            className="h-6 px-2 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1 max-w-xs"
          />
          <button
            onClick={() => editor.commands.replaceCurrent()}
            disabled={resultCount === 0}
            className="h-6 px-2 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
            title="Replace current match"
          >
            Replace
          </button>
          <button
            onClick={() => editor.commands.replaceAll()}
            disabled={resultCount === 0}
            className="h-6 px-2 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
            title="Replace all matches"
          >
            All
          </button>
        </div>
      )}
    </div>
  );
}
