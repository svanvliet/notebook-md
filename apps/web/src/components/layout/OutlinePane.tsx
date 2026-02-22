import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ListBulletIcon,
} from '../icons/Icons';
import type { Editor } from '@tiptap/react';
import type { OutlineHeading } from '../../hooks/useDocumentOutline';

interface OutlinePaneProps {
  headings: OutlineHeading[];
  editor: Editor | null;
  width: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onResizeMouseDown: (e: React.MouseEvent) => void;
  hasActiveDocument: boolean;
}

const LEVEL_INDENT: Record<number, string> = {
  1: 'pl-2',
  2: 'pl-5',
  3: 'pl-8',
  4: 'pl-11',
  5: 'pl-14',
  6: 'pl-14',
};

export default function OutlinePane({
  headings,
  editor,
  width,
  collapsed,
  onToggleCollapse,
  onResizeMouseDown,
  hasActiveDocument,
}: OutlinePaneProps) {
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const headingElementsRef = useRef<Map<string, Element>>(new Map());

  const handleHeadingClick = useCallback(
    (heading: OutlineHeading) => {
      if (!editor) return;

      // Find the DOM element for this heading by position
      const domAtPos = editor.view.domAtPos(heading.pos + 1);
      const headingEl = domAtPos.node instanceof HTMLElement
        ? domAtPos.node.closest('h1, h2, h3, h4, h5, h6') || domAtPos.node
        : (domAtPos.node.parentElement?.closest('h1, h2, h3, h4, h5, h6') || domAtPos.node.parentElement);

      if (headingEl instanceof HTMLElement) {
        headingEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [editor],
  );

  // Active heading tracking via IntersectionObserver
  useEffect(() => {
    if (!editor || headings.length === 0) {
      setActiveHeadingId(null);
      return;
    }

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    headingElementsRef.current.clear();

    // Collect heading DOM elements
    const elements: { id: string; el: Element }[] = [];
    for (const heading of headings) {
      try {
        const domAtPos = editor.view.domAtPos(heading.pos + 1);
        const el = domAtPos.node instanceof HTMLElement
          ? domAtPos.node.closest('h1, h2, h3, h4, h5, h6') || domAtPos.node
          : (domAtPos.node.parentElement?.closest('h1, h2, h3, h4, h5, h6') || domAtPos.node.parentElement);
        if (el) {
          elements.push({ id: heading.id, el });
          headingElementsRef.current.set(heading.id, el);
        }
      } catch {
        // Position may be invalid during editing
      }
    }

    if (elements.length === 0) return;

    // Find the scrollable editor container
    const scrollContainer = editor.view.dom.closest('.overflow-auto') || editor.view.dom.parentElement;
    const visibleHeadings = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = [...headingElementsRef.current.entries()]
            .find(([, el]) => el === entry.target)?.[0];
          if (id) {
            if (entry.isIntersecting) {
              visibleHeadings.add(id);
            } else {
              visibleHeadings.delete(id);
            }
          }
        }
        // Pick the first visible heading in document order
        const firstVisible = headings.find((h) => visibleHeadings.has(h.id));
        if (firstVisible) {
          setActiveHeadingId(firstVisible.id);
        }
      },
      {
        root: scrollContainer,
        rootMargin: '0px 0px -80% 0px',
        threshold: 0,
      },
    );

    observerRef.current = observer;
    for (const { el } of elements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [editor, headings]);

  if (!hasActiveDocument) return null;

  return (
    <div
      data-print="hide"
      className="outline-pane relative shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex-col select-none hidden md:flex"
      style={{ width }}
    >
      {/* Header */}
      <div className="h-9 flex items-center justify-between px-2 border-b border-gray-200 dark:border-gray-800 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <ListBulletIcon className="w-3.5 h-3.5" />
            <span>Outline</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors ${collapsed ? 'mx-auto' : ''}`}
          title={collapsed ? 'Expand outline' : 'Collapse outline'}
          aria-label={collapsed ? 'Expand outline' : 'Collapse outline'}
        >
          {collapsed ? (
            <ChevronRightIcon className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeftIcon className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
          {headings.length === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-400 dark:text-gray-600 text-center">
              No headings found
            </div>
          ) : (
            <nav aria-label="Document outline">
              {headings.map((heading) => (
                <button
                  key={heading.id}
                  onClick={() => handleHeadingClick(heading)}
                  className={`w-full text-left pr-2 py-1 text-xs truncate hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors ${LEVEL_INDENT[heading.level] || 'pl-2'} ${
                    activeHeadingId === heading.id
                      ? 'text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-950/30 border-l-2 border-blue-500'
                      : 'text-gray-700 dark:text-gray-300 border-l-2 border-transparent'
                  }`}
                  title={heading.text}
                >
                  {heading.text || <span className="italic text-gray-400">Untitled</span>}
                </button>
              ))}
            </nav>
          )}
        </div>
      )}

      {/* Collapsed icon */}
      {collapsed && (
        <div className="flex-1 flex items-start justify-center pt-3">
          <ListBulletIcon className="w-4 h-4 text-gray-400 dark:text-gray-600" />
        </div>
      )}

      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors z-10"
        onMouseDown={onResizeMouseDown}
      />
    </div>
  );
}
