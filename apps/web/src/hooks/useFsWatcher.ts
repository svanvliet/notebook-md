/**
 * useFsWatcher — subscribes to Tauri FS-change events emitted by the
 * Rust watcher module and triggers tree refresh / file reload prompts.
 *
 * Only active when running inside Tauri.
 */

import { useEffect, useRef, useCallback } from 'react';
import { isTauriEnvironment } from '../stores/storageAdapterFactory';

export interface FsChangeEvent {
  notebookId: string;
  kind: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
}

interface UseFsWatcherOptions {
  /** The notebook ID to watch. */
  notebookId: string | null;
  /** Called when any file in the tree changes (debounced). */
  onTreeChange?: () => void;
  /** Called when a currently-open file was modified externally. */
  onFileModified?: (path: string) => void;
  /** Debounce window in ms for tree refresh (default 500). */
  debounceMs?: number;
}

export function useFsWatcher({
  notebookId,
  onTreeChange,
  onFileModified,
  debounceMs = 500,
}: UseFsWatcherOptions): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTreeChangeRef = useRef(onTreeChange);
  const onFileModifiedRef = useRef(onFileModified);
  onTreeChangeRef.current = onTreeChange;
  onFileModifiedRef.current = onFileModified;

  const handleEvent = useCallback(
    (event: FsChangeEvent) => {
      if (event.notebookId !== notebookId) return;

      if (event.kind === 'modify' && onFileModifiedRef.current) {
        onFileModifiedRef.current(event.path);
      }

      // Debounce tree refreshes
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onTreeChangeRef.current?.();
      }, debounceMs);
    },
    [notebookId, debounceMs],
  );

  useEffect(() => {
    if (!isTauriEnvironment() || !notebookId) return;

    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const { invoke } = await import('@tauri-apps/api/core');

        // Start watching
        await invoke('watch_directory', { notebookId });

        // Listen for events
        const unlistenFn = await listen<FsChangeEvent>('fs-change', (e) => {
          handleEvent(e.payload);
        });
        unlisten = unlistenFn;
      } catch (err) {
        console.warn('Failed to start file watcher:', err);
      }
    })();

    return () => {
      unlisten?.();
      if (timerRef.current) clearTimeout(timerRef.current);

      // Stop watching (fire and forget)
      (async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('unwatch_directory', { notebookId });
        } catch {
          // ignore cleanup errors
        }
      })();
    };
  }, [notebookId, handleEvent]);
}
