/**
 * useAutoSave — debounced auto-save hook for the desktop app.
 *
 * In the Tauri environment, writing to disk is explicit (vs IndexedDB which
 * persists on every change). This hook provides:
 *   - 2-second debounced auto-save after edits
 *   - Immediate flush via flushSave() / Cmd+S
 *   - Save state: 'saved' | 'saving' | 'unsaved'
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { isTauriEnvironment } from '../stores/storageAdapterFactory';

export type SaveState = 'saved' | 'saving' | 'unsaved';

interface UseAutoSaveOptions {
  /** Function to call to write the current content to disk. */
  save: () => Promise<void>;
  /** Debounce delay in ms (default 2000). */
  delayMs?: number;
  /** Whether auto-save is enabled (default true). */
  enabled?: boolean;
}

interface UseAutoSaveReturn {
  /** Current save state. */
  saveState: SaveState;
  /** Mark content as dirty — starts the debounce timer. */
  markDirty: () => void;
  /** Immediately flush pending save, bypassing the debounce. */
  flushSave: () => Promise<void>;
}

export function useAutoSave({
  save,
  delayMs = 2000,
  enabled = true,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  const doSave = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveState('saving');
    try {
      await saveRef.current();
      dirtyRef.current = false;
      setSaveState('saved');
    } catch (err) {
      console.error('Auto-save failed:', err);
      // Remain unsaved so user knows
      setSaveState('unsaved');
    } finally {
      savingRef.current = false;
    }
  }, []);

  const markDirty = useCallback(() => {
    if (!enabled) return;
    dirtyRef.current = true;
    setSaveState('unsaved');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      doSave();
    }, delayMs);
  }, [enabled, delayMs, doSave]);

  const flushSave = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (dirtyRef.current || saveState === 'unsaved') {
      await doSave();
    }
  }, [doSave, saveState]);

  // Cmd+S / Ctrl+S handler (only in Tauri)
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        flushSave();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flushSave]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { saveState, markDirty, flushSave };
}
