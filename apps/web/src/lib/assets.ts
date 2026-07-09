import { isTauriEnvironment } from '../stores/storageAdapterFactory';

/** Document context needed to resolve relative asset paths against the notebook. */
export interface DocContext {
  notebookId: string;
  path: string;
}

/** Schemes / paths that are already loadable and must not be resolved. */
function isLoadable(src: string): boolean {
  return /^(https?:|data:|blob:|asset:|tauri:|file:)/i.test(src) || src.startsWith('/');
}

/**
 * Resolve an image `src` for display.
 *
 * Relative paths (e.g. `media/diagram.png`) reference files on disk next to the
 * document, which the webview can't load directly. In the desktop app we read the
 * file through the `read_notebook_asset` command and return a `data:` URL. Anything
 * already loadable (http, data, absolute) is returned unchanged.
 */
export async function resolveAssetSrc(src: string, ctx: DocContext | null): Promise<string> {
  if (!src || isLoadable(src)) return src;
  if (!isTauriEnvironment() || !ctx?.notebookId) return src;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('read_notebook_asset', {
      notebookId: ctx.notebookId,
      docPath: ctx.path,
      src,
    });
  } catch (err) {
    console.error('[resolveAssetSrc] failed to resolve', src, err);
    return src;
  }
}
