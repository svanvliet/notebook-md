/**
 * Source adapter interface — all cloud storage providers implement this.
 * The proxy router delegates to the appropriate adapter based on the provider name.
 */

export interface FileEntry {
  path: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  lastModified?: string;
  sha?: string; // Git blob SHA (GitHub only)
}

export interface FileContent {
  path: string;
  name: string;
  content: string;
  encoding: 'utf-8' | 'base64';
  sha?: string;
  lastModified?: string;
}

export interface WriteResult {
  path: string;
  sha?: string;
  message?: string;
}

export interface SourceAdapter {
  readonly provider: string;

  /** List files/folders in a directory */
  listFiles(accessToken: string, rootPath: string, dirPath: string, branch?: string): Promise<FileEntry[]>;

  /** Read a file's content */
  readFile(accessToken: string, rootPath: string, filePath: string, branch?: string): Promise<FileContent>;

  /** Write (update) an existing file */
  writeFile(accessToken: string, rootPath: string, filePath: string, content: string, sha?: string, branch?: string): Promise<WriteResult>;

  /** Create a new file */
  createFile(accessToken: string, rootPath: string, filePath: string, content: string, branch?: string): Promise<WriteResult>;

  /** Delete a file or folder */
  deleteFile(accessToken: string, rootPath: string, filePath: string, sha?: string): Promise<void>;

  /** Rename or move a file */
  renameFile(accessToken: string, rootPath: string, oldPath: string, newPath: string): Promise<WriteResult>;
}

// Provider adapter registry
const adapters = new Map<string, SourceAdapter>();

export function registerSourceAdapter(adapter: SourceAdapter): void {
  adapters.set(adapter.provider, adapter);
}

export function getSourceAdapter(provider: string): SourceAdapter | undefined {
  return adapters.get(provider);
}

export function listSourceAdapters(): string[] {
  return Array.from(adapters.keys());
}
