import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { buildMermaidSource, isDarkMode, renderMermaid } from '../../lib/mermaid';

interface MermaidViewProps extends NodeViewProps {
  /** Language dropdown, reused from CodeBlockView so users can switch away. */
  languageSelect?: ReactNode;
}

/**
 * Node view for Mermaid code blocks. Shows the rendered diagram (live preview);
 * clicking it reveals the editable source, which re-renders on change and hides
 * again on blur (click outside). The source (NodeViewContent) stays mounted so
 * ProseMirror keeps control of the editable content.
 */
export function MermaidView({ node, editor, getPos, languageSelect }: MermaidViewProps) {
  const language: string = node.attrs.language ?? 'mermaid';
  const source = node.textContent;

  const [editing, setEditing] = useState(false);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(16);
  const [themeTick, setThemeTick] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Track the editor's base font size (settings-driven) and theme so the diagram's
  // text matches the body text and re-renders when either changes.
  useEffect(() => {
    const dom = editor.view.dom as HTMLElement;
    const readFont = () => {
      const px = parseFloat(getComputedStyle(dom).fontSize);
      return Number.isFinite(px) ? px : 16;
    };
    setFontSize(readFont());

    // The `--editor-font-size` CSS var lives on an ancestor; observe it for changes.
    let host: HTMLElement | null = dom;
    while (host && !host.style.getPropertyValue('--editor-font-size')) {
      host = host.parentElement;
    }
    const fontObserver = new MutationObserver(() => setFontSize(readFont()));
    if (host) fontObserver.observe(host, { attributes: true, attributeFilter: ['style'] });

    const themeObserver = new MutationObserver(() => setThemeTick((t) => t + 1));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => { fontObserver.disconnect(); themeObserver.disconnect(); };
  }, [editor]);

  // Render (debounced) whenever the source, language, font size, or theme changes.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await renderMermaid(buildMermaidSource(language, source), isDarkMode(), fontSize);
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setSvg(result.svg ?? '');
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [source, language, fontSize, themeTick]);

  // Exit edit mode when the user clicks outside this block.
  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setEditing(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editing]);

  const enterEdit = useCallback(() => {
    if (editing || !editor.isEditable) return;
    setEditing(true);
    if (typeof getPos === 'function') {
      const pos = getPos();
      if (typeof pos === 'number') {
        // Place the cursor inside the code block.
        editor.chain().focus().setTextSelection(pos + 1).run();
      }
    }
  }, [editing, editor, getPos]);

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className="mermaid-block"
      data-editing={editing ? 'true' : 'false'}
    >
      <div className="mermaid-source-shell" contentEditable={false}>
        {languageSelect}
      </div>
      {/* Editable source — kept mounted; hidden in preview mode via CSS. */}
      <pre className="mermaid-source" data-language={language}>
        <NodeViewContent className="code-node-content" />
      </pre>
      {/* Rendered diagram (or error). Click to edit when not already editing. */}
      <div
        className="mermaid-preview"
        contentEditable={false}
        onClick={enterEdit}
        role="button"
        tabIndex={-1}
        title={editing ? undefined : 'Click to edit diagram'}
      >
        {error ? (
          <div className="mermaid-error">Diagram error: {error}</div>
        ) : svg ? (
          <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="mermaid-loading">Rendering diagram…</div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
