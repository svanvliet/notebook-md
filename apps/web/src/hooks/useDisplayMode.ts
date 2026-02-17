import { useState, useEffect, useCallback } from 'react';
import type { DisplayMode } from '@notebook-md/shared';

const STORAGE_KEY = 'notebook-md-display-mode';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode: DisplayMode) {
  const resolved = mode === 'system' ? getSystemTheme() : mode;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function useDisplayMode() {
  const [mode, setModeState] = useState<DisplayMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as DisplayMode) ?? 'system';
  });

  const setMode = useCallback((newMode: DisplayMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
    applyTheme(newMode);
  }, []);

  useEffect(() => {
    applyTheme(mode);

    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [mode]);

  return { mode, setMode };
}
