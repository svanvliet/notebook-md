import { isTauriEnvironment } from '../stores/storageAdapterFactory';

/**
 * Open an external URL in the user's default system browser.
 *
 * In the desktop app WKWebView/WebView2 won't open `target="_blank"` links, so we
 * route http(s) links through the Tauri opener plugin. In the browser we fall back
 * to opening a new tab.
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch (err) {
      console.error('[openExternal] failed to open via opener plugin', err);
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
