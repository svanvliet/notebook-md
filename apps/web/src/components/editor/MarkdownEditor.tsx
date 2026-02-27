import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { getEditorExtensions } from './extensions';
import { DragHandle } from './DragHandle';
import { EditorToolbar } from './EditorToolbar';
import { SlashCommandMenu } from './SlashCommandMenu';
import { SlashCommandExtension } from './SlashCommands';
import { EditorContextMenu } from './EditorContextMenu';
import { TableFloatingToolbar } from './TableFloatingToolbar';
import { htmlToMarkdown, markdownToHtml } from './markdownConverter';
import { useToast } from '../../hooks/useToast';
import { AiPromptModal } from './AiPromptModal';
import { MobileCommandFab } from './MobileCommandFab';
import type { AiLength } from './AiPromptModal';
import './editor.css';

// Allow table-related attributes and elements that Tiptap generates
function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['colgroup', 'col', 'input', 'video'],
    ADD_ATTR: ['colspan', 'rowspan', 'style', 'data-type', 'data-checked',
               'data-callout', 'data-callout-type', 'contenteditable',
               'disabled', 'type', 'checked', 'controls', 'autoplay',
               'loop', 'muted', 'poster'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  }) as string;
}

interface MarkdownEditorProps {
  content: string;
  onChange: (html: string) => void;
  onWordCountChange?: (words: number, chars: number) => void;
  onEditorReady?: (editor: Editor | null) => void;
  fontFamily?: string;
  fontSize?: number;
  spellCheck?: boolean;
  margins?: 'narrow' | 'regular' | 'wide';
  lineNumbers?: boolean;
  readOnly?: boolean;
  /** Collaboration options — when set, enables real-time collaborative editing */
  collaborative?: {
    provider: import('@hocuspocus/provider').HocuspocusProvider;
    user: { name: string; color: string };
    isSynced?: boolean;
  };
}

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.svg,.gif,.webp';
const VIDEO_ACCEPT = '.mp4,.webm';
const VIDEO_EXTS = new Set(['mp4', 'webm']);

