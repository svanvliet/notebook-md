import { useState, useEffect, useCallback, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { slashCommands, slashCommandPluginKey } from './SlashCommands';
import type { SlashCommand } from './SlashCommands';

interface SlashCommandMenuProps {
  editor: Editor | null;
}

export function SlashCommandMenu({ editor }: SlashCommandMenuProps) {
  const [active, setActive] = useState(false);
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = slashCommands.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase()),
  );

  // Listen for slash command state changes from the ProseMirror plugin
  useEffect(() => {
    if (!editor) return;

    const update = () => {
      const state = slashCommandPluginKey.getState(editor.state);
      if (!state) return;

      setActive(state.active);
      setQuery(state.query);
      setRange(state.range);

      if (state.active) {
        // Position the menu near the cursor
        const { view } = editor;
        const coords = view.coordsAtPos(view.state.selection.from);
        const editorRect = view.dom.closest('.editor-wrapper')?.getBoundingClientRect();
        if (editorRect) {
          setPosition({
            top: coords.bottom - editorRect.top + 4,
            left: coords.left - editorRect.left,
          });
        }
        setSelectedIndex(0);
      }
    };

    editor.on('transaction', update);
    return () => {
      editor.off('transaction', update);
    };
  }, [editor]);

  const executeCommand = useCallback(
    (cmd: SlashCommand) => {
      if (!editor || !range) return;
      // Delete the slash + query text first
      editor.chain().focus().deleteRange(range).run();
      // Then execute the command
      cmd.action(editor);
    },
    [editor, range],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!active || !editor) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          executeCommand(filtered[selectedIndex]);
        }
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [active, editor, filtered, selectedIndex, executeCommand]);

  // Scroll selected item into view
  useEffect(() => {
    if (!menuRef.current) return;
    const selected = menuRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!active || filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="absolute z-50 w-64 max-h-72 overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1"
      style={{ top: position.top, left: position.left }}
    >
      {filtered.map((cmd, index) => (
        <button
          key={cmd.title}
          data-selected={index === selectedIndex}
          onClick={() => executeCommand(cmd)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
            index === selectedIndex
              ? 'bg-blue-50 dark:bg-blue-900/30'
              : 'hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <span className="w-7 h-7 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400 shrink-0">
            {cmd.icon}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{cmd.title}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {cmd.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
