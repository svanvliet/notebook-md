import { useState, useCallback, useRef, useEffect } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

export function ImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, title } = node.attrs;
  const width = node.attrs.width as number | string | null;
  const height = node.attrs.height as number | string | null;

  const imgRef = useRef<HTMLImageElement>(null);
  const [resizing, setResizing] = useState(false);
  const [editingAlt, setEditingAlt] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [altValue, setAltValue] = useState(alt || '');
  const [urlValue, setUrlValue] = useState(src || '');
  const startPos = useRef({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    setAltValue(alt || '');
  }, [alt]);

  useEffect(() => {
    setUrlValue(src || '');
  }, [src]);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const img = imgRef.current;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      startPos.current = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
      setResizing(true);

      const onMove = (me: MouseEvent) => {
        const dx = me.clientX - startPos.current.x;
        const newW = Math.max(50, Math.round(startPos.current.w + dx));
        const aspect = startPos.current.h / startPos.current.w;
        const newH = Math.round(newW * aspect);
        updateAttributes({ width: newW, height: newH });
      };

      const onUp = () => {
        setResizing(false);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [updateAttributes],
  );

  const commitAlt = () => {
    updateAttributes({ alt: altValue });
    setEditingAlt(false);
  };

  const commitUrl = () => {
    updateAttributes({ src: urlValue });
    setEditingUrl(false);
  };

  const displayW = width ? (typeof width === 'string' ? parseInt(width) : width) : null;
  const displayH = height ? (typeof height === 'string' ? parseInt(height) : height) : null;

  return (
    <NodeViewWrapper className="image-view-wrapper" data-drag-handle>
      <div className={`relative inline-block ${selected ? 'image-selected' : ''}`}>
        {/* Floating toolbar */}
        {selected && (
          <div
            contentEditable={false}
            className="absolute -top-10 left-0 z-50 flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-2 py-1 text-xs whitespace-nowrap"
          >
            {/* Dimensions */}
            <span className="text-gray-500 dark:text-gray-400 font-mono">
              {displayW && displayH ? `${displayW}×${displayH}` : 'auto'}
            </span>
            <span className="text-gray-300 dark:text-gray-600">|</span>

            {/* Alt text */}
            {editingAlt ? (
              <input
                type="text"
                value={altValue}
                onChange={(e) => setAltValue(e.target.value)}
                onBlur={commitAlt}
                onKeyDown={(e) => e.key === 'Enter' && commitAlt()}
                className="w-28 px-1 py-0.5 border border-blue-400 rounded text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 outline-none"
                autoFocus
                placeholder="Alt text"
              />
            ) : (
              <button
                onClick={() => setEditingAlt(true)}
                className="px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                title="Edit alt text"
              >
                Alt: {alt || <span className="italic text-gray-400">none</span>}
              </button>
            )}
            <span className="text-gray-300 dark:text-gray-600">|</span>

            {/* URL */}
            {editingUrl ? (
              <input
                type="text"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onBlur={commitUrl}
                onKeyDown={(e) => e.key === 'Enter' && commitUrl()}
                className="w-48 px-1 py-0.5 border border-blue-400 rounded text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 outline-none"
                autoFocus
                placeholder="Image URL"
              />
            ) : (
              <button
                onClick={() => setEditingUrl(true)}
                className="px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 max-w-[160px] truncate"
                title={src}
              >
                URL: {src ? new URL(src, 'https://x').pathname.split('/').pop() : 'none'}
              </button>
            )}
          </div>
        )}

        {/* Image */}
        <img
          ref={imgRef}
          src={src}
          alt={alt || ''}
          title={title || ''}
          width={displayW || undefined}
          height={displayH || undefined}
          className="rounded-lg max-w-full"
          draggable={false}
        />

        {/* Resize handles — show when selected */}
        {selected && (
          <>
            <div
              className="image-resize-handle image-resize-handle-br"
              onMouseDown={onResizeStart}
            />
            <div className="image-resize-outline" />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
