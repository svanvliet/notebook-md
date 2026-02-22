import { useState, useCallback, useRef, useEffect } from 'react';

const STORAGE_KEY = 'notebook-md-outline-width';
const COLLAPSED_KEY = 'notebook-md-outline-collapsed';
const MIN_WIDTH = 40;
const DEFAULT_WIDTH = 200;
const MAX_WIDTH = 400;
const COLLAPSE_THRESHOLD = 60;

export function useOutlineResize() {
  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : DEFAULT_WIDTH;
  });
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  });
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      if (!next) {
        const stored = localStorage.getItem(STORAGE_KEY);
        setWidth(stored ? Number(stored) : DEFAULT_WIDTH);
      }
      return next;
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
        localStorage.setItem(COLLAPSED_KEY, 'true');
      } else {
        setCollapsed(false);
        localStorage.setItem(COLLAPSED_KEY, 'false');
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
