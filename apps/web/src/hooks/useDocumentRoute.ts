import { useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { NotebookMeta } from '../stores/localNotebookStore';

/**
 * Resolves a notebook display name to its internal ID.
 * Handles URL-decoded names and falls back to direct ID match.
 */
function resolveNotebookId(urlName: string, notebooks: NotebookMeta[]): string | null {
  const decoded = decodeURIComponent(urlName);
  const byName = notebooks.find((n) => n.name === decoded);
  if (byName) return byName.id;
  // Fallback: direct ID match (e.g. demo-notebook)
  const byId = notebooks.find((n) => n.id === decoded);
  return byId?.id ?? null;
}

/**
 * Resolves a notebook ID to a URL-safe display name.
 */
function resolveNotebookName(notebookId: string, notebooks: NotebookMeta[]): string | null {
  const nb = notebooks.find((n) => n.id === notebookId);
  return nb?.name ?? null;
}

/**
 * Builds a URL path from a notebook ID and file path.
 */
function buildDocumentPath(
  notebookId: string,
  filePath: string,
  notebooks: NotebookMeta[],
  isDemoMode?: boolean,
): string {
  const name = resolveNotebookName(notebookId, notebooks);
  if (!name) return isDemoMode ? '/demo' : '/app';
  const prefix = isDemoMode ? '/demo' : '/app';
  return `${prefix}/${encodeURIComponent(name)}/${filePath}`;
}

/**
 * Parses the current tab ID (notebookId:filePath) into its components.
 */
function parseTabId(tabId: string): { notebookId: string; filePath: string } | null {
  const colonIdx = tabId.indexOf(':');
  if (colonIdx < 0) return null;
  return {
    notebookId: tabId.substring(0, colonIdx),
    filePath: tabId.substring(colonIdx + 1),
  };
}

interface UseDocumentRouteOptions {
  notebooks: NotebookMeta[];
  activeTabId: string | null;
  isDemoMode?: boolean;
  isSignedIn: boolean;
  /** Called to open a file (creates tab if needed, switches to it) */
  handleOpenFile: (notebookId: string, path: string) => void;
  /** Called to expand tree to a path */
  expandToFile: (notebookId: string, path: string) => void;
}

/**
 * Hook that bridges React Router URLs with the notebook manager's tab state.
 *
 * - URL → State: When the URL changes (including back/forward), opens the document.
 * - State → URL: When the active tab changes, updates the URL.
 * - Deduplication: Prevents infinite loops by comparing before acting.
 */
export function useDocumentRoute({
  notebooks,
  activeTabId,
  isDemoMode,
  isSignedIn,
  handleOpenFile,
  expandToFile,
}: UseDocumentRouteOptions) {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Extract route params
  const notebookName = params.notebookName;
  const filePath = params['*']; // Catch-all for file path

  // Track whether we're currently syncing to prevent loops
  const syncingRef = useRef(false);
  // Track the last URL we navigated to, to avoid duplicate pushes
  const lastUrlRef = useRef<string>('');
  // When true, the next State→URL update uses replace instead of push (e.g. after tab close)
  const replaceNextRef = useRef(false);
  // Track whether initial tab restoration has had a chance to run
  const initialLoadRef = useRef(true);
  // Refs for callbacks/state used in URL→State effect (avoids stale closures without adding deps)
  const handleOpenFileRef = useRef(handleOpenFile);
  handleOpenFileRef.current = handleOpenFile;
  const expandToFileRef = useRef(expandToFile);
  expandToFileRef.current = expandToFile;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  // --- URL → State ---
  // When the URL changes (navigation, back/forward), open the document
  useEffect(() => {
    if (syncingRef.current) return;
    if (!notebookName || !filePath) return;
    if (notebooks.length === 0) return; // Not loaded yet

    const notebookId = resolveNotebookId(notebookName, notebooks);
    if (!notebookId) return; // Notebook not found

    // Check if active tab already matches
    const currentTabId = activeTabIdRef.current;
    if (currentTabId) {
      const parsed = parseTabId(currentTabId);
      if (parsed && parsed.notebookId === notebookId && parsed.filePath === filePath) {
        return; // Already showing the right file
      }
    }

    syncingRef.current = true;
    handleOpenFileRef.current(notebookId, filePath);
    expandToFileRef.current(notebookId, filePath);
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }, [notebookName, filePath, notebooks]);
  // activeTabId, handleOpenFile, expandToFile accessed via refs to avoid triggering on tab switches

  // --- State → URL ---
  // When the active tab changes, update the URL
  useEffect(() => {
    if (syncingRef.current) return;
    if (!isSignedIn && !isDemoMode) return; // Don't update URL on welcome screen

    const prefix = isDemoMode ? '/demo' : '/app';

    if (!activeTabId) {
      // No active tab — navigate to base app URL if we're on a document URL.
      // But skip during initial load (tabs haven't been restored yet).
      if (initialLoadRef.current) return;
      if (location.pathname.startsWith(prefix + '/')) {
        syncingRef.current = true;
        navigate(prefix === '/demo' ? '/demo' : '/app', { replace: true });
        requestAnimationFrame(() => { syncingRef.current = false; });
      }
      return;
    }

    // Once we have an active tab, initial load is complete
    initialLoadRef.current = false;

    const parsed = parseTabId(activeTabId);
    if (!parsed) return;

    const newPath = buildDocumentPath(parsed.notebookId, parsed.filePath, notebooks, isDemoMode);
    if (newPath === location.pathname) {
      lastUrlRef.current = newPath;
      return; // Already at the right URL
    }

    // Use replace for tab closes (replaceNextRef) or deduplication
    const shouldReplace = replaceNextRef.current || newPath === lastUrlRef.current;
    replaceNextRef.current = false;

    syncingRef.current = true;
    lastUrlRef.current = newPath;
    navigate(newPath, { replace: shouldReplace });
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, [activeTabId, notebooks, isDemoMode, isSignedIn, location.pathname, navigate]);

  // --- navigateToFile: programmatic navigation for tree clicks, link clicks, etc. ---
  const navigateToFile = useCallback(
    (notebookId: string, path: string) => {
      const newPath = buildDocumentPath(notebookId, path, notebooks, isDemoMode);
      lastUrlRef.current = newPath;
      navigate(newPath);
    },
    [notebooks, isDemoMode, navigate],
  );

  // --- markReplaceNext: called before tab close so URL update uses replace ---
  const markReplaceNext = useCallback(() => {
    replaceNextRef.current = true;
  }, []);

  return {
    navigateToFile,
    markReplaceNext,
    /** The notebook name from the current URL (decoded) */
    urlNotebookName: notebookName ? decodeURIComponent(notebookName) : null,
    /** The file path from the current URL */
    urlFilePath: filePath ?? null,
  };
}

export { resolveNotebookId, resolveNotebookName, buildDocumentPath, parseTabId };
