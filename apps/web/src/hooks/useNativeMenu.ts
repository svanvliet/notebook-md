/**
 * useNativeMenu — listens for native menu actions emitted by the Rust menu module.
 *
 * Menu item IDs are emitted as 'menu-action' events from the backend.
 * Only active when running inside Tauri.
 */

import { useEffect, useRef } from 'react';
import { isTauriEnvironment } from '../stores/storageAdapterFactory';

export type MenuAction =
  | 'new_notebook'
  | 'new_file'
  | 'open_folder'
  | 'save'
  | 'close_tab'
  | 'find'
  | 'toggle_sidebar'
  | 'toggle_dark'
  | 'about'
  | 'check_updates'
  | 'docs';

interface UseNativeMenuOptions {
  onMenuAction?: (action: MenuAction) => void;
}

export function useNativeMenu({ onMenuAction }: UseNativeMenuOptions): void {
  const callbackRef = useRef(onMenuAction);
  callbackRef.current = onMenuAction;

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
      } catch {
        // ignore if not in Tauri
      }
    })();

    return () => {
      unlisten?.();
    };
  }, []);
}
