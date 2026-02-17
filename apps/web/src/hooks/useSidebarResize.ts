import { useState, useCallback, useRef, useEffect } from 'react';

const STORAGE_KEY = 'notebook-md-sidebar-width';
const MIN_WIDTH = 48;
const DEFAULT_WIDTH = 260;
const MAX_WIDTH = 480;
const COLLAPSE_THRESHOLD = 80;

export function useSidebarResize() {
  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : DEFAULT_WIDTH;
  });
  const [collapsed, setCollapsed] = useState(false);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      if (prev) {
        // Expanding — restore width
        const stored = localStorage.getItem(STORAGE_KEY);
        setWidth(stored ? Number(stored) : DEFAULT_WIDTH);
      }
      return !prev;
    });
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = collapsed ? MIN_WIDTH : width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [width, collapsed],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + delta));

      if (newWidth <= COLLAPSE_THRESHOLD) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
        setWidth(newWidth);
        localStorage.setItem(STORAGE_KEY, String(newWidth));
      }
    };

    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return {
    width: collapsed ? MIN_WIDTH : width,
    collapsed,
    toggleCollapse,
    onMouseDown,
  };
}
