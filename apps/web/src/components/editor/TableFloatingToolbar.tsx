import { Editor } from '@tiptap/react';
import { useEffect, useRef, useState, useCallback } from 'react';

// --- Compact SVG icons (3.5 size for toolbar buttons) ---
const ic = 'w-3.5 h-3.5';

function ArrowUpIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5m-7 7 7-7 7 7"/></svg>;
}
function ArrowDownIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14m7-7-7 7-7-7"/></svg>;
}
function ArrowLeftIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5m7-7-7 7 7 7"/></svg>;
}
function ArrowRightIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>;
}
function TrashIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
}
function ToggleIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="3"/></svg>;
}
function MergeSplitIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>;
}
function DeleteTableIcon() {
  return <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="6" y1="6" x2="18" y2="18" strokeWidth="2.5" className="text-red-500" stroke="currentColor"/></svg>;
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />;
}

interface TBProps {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}

function TB({ onClick, title, danger, children }: TBProps) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded transition-colors ${
        danger
          ? 'text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
      title={title}
    >
      {children}
    </button>
  );
}

interface TableFloatingToolbarProps {
  editor: Editor;
}

export function TableFloatingToolbar({ editor }: TableFloatingToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!editor.isActive('table')) {
      setPos(null);
      return;
    }

    // Find the table DOM node from the current selection
    const { $anchor } = editor.state.selection;
    let depth = $anchor.depth;
    while (depth > 0) {
      const node = $anchor.node(depth);
      if (node.type.name === 'table') break;
      depth--;
    }
    if (depth === 0) {
      setPos(null);
      return;
    }

    const tablePos = $anchor.start(depth) - 1;
    const domNode = editor.view.nodeDOM(tablePos);
    if (!domNode || !(domNode instanceof HTMLElement)) {
      setPos(null);
      return;
    }

    // Find the actual <table> element (could be wrapped in a div)
    const tableEl = domNode.tagName === 'TABLE' ? domNode : domNode.querySelector('table');
    if (!tableEl) {
      setPos(null);
      return;
    }

    // Get position relative to the editor wrapper (scroll container)
    const editorWrapper = tableEl.closest('.editor-wrapper');
    if (!editorWrapper) {
      setPos(null);
      return;
    }

    const wrapperRect = editorWrapper.getBoundingClientRect();
    const tableRect = tableEl.getBoundingClientRect();

    setPos({
      top: tableRect.top - wrapperRect.top - 36, // 36px above the table
      left: tableRect.left - wrapperRect.left,
    });
  }, [editor]);

  // Update position on selection changes and transactions
  useEffect(() => {
    const handler = () => updatePosition();
    editor.on('selectionUpdate', handler);
    editor.on('transaction', handler);
    return () => {
      editor.off('selectionUpdate', handler);
      editor.off('transaction', handler);
    };
  }, [editor, updatePosition]);

  if (!pos || !editor.isActive('table')) return null;

  return (
    <div
      ref={toolbarRef}
      className="absolute z-40 flex items-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md px-1 py-0.5 gap-0"
      style={{ top: pos.top, left: pos.left }}
    >
      {/* Row operations */}
      <TB onClick={() => editor.chain().focus().addRowBefore().run()} title="Insert row above">
        <ArrowUpIcon />
      </TB>
      <TB onClick={() => editor.chain().focus().addRowAfter().run()} title="Insert row below">
        <ArrowDownIcon />
      </TB>
      <TB onClick={() => editor.chain().focus().deleteRow().run()} title="Delete row" danger>
        <span className="flex items-center gap-0.5"><ArrowUpIcon /><span className="text-[9px] font-bold">✕</span></span>
      </TB>

      <Divider />

      {/* Column operations */}
      <TB onClick={() => editor.chain().focus().addColumnBefore().run()} title="Insert column left">
        <ArrowLeftIcon />
      </TB>
      <TB onClick={() => editor.chain().focus().addColumnAfter().run()} title="Insert column right">
        <ArrowRightIcon />
      </TB>
      <TB onClick={() => editor.chain().focus().deleteColumn().run()} title="Delete column" danger>
        <span className="flex items-center gap-0.5"><ArrowLeftIcon /><span className="text-[9px] font-bold">✕</span></span>
      </TB>

      <Divider />

      {/* Table-level operations */}
      <TB onClick={() => editor.chain().focus().toggleHeaderRow().run()} title="Toggle header row">
        <ToggleIcon />
      </TB>
      <TB onClick={() => editor.chain().focus().mergeOrSplit().run()} title="Merge/split cells">
        <MergeSplitIcon />
      </TB>

      <Divider />

      <TB onClick={() => editor.chain().focus().deleteTable().run()} title="Delete table" danger>
        <DeleteTableIcon />
      </TB>
    </div>
  );
}
