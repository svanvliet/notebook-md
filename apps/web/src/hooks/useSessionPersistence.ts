import { useEffect, useRef, useCallback } from 'react';
import type { OpenTab } from './useNotebookManager';

const TABS_KEY = 'nb:tabs';
const TREE_NOTEBOOKS_KEY = 'nb:tree:notebooks';
const TREE_FOLDERS_KEY = 'nb:tree:folders';
const SCROLL_PREFIX = 'nb:scroll:';

interface TabPersistData {
  id: string;
  notebookId: string;
  path: string;
  name: string;
}

/**
 * Persists and restores session state: open tabs, tree expansion, scroll positions.
 * Uses sessionStorage so each browser tab has independent state.
 */
export function useSessionPersistence() {
  const restoredRef = useRef(false);

  // --- Tab persistence ---

  const persistTabs = useCallback((tabs: OpenTab[]) => {
    try {
      const data: TabPersistData[] = tabs.map((t) => ({
        id: t.id,
        notebookId: t.notebookId,
        path: t.path,
        name: t.name,
      }));
      sessionStorage.setItem(TABS_KEY, JSON.stringify(data));
    } catch { /* sessionStorage may be full or unavailable */ }
  }, []);

  const getPersistedTabs = useCallback((): TabPersistData[] => {
    try {
      const raw = sessionStorage.getItem(TABS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }, []);

  const clearPersistedTabs = useCallback(() => {
    try { sessionStorage.removeItem(TABS_KEY); } catch { /* ignore */ }
  }, []);

  // --- Tree expansion persistence ---

  const persistTreeState = useCallback((expandedNotebooks: Set<string>, expandedFolders: Set<string>) => {
    try {
      sessionStorage.setItem(TREE_NOTEBOOKS_KEY, JSON.stringify([...expandedNotebooks]));
      sessionStorage.setItem(TREE_FOLDERS_KEY, JSON.stringify([...expandedFolders]));
    } catch { /* ignore */ }
  }, []);

  const getPersistedTreeState = useCallback((): { notebooks: Set<string>; folders: Set<string> } => {
    try {
      const nbRaw = sessionStorage.getItem(TREE_NOTEBOOKS_KEY);
      const fldRaw = sessionStorage.getItem(TREE_FOLDERS_KEY);
      return {
        notebooks: nbRaw ? new Set(JSON.parse(nbRaw)) : new Set(),
        folders: fldRaw ? new Set(JSON.parse(fldRaw)) : new Set(),
      };
    } catch {
      return { notebooks: new Set(), folders: new Set() };
    }
  }, []);

  // --- Scroll position persistence ---

  const persistScrollPosition = useCallback((tabId: string, scrollTop: number) => {
    try {
      sessionStorage.setItem(`${SCROLL_PREFIX}${tabId}`, String(scrollTop));
    } catch { /* ignore */ }
  }, []);

  const getPersistedScrollPosition = useCallback((tabId: string): number => {
    try {
      const raw = sessionStorage.getItem(`${SCROLL_PREFIX}${tabId}`);
      return raw ? Number(raw) : 0;
    } catch { return 0; }
  }, []);

  const removePersistedScrollPosition = useCallback((tabId: string) => {
    try { sessionStorage.removeItem(`${SCROLL_PREFIX}${tabId}`); } catch { /* ignore */ }
  }, []);

  return {
    restoredRef,
    persistTabs,
    getPersistedTabs,
    clearPersistedTabs,
    persistTreeState,
    getPersistedTreeState,
    persistScrollPosition,
    getPersistedScrollPosition,
    removePersistedScrollPosition,
  };
}

export type { TabPersistData };
