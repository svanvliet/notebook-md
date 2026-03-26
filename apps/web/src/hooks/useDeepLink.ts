/**
 * useDeepLink — listens for deep link events from the `notebookmd://` protocol.
 *
 * Routes:
 *   notebookmd://auth/callback?token=... → magic link auth
 *   notebookmd://open?notebook=...&file=... → open notebook/file
 *
 * Only active when running inside Tauri.
 */

import { useEffect } from 'react';
import { isTauriEnvironment } from '../stores/storageAdapterFactory';

interface UseDeepLinkOptions {
  /** Called when a magic link auth callback is received. */
  onAuthCallback?: (token: string) => void;
  /** Called when a notebook/file open request is received. */
  onOpenRequest?: (notebookId: string, filePath?: string) => void;
}

export function useDeepLink({ onAuthCallback, onOpenRequest }: UseDeepLinkOptions): void {
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    let unlisten: (() => void) | null = null;

    (async () => {
      try {
        const { onOpenUrl } = await import('tauri-plugin-deep-link-api');
        unlisten = await onOpenUrl((urls: string[]) => {
          for (const rawUrl of urls) {
            try {
              const url = new URL(rawUrl);

              if (url.pathname.startsWith('/auth/callback') || url.pathname.startsWith('auth/callback')) {
                const token = url.searchParams.get('token');
                if (token && onAuthCallback) {
                  onAuthCallback(token);
                }
              } else if (url.pathname.startsWith('/open') || url.pathname.startsWith('open')) {
                const notebook = url.searchParams.get('notebook');
                const file = url.searchParams.get('file') ?? undefined;
                if (notebook && onOpenRequest) {
                  onOpenRequest(notebook, file);
                }
              }
            } catch {
              console.warn('Failed to parse deep link URL:', rawUrl);
            }
          }
        });
      } catch (err) {
        // Plugin not available or error — silently ignore in web builds
        console.debug('Deep link plugin not available:', err);
      }
    })();

    return () => {
      unlisten?.();
    };
  }, [onAuthCallback, onOpenRequest]);
}
