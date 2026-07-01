import { isTauriEnvironment } from '../stores/storageAdapterFactory';

export type PrintMargins = 'narrow' | 'regular' | 'wide';

/** True when running on macOS, where WKWebView makes `window.print()` a no-op. */
function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.platform || '';
  return /Mac/i.test(platform) || /Macintosh/i.test(navigator.userAgent);
}

/** Read the active margin preference from the app root's data attribute. */
function currentMargins(): PrintMargins {
  const value = typeof document !== 'undefined'
    ? document.querySelector('[data-print-margins]')?.getAttribute('data-print-margins')
    : null;
  return value === 'narrow' || value === 'wide' ? value : 'regular';
}

/**
 * Print the active document.
 *
 * Windows/WebView2 supports `window.print()` directly (margins are driven by the
 * `@media print` styles in index.css). macOS/WKWebView makes `window.print()` a
 * no-op and ignores `@page` margins, so it invokes the native `print_document`
 * Tauri command, passing the margin preference so the Rust side can configure
 * `NSPrintInfo` accordingly.
 */
export async function printActiveDocument(): Promise<void> {
  const margins = currentMargins();
  if (isTauriEnvironment() && isMacOS()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('print_document', { margins });
      return;
    } catch (err) {
      console.error('[print] native print failed, falling back to window.print()', err);
    }
  }
  window.print();
}
