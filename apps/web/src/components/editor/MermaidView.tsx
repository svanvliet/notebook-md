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
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Render (debounced) whenever the source, language, or theme changes.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await renderMermaid(buildMermaidSource(language, source), isDarkMode());
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setSvg(result.svg ?? '');
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [source, language]);

  // Re-render when the app toggles dark mode.
  useEffect(() => {
    const observer = new MutationObserver(async () => {
      const result = await renderMermaid(buildMermaidSource(language, source), isDarkMode());
      if (result.error) setError(result.error);
      else { setError(null); setSvg(result.svg ?? ''); }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [source, language]);

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
