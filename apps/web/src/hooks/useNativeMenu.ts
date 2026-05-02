/**
 * useNativeMenu — listens for native menu actions emitted by the Rust menu module.
 *
 * Menu item IDs are emitted as 'menu-action' events from the backend.
 * Only active when running inside Tauri.
 *
 * On Windows, WebView2 captures keyboard events before native menu accelerators
 * can fire. We add a keydown fallback so shortcuts like Ctrl+N still work.
 */

import { useEffect, useRef } from 'react';
import { isTauriEnvironment } from '../stores/storageAdapterFactory';

export type MenuAction =
  | 'new_notebook'
  | 'new_file'
  | 'open_file'
  | 'open_folder'
  | 'save'
  | 'close_tab'
  | 'find'
  | 'toggle_sidebar'
  | 'toggle_dark'
  | 'about'
  | 'check_updates'
  | 'docs';

/** Map keyboard shortcuts to menu actions (Windows fallback). */
const SHORTCUT_MAP: { key: string; ctrl: boolean; shift: boolean; action: MenuAction }[] = [
  { key: 'n', ctrl: true, shift: false, action: 'new_file' },
  { key: 'n', ctrl: true, shift: true,  action: 'new_notebook' },
  { key: 'o', ctrl: true, shift: false, action: 'open_file' },
  { key: 'o', ctrl: true, shift: true,  action: 'open_folder' },
  { key: 'w', ctrl: true, shift: false, action: 'close_tab' },
  { key: 'f', ctrl: true, shift: false, action: 'find' },
  { key: 'b', ctrl: true, shift: false, action: 'toggle_sidebar' },
  { key: 'd', ctrl: true, shift: true,  action: 'toggle_dark' },
];

interface UseNativeMenuOptions {
  onMenuAction?: (action: MenuAction) => void;
}

export function useNativeMenu({ onMenuAction }: UseNativeMenuOptions): void {
  const callbackRef = useRef(onMenuAction);
  callbackRef.current = onMenuAction;

  // Listen for menu-action events from the Rust backend (works on macOS)
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unlistenFn = await listen<string>('menu-action', (event) => {
          callbackRef.current?.(event.payload as MenuAction);
        });
        unlisten = unlistenFn;
      } catch (err) {
        console.error('[useNativeMenu] Failed to register menu listener:', err);
      }
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  // Windows fallback: WebView2 swallows keyboard events before native menu
  // accelerators fire, so we listen for keydown and dispatch menu actions.
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    const isWindows = navigator.userAgent.includes('Windows');
    if (!isWindows) return;

    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      for (const shortcut of SHORTCUT_MAP) {
        if (
          e.key.toLowerCase() === shortcut.key &&
          e.shiftKey === shortcut.shift
        ) {
          e.preventDefault();
          callbackRef.current?.(shortcut.action);
          return;
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