function MediaInsertModal({ mediaType, onClose, onInsertUrl, onUploadFile }: {
  mediaType: 'image' | 'video';
  onClose: () => void;
  onInsertUrl: (url: string, alt: string) => void;
  onUploadFile: (file: File) => void;
}) {
  const { addToast } = useToast();
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const accept = mediaType === 'video' ? VIDEO_ACCEPT : IMAGE_ACCEPT;
  const label = mediaType === 'video' ? 'Video' : 'Image';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-5 w-80" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Insert {label}</h3>
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label} URL</label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..."
              className="w-full h-8 px-2.5 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && url) { onInsertUrl(url, alt); onClose(); } if (e.key === 'Escape') onClose(); }} />
          </div>
          {mediaType === 'image' && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Alt text (optional)</label>
              <input type="text" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Description"
                className="w-full h-8 px-2.5 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                onKeyDown={(e) => { if (e.key === 'Enter' && url) { onInsertUrl(url, alt); onClose(); } if (e.key === 'Escape') onClose(); }} />
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = accept;
                input.onchange = () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  if (file.size > MAX_UPLOAD_SIZE) {
                    addToast(`File too large. Maximum size is 10 MB (selected: ${(file.size / 1024 / 1024).toFixed(1)} MB).`, 'warning');
                    return;
                  }
                  onUploadFile(file);
                  onClose();
                };
                input.click();
              }}
              className="h-8 px-3 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload file
            </button>
            <div className="flex-1" />
            <button onClick={onClose} className="h-8 px-3 text-xs rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">Cancel</button>
            <button onClick={() => { if (url) { onInsertUrl(url, alt); onClose(); } }} disabled={!url}
              className="h-8 px-3 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">Insert</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarkdownEditor({ content, onChange, onWordCountChange, onEditorReady, fontFamily, fontSize, spellCheck: spellCheckProp, margins, lineNumbers, readOnly, collaborative }: MarkdownEditorProps) {
  const { addToast } = useToast();
  // 'wysiwyg' = design only, 'source' = raw only, 'split' = side-by-side
  type ViewMode = 'wysiwyg' | 'source' | 'split';
  const [viewMode, setViewMode] = useState<ViewMode>('wysiwyg');
  // Force WYSIWYG during collaborative editing
  const effectiveViewMode = collaborative ? 'wysiwyg' : viewMode;
  const [rawContent, setRawContent] = useState('');
  const [wordWrap, setWordWrap] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [mediaModal, setMediaModal] = useState<{ type: 'image' | 'video' } | null>(null);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiQuotaRemaining, setAiQuotaRemaining] = useState<number | null>(null);
  const [aiQuotaLimit, setAiQuotaLimit] = useState<number | null>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const lineNumRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [lineHeights, setLineHeights] = useState<number[]>([]);
  const wysiwygScrollRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);
  const syncingFromSource = useRef(false);
  const scrollSource = useRef<'source' | 'wysiwyg' | null>(null);
  const isInitialMount = useRef(true);

  const marginPx = margins === 'narrow' ? '2rem' : margins === 'wide' ? '12rem' : '4rem';

  // Memoize extensions to prevent TipTap from re-registering them on every render.
  // CollaborationCursor re-init triggers awareness updates → re-render → infinite loop.
  const extensions = useMemo(
    () => [...getEditorExtensions(undefined, collaborative ? { provider: collaborative.provider, user: collaborative.user } : undefined), SlashCommandExtension, DragHandle],
    [collaborative?.provider],
  );

  // Memoize editorProps — TipTap's compareOptions checks all keys by reference.
  // A new editorProps object on each render triggers setOptions → view.updateState →
  // CollaborationCursor awareness update → setConnectedUsers → re-render → infinite loop.
  const editorProps = useMemo(() => ({
    attributes: {
      class: 'prose dark:prose-invert max-w-none focus:outline-none min-h-[200px] py-6',
      spellcheck: spellCheckProp === false ? 'false' : 'true',
    },
  }), [spellCheckProp]);

  const editor = useEditor({
    extensions,
    content: collaborative ? undefined : sanitize(content),
    editable: !readOnly,
    immediatelyRender: false,
    editorProps,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Skip the initial onUpdate fired when Tiptap parses the content on mount
      if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
      }

      // In collaborative mode, Yjs handles persistence — don't feed back to parent content state
      if (!collaborative) {
        onChange(html);
      }

      // Keep raw content in sync during split view, but skip if update came from source pane
      if (viewMode === 'split' && !syncingFromSource.current) {
        setRawContent(htmlToMarkdown(html));
      }

      // Word/char counts
      const text = editor.state.doc.textContent;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      onWordCountChange?.(words, chars);
    },
  });

  // Expose editor instance to parent
  useEffect(() => {
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync editable state when readOnly prop changes
  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Sync content from outside (e.g., when switching tabs)
  // Skip in collaborative mode — Yjs document is the source of truth
  useEffect(() => {
    if (collaborative) return;
    if (editor && editor.view?.dom && content !== editor.getHTML()) {
      editor.commands.setContent(sanitize(content));
    }
    // Only trigger when content prop changes, not when editor types
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, collaborative]);

  // Seed collaborative doc from REST content when Yjs doc is empty after sync.
  // This handles files created via REST API that have no ydoc_state yet.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!collaborative?.isSynced || !editor || !content || seededRef.current) return;
    // Check if the Yjs doc is empty (only has a single empty paragraph)
    if (editor.isEmpty) {
      // Content from REST API may be raw markdown (imported files) or HTML (editor-saved).
      // Detect markdown by checking for common syntax and convert if needed.
      const isMarkdown = /^#{1,6}\s|^\*\*|^!\[|^\[.*\]\(|^---\s*$/m.test(content);
      const html = isMarkdown ? markdownToHtml(content) : content;
      editor.commands.setContent(sanitize(html));
      seededRef.current = true;
    }
  }, [collaborative?.isSynced, editor, content]);

  // Reset seeded flag when switching documents
  useEffect(() => {
    seededRef.current = false;
  }, [collaborative?.provider]);

  // Sync spellcheck attribute when setting changes
  useEffect(() => {
    if (!editor || !editor.view?.dom) return;
    const el = editor.view.dom;
    el.setAttribute('spellcheck', spellCheckProp === false ? 'false' : 'true');
  }, [editor, spellCheckProp]);

  // Measure line heights via hidden mirror div (matches textarea wrapping)
  const measureLineHeights = useCallback(() => {
    if (!sourceRef.current || !mirrorRef.current || !lineNumbers) return;
    const source = sourceRef.current;
    const mirror = mirrorRef.current;
    const lines = rawContent.split('\n');
    const cs = getComputedStyle(source);
    const contentWidth = source.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    mirror.style.width = `${contentWidth}px`;
    mirror.style.font = cs.font;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.lineHeight = cs.lineHeight;
    mirror.style.whiteSpace = wordWrap ? 'pre-wrap' : 'pre';
    mirror.style.overflowWrap = wordWrap ? 'break-word' : 'normal';
    mirror.style.wordBreak = wordWrap ? 'break-word' : 'normal';
    // Batch: render all lines as separate divs, then read heights in one pass
    mirror.innerHTML = lines.map(l => {
      const escaped = l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<div>${escaped || '&nbsp;'}</div>`;
    }).join('');
    const heights = Array.from(mirror.children).map(el => (el as HTMLElement).offsetHeight);
    setLineHeights(heights);
  }, [rawContent, lineNumbers, wordWrap]);

  useEffect(() => {
    measureLineHeights();
    if (!sourceRef.current) return;
    const ro = new ResizeObserver(() => measureLineHeights());
    ro.observe(sourceRef.current);
    return () => ro.disconnect();
  }, [measureLineHeights]);

  // Sync scroll between line number gutter and source textarea
  const syncLineNumScroll = () => {
    if (lineNumRef.current && sourceRef.current) {
      lineNumRef.current.scrollTop = sourceRef.current.scrollTop;
    }
  };

  // Keyboard shortcut: Cmd/Ctrl+Shift+M for raw toggle, Cmd/Ctrl+Shift+S for split
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'm') {
        e.preventDefault();
        cycleViewMode();
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'p') {
        e.preventDefault();
        window.print();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  const cycleViewMode = useCallback(() => {
    if (!editor) return;

    setViewMode((prev) => {
      if (prev === 'wysiwyg') {
        // → source: convert HTML to Markdown
        setRawContent(htmlToMarkdown(editor.getHTML()));
        return 'source';
      } else if (prev === 'source') {
        // → split: apply any source edits to editor first
        const html = sanitize(markdownToHtml(rawContent));
        editor.commands.setContent(html);
        onChange(editor.getHTML());
        setRawContent(htmlToMarkdown(editor.getHTML()));
        return 'split';
      } else {
        // split → wysiwyg
        return 'wysiwyg';
      }
    });
  }, [editor, rawContent, onChange]);

  // Handle source edits in split view — debounced sync to WYSIWYG
  const sourceChangeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSourceChange = useCallback(
    (value: string) => {
      setRawContent(value);
      if (viewMode === 'split' && editor) {
        clearTimeout(sourceChangeTimer.current);
        sourceChangeTimer.current = setTimeout(() => {
          const html = sanitize(markdownToHtml(value));
          const currentHtml = editor.getHTML();
          if (html !== currentHtml) {
            syncingFromSource.current = true;
            editor.commands.setContent(html);
            onChange(editor.getHTML());
            syncingFromSource.current = false;
          }
        }, 500);
      }
    },
    [viewMode, editor, onChange],
  );

  // Synchronized scrolling between panes — only sync FROM the pane the user is interacting with
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSourceScroll = useCallback(() => {
    if (scrollSource.current === 'wysiwyg') return;
    if (!sourceRef.current || !wysiwygScrollRef.current) return;
    scrollSource.current = 'source';
    const src = sourceRef.current;
    const pct = src.scrollTop / (src.scrollHeight - src.clientHeight || 1);
    const target = wysiwygScrollRef.current;
    target.scrollTop = pct * (target.scrollHeight - target.clientHeight);
    clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => { scrollSource.current = null; }, 150);
  }, []);

  const handleWysiwygScroll = useCallback(() => {
    if (scrollSource.current === 'source') return;
    if (!sourceRef.current || !wysiwygScrollRef.current) return;
    scrollSource.current = 'wysiwyg';
    const target = wysiwygScrollRef.current;
    const pct = target.scrollTop / (target.scrollHeight - target.clientHeight || 1);
    const src = sourceRef.current;
    src.scrollTop = pct * (src.scrollHeight - src.clientHeight);
    clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => { scrollSource.current = null; }, 150);
  }, []);

  // Update word count on initial load
  useEffect(() => {
    if (editor) {
      const text = editor.state.doc.textContent;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      onWordCountChange?.(words, text.length);
    }
  }, [editor, onWordCountChange]);

  // Right-click context menu handler
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!editor || !editor.view) return;
      const target = e.target as HTMLElement;
      const isLink = !!target.closest('a');
      const isTable = !!target.closest('table');
      if (isLink || isTable) {
        e.preventDefault();
        // Position cursor at the right-click location so editor knows context
        const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
        if (pos) {
          editor.chain().focus().setTextSelection(pos.pos).run();
        }
        setContextMenu({ x: e.clientX, y: e.clientY });
      }
    },
    [editor],
  );

  // Close context menu on outside click or scroll
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  // Listen for media insert events from slash commands
  useEffect(() => {
    const handler = (e: Event) => {
      const { type } = (e as CustomEvent).detail;
      setMediaModal({ type });
    };
    window.addEventListener('notebook-media-insert', handler);
    return () => window.removeEventListener('notebook-media-insert', handler);
  }, []);

  // Listen for AI prompt open events from slash command / toolbar
  useEffect(() => {
    const handler = () => {
      setShowAiPrompt(true);
    };
    window.addEventListener('ai:open-prompt', handler);
    return () => window.removeEventListener('ai:open-prompt', handler);
  }, []);

  const handleAiSubmit = useCallback(
    (prompt: string, length: AiLength, webSearch: boolean) => {
      if (!editor) return;
      setShowAiPrompt(false);
      // Insert AI widget at current cursor position
      const userId = ''; // Will be populated from collaborative context if available
      editor.commands.insertAiWidget({ prompt, length, ownerId: userId, webSearch });
    },
    [editor],
  );

  // Handle image files dropped into the editor
  const handleEditorDrop = useCallback(
    (e: React.DragEvent) => {
      if (!editor) return;

      // Check for files (images/videos from desktop)
      const files = Array.from(e.dataTransfer.files);
      const mediaFiles = files.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
      if (mediaFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        editorWrapperRef.current?.classList.remove('drag-over');

        mediaFiles.forEach((file) => {
          if (file.size > 10 * 1024 * 1024) {
            addToast(`File "${file.name}" is too large. Maximum size is 10 MB.`, 'warning');
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            if (file.type.startsWith('video/')) {
              editor.chain().focus().insertContent(
                `<video src="${base64}" controls style="max-width:100%"></video>`,
              ).run();
            } else {
              editor.chain().focus().setImage({ src: base64, alt: file.name }).run();
            }
          };
          reader.readAsDataURL(file);
        });
        return;
      }

      // Check for notebook file link (dragged from tree)
      const filePath = e.dataTransfer.getData('text/notebook-file');
      if (filePath) {
        e.preventDefault();
        e.stopPropagation();
        editorWrapperRef.current?.classList.remove('drag-over');

        const fileName = filePath.split('/').pop() || filePath;
        const isImage = /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(fileName);
        const isVideo = /\.(mp4|webm)$/i.test(fileName);
        if (isImage) {
          editor.chain().focus().setImage({ src: filePath, alt: fileName }).run();
        } else if (isVideo) {
          editor.chain().focus().insertContent(
            `<video src="${filePath}" controls style="max-width:100%"></video>`,
          ).run();
        } else {
          editor.chain().focus().insertContent(`[${fileName}](${filePath})`).run();
        }
        return;
      }
    },
    [editor],
  );

  const handleEditorDragOver = useCallback((e: React.DragEvent) => {
    const hasFiles = e.dataTransfer.types.includes('Files');
    const hasFileLink = e.dataTransfer.types.includes('text/notebook-file');
    if (hasFiles || hasFileLink) {
      e.preventDefault();
      editorWrapperRef.current?.classList.add('drag-over');
    }
  }, []);

  const handleEditorDragLeave = useCallback((e: React.DragEvent) => {
    // Only remove if leaving the wrapper entirely
    const related = e.relatedTarget as HTMLElement;
    if (!editorWrapperRef.current?.contains(related)) {
      editorWrapperRef.current?.classList.remove('drag-over');
    }
  }, []);

  // Intercept clicks on .md links to open them in-app
  const editorContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;

    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;
      const href = target.getAttribute('href');
      if (!href) return;

      // App URLs (e.g. /app/Notebook/file.md, /demo/Notebook/file.md)
      if (/^\/(app|demo)\//.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(
          new CustomEvent('app-link-click', { detail: { href } }),
        );
        return;
      }

      // Relative .md links (e.g. file.md, ../folder/file.md)
      const isRelative = !href.match(/^[a-z]+:/i) && !href.startsWith('#') && !href.startsWith('/');
      if (isRelative && href.endsWith('.md')) {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(
          new CustomEvent('notebook-link-click', { detail: { href } }),
        );
      }
    };

    container.addEventListener('click', handler, true); // capture phase
    return () => container.removeEventListener('click', handler, true);
  }, []);

  const editorStyle = {
    '--editor-font-family': fontFamily || 'inherit',
    '--editor-font-size': fontSize ? `${fontSize}px` : '16px',
    '--editor-margin': marginPx,
  } as React.CSSProperties;

  return (
    <div className="flex flex-col h-full" style={editorStyle}>
      {/* Toolbar */}
      <div data-print="hide" className="border-b border-gray-200 dark:border-gray-800 px-3 py-1.5 flex items-center justify-between bg-white dark:bg-gray-950 shrink-0">
        <EditorToolbar editor={editor} />
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {/* Source toggle */}
          <button
            onClick={() => {
              if (!editor || collaborative) return;
              if (viewMode === 'wysiwyg') {
                setRawContent(htmlToMarkdown(editor.getHTML()));
                setViewMode('source');
              } else if (viewMode === 'source') {
                const html = sanitize(markdownToHtml(rawContent));
                editor.commands.setContent(html);
                onChange(editor.getHTML());
                setViewMode('wysiwyg');
              } else {
                // split → wysiwyg
                setViewMode('wysiwyg');
              }
            }}
            disabled={!!collaborative}
            className={`px-1.5 py-1 rounded transition-colors ${
              collaborative
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : viewMode === 'source'
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            title={collaborative ? 'Source view is disabled during real-time collaboration' : 'Toggle source view (⌘⇧M)'}
          >
            <svg className="w-5 h-3.5" viewBox="0 0 208 128" fill="currentColor">
              <rect x="5" y="5" width="198" height="118" rx="15" fill="none" stroke="currentColor" strokeWidth="10"/>
              <path d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39zm125 0-30-33h20V30h20v35h20z"/>
            </svg>
          </button>
          {/* Split view toggle — hidden on mobile (unusable on narrow screens) */}
          <button
            onClick={() => {
              if (!editor || collaborative) return;
              if (viewMode !== 'split') {
                setRawContent(htmlToMarkdown(editor.getHTML()));
                setViewMode('split');
              } else {
                setViewMode('wysiwyg');
              }
            }}
            disabled={!!collaborative}
            className={`hidden md:inline-flex px-1.5 py-1 rounded transition-colors ${
              collaborative
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : viewMode === 'split'
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            title={collaborative ? 'Split view is disabled during real-time collaboration' : 'Toggle split view'}
          >
            <svg className="w-4 h-3.5" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="0.75" y="0.75" width="14.5" height="12.5" rx="2" />
              <line x1="8" y1="1" x2="8" y2="13" />
            </svg>
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Source pane — shown in source-only or split mode */}
        {(effectiveViewMode === 'source' || effectiveViewMode === 'split') && (
          <div
            className={`source-pane relative border-r border-gray-200 dark:border-gray-800 ${effectiveViewMode === 'split' ? 'w-1/2' : 'w-full h-full'}`}
            onMouseEnter={() => { scrollSource.current = null; }}
          >
            {lineNumbers && (
              <>
                {/* Hidden mirror for measuring wrapped line heights */}
                <div
                  ref={mirrorRef}
                  aria-hidden="true"
                  style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', top: 0, left: 0 }}
                />
                {/* Line number gutter */}
                <div
                  ref={lineNumRef}
                  className="absolute top-0 left-0 bottom-0 z-10 overflow-hidden bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800"
                  style={{ width: `${Math.max(3, String(rawContent.split('\n').length).length) * 0.65 + 1.2}rem` }}
                  aria-hidden="true"
                >
                  <div style={{ paddingTop: '1.5rem', paddingBottom: '1.5rem' }}>
                    {lineHeights.map((h, i) => (
                      <div
                        key={i}
                        className="text-right pr-3 pl-2 text-gray-400 dark:text-gray-600 font-mono text-sm select-none"
                        style={{ height: `${h}px` }}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            <textarea
              ref={sourceRef}
              value={rawContent}
              onChange={(e) => handleSourceChange(e.target.value)}
              onScroll={(e) => {
                syncLineNumScroll();
                if (effectiveViewMode === 'split') handleSourceScroll(e);
              }}
              className={`resize-none font-mono text-sm py-6 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 focus:outline-none w-full h-full ${
                wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'
              } ${lineNumbers ? 'pr-6' : 'px-6'}`}
              style={lineNumbers ? { paddingLeft: `${Math.max(3, String(rawContent.split('\n').length).length) * 0.65 + 1.6}rem` } : undefined}
              wrap={wordWrap ? 'soft' : 'off'}
              spellCheck={spellCheckProp !== false}
            />
            {/* Word wrap toggle */}
            <button
              onClick={() => setWordWrap((w) => !w)}
              className={`absolute top-1.5 right-2 z-20 p-1 rounded text-xs transition-colors ${
                wordWrap
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : 'text-gray-400 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title={wordWrap ? 'Word wrap: on' : 'Word wrap: off'}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M3 12h15a3 3 0 1 1 0 6h-4" />
                <polyline points="13 16 11 18 13 20" />
                <path d="M3 18h4" />
              </svg>
            </button>
          </div>
        )}
        {/* WYSIWYG pane — shown in wysiwyg-only or split mode */}
        {(effectiveViewMode === 'wysiwyg' || effectiveViewMode === 'split') && (
          <div
            ref={(el) => {
              (editorWrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              (wysiwygScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              (editorContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
            }}
            className={`relative editor-wrapper overflow-auto ${
              effectiveViewMode === 'split' ? 'w-1/2' : 'w-full'
            }`}
            onMouseEnter={() => { scrollSource.current = null; }}
            onContextMenu={handleContextMenu}
            onScroll={effectiveViewMode === 'split' ? handleWysiwygScroll : undefined}
            onDrop={handleEditorDrop}
            onDragOver={handleEditorDragOver}
            onDragLeave={handleEditorDragLeave}
          >
            <EditorContent editor={editor} />
            {editor && <SlashCommandMenu editor={editor} />}
            {editor && <TableFloatingToolbar editor={editor} />}
            {contextMenu && editor && (
              <EditorContextMenu
                editor={editor}
                x={contextMenu.x}
                y={contextMenu.y}
                onClose={() => setContextMenu(null)}
              />
            )}
          </div>
        )}
      </div>

      {/* Media insert modal (from slash commands) */}
      {mediaModal && editor && (
        <MediaInsertModal
          mediaType={mediaModal.type}
          onClose={() => setMediaModal(null)}
          onInsertUrl={(url, alt) => {
            const ext = url.split('.').pop()?.toLowerCase().split('?')[0] ?? '';
            if (VIDEO_EXTS.has(ext) || mediaModal.type === 'video') {
              editor.chain().focus().insertContent(
                `<video src="${url}" controls style="max-width:100%"></video>`,
              ).run();
            } else {
              editor.chain().focus().setImage({ src: url, alt: alt || undefined }).run();
            }
          }}
          onUploadFile={(file) => {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result as string;
              const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
              if (VIDEO_EXTS.has(ext)) {
                editor.chain().focus().insertContent(
                  `<video src="${base64}" controls style="max-width:100%"></video>`,
                ).run();
              } else {
                editor.chain().focus().setImage({ src: base64, alt: file.name }).run();
              }
            };
            reader.readAsDataURL(file);
          }}
        />
      )}

      {/* AI Prompt Modal */}
      {showAiPrompt && (
        <AiPromptModal
          onSubmit={handleAiSubmit}
          onCancel={() => setShowAiPrompt(false)}
          remainingQuota={aiQuotaRemaining}
          quotaLimit={aiQuotaLimit}
        />
      )}

      {/* Mobile FAB for slash commands */}
      <MobileCommandFab editor={editor} />
    </div>
  );
}
