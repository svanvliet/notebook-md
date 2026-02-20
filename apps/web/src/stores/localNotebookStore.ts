import { openDB, deleteDB, type IDBPDatabase } from 'idb';

export interface NotebookMeta {
  id: string;
  name: string;
  sourceType: 'local' | 'github' | 'onedrive' | 'google-drive' | 'icloud';
  /** Source-specific config (e.g., { owner, repo, branch, rootPath } for GitHub) */
  sourceConfig: Record<string, unknown>;
  /** Display order in the notebook pane (lower = higher) */
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface FileEntry {
  /** Full path relative to notebook root, e.g. "notes/hello.md" */
  path: string;
  notebookId: string;
  name: string;
  /** 'file' or 'folder' */
  type: 'file' | 'folder';
  /** Parent folder path, empty string for root-level items */
  parentPath: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

const DB_PREFIX = 'notebook-md';
const DB_VERSION = 1;
const NOTEBOOKS_STORE = 'notebooks';
const FILES_STORE = 'files';

let currentScope: string | null = null;
let dbPromise: Promise<IDBPDatabase> | null = null;

/** Set the user scope for IndexedDB. Call before any data access. */
export function setStorageScope(userId: string | null) {
  const scope = userId ?? 'anonymous';
  if (scope !== currentScope) {
    currentScope = scope;
    dbPromise = null; // force re-open with new DB name
  }
}

function getDb() {
  if (!dbPromise) {
    const dbName = currentScope ? `${DB_PREFIX}-${currentScope}` : DB_PREFIX;
    dbPromise = openDB(dbName, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(NOTEBOOKS_STORE)) {
          db.createObjectStore(NOTEBOOKS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          const store = db.createObjectStore(FILES_STORE, { keyPath: ['notebookId', 'path'] });
          store.createIndex('byNotebook', 'notebookId');
          store.createIndex('byParent', ['notebookId', 'parentPath']);
        }
      },
    });
  }
  return dbPromise;
}

// --- Notebook CRUD ---

export async function createNotebook(
  name: string,
  sourceType: NotebookMeta['sourceType'] = 'local',
  sourceConfig: Record<string, unknown> = {},
): Promise<NotebookMeta> {
  const db = await getDb();
  const now = Date.now();
  const notebook: NotebookMeta = {
    id: crypto.randomUUID(),
    name,
    sourceType,
    sourceConfig,
    sortOrder: now,
    createdAt: now,
    updatedAt: now,
  };
  await db.put(NOTEBOOKS_STORE, notebook);
  return notebook;
}

/** Insert or update a notebook by id (used to sync server notebooks into IndexedDB) */
export async function upsertNotebook(notebook: NotebookMeta): Promise<void> {
  const db = await getDb();
  await db.put(NOTEBOOKS_STORE, notebook);
}

export async function listNotebooks(): Promise<NotebookMeta[]> {
  const db = await getDb();
  const notebooks = await db.getAll(NOTEBOOKS_STORE);
  // Migrate: assign sortOrder if missing
  for (const nb of notebooks) {
    if (nb.sortOrder == null) nb.sortOrder = nb.createdAt;
  }
  return notebooks.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function renameNotebook(id: string, name: string): Promise<void> {
  const db = await getDb();
  const notebook = await db.get(NOTEBOOKS_STORE, id);
  if (!notebook) throw new Error(`Notebook ${id} not found`);
  notebook.name = name;
  notebook.updatedAt = Date.now();
  await db.put(NOTEBOOKS_STORE, notebook);
}

export async function deleteNotebook(id: string): Promise<void> {
  const db = await getDb();
  // Delete all files in the notebook
  const files = await db.getAllFromIndex(FILES_STORE, 'byNotebook', id);
  const tx = db.transaction(FILES_STORE, 'readwrite');
  for (const file of files) {
    await tx.store.delete([file.notebookId, file.path]);
  }
  await tx.done;
  // Delete the notebook itself
  await db.delete(NOTEBOOKS_STORE, id);
}

// --- File/Folder CRUD ---

export async function createFile(
  notebookId: string,
  parentPath: string,
  name: string,
  type: 'file' | 'folder',
  content = '',
): Promise<FileEntry> {
  const db = await getDb();
  const path = parentPath ? `${parentPath}/${name}` : name;
  const now = Date.now();
  const entry: FileEntry = {
    path,
    notebookId,
    name,
    type,
    parentPath,
    content,
    createdAt: now,
    updatedAt: now,
  };
  await db.put(FILES_STORE, entry);
  // Update notebook timestamp
  const notebook = await db.get(NOTEBOOKS_STORE, notebookId);
  if (notebook) {
    notebook.updatedAt = now;
    await db.put(NOTEBOOKS_STORE, notebook);
  }
  return entry;
}

export async function getFile(notebookId: string, path: string): Promise<FileEntry | undefined> {
  const db = await getDb();
  return db.get(FILES_STORE, [notebookId, path]);
}

export async function listFiles(notebookId: string): Promise<FileEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex(FILES_STORE, 'byNotebook', notebookId);
}

export async function listChildren(notebookId: string, parentPath: string): Promise<FileEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex(FILES_STORE, 'byParent', [notebookId, parentPath]);
}

/** Ensure an assets/ folder exists under the given parent path, creating it if needed. */
export async function ensureAssetsFolder(notebookId: string, parentPath: string): Promise<string> {
  const assetsPath = parentPath ? `${parentPath}/assets` : 'assets';
  const db = await getDb();
  const existing = await db.get(FILES_STORE, [notebookId, assetsPath]);
  if (!existing) {
    await createFile(notebookId, parentPath, 'assets', 'folder');
  }
  return assetsPath;
}

export async function saveFileContent(
  notebookId: string,
  path: string,
  content: string,
): Promise<void> {
  const db = await getDb();
  const entry = await db.get(FILES_STORE, [notebookId, path]);
  if (!entry) throw new Error(`File ${path} not found in notebook ${notebookId}`);
  entry.content = content;
  entry.updatedAt = Date.now();
  await db.put(FILES_STORE, entry);
}

export async function renameFile(
  notebookId: string,
  oldPath: string,
  newName: string,
): Promise<FileEntry> {
  const db = await getDb();
  const entry = await db.get(FILES_STORE, [notebookId, oldPath]);
  if (!entry) throw new Error(`File ${oldPath} not found`);

  const newPath = entry.parentPath ? `${entry.parentPath}/${newName}` : newName;

  // If it's a folder, we need to move all children too
  if (entry.type === 'folder') {
    const allFiles = await listFiles(notebookId);
    const tx = db.transaction(FILES_STORE, 'readwrite');
    for (const file of allFiles) {
      if (file.path.startsWith(oldPath + '/')) {
        const newFilePath = newPath + file.path.slice(oldPath.length);
        const newParent = file.parentPath === oldPath
          ? newPath
          : newPath + file.parentPath.slice(oldPath.length);
        await tx.store.delete([notebookId, file.path]);
        await tx.store.put({
          ...file,
          path: newFilePath,
          parentPath: newParent,
          updatedAt: Date.now(),
        });
      }
    }
    await tx.done;
  }

  // Delete old entry and create new one
  await db.delete(FILES_STORE, [notebookId, oldPath]);
  const updated: FileEntry = {
    ...entry,
    name: newName,
    path: newPath,
    updatedAt: Date.now(),
  };
  await db.put(FILES_STORE, updated);
  return updated;
}

export async function deleteFile(notebookId: string, path: string): Promise<void> {
  const db = await getDb();
  const entry = await db.get(FILES_STORE, [notebookId, path]);
  if (!entry) return;

  // If folder, recursively delete children
  if (entry.type === 'folder') {
    const allFiles = await listFiles(notebookId);
    const tx = db.transaction(FILES_STORE, 'readwrite');
    for (const file of allFiles) {
      if (file.path.startsWith(path + '/')) {
        await tx.store.delete([notebookId, file.path]);
      }
    }
    await tx.done;
  }

  await db.delete(FILES_STORE, [notebookId, path]);
}

export async function moveFile(
  notebookId: string,
  oldPath: string,
  newParentPath: string,
): Promise<FileEntry> {
  const db = await getDb();
  const entry = await db.get(FILES_STORE, [notebookId, oldPath]);
  if (!entry) throw new Error(`File ${oldPath} not found`);

  const newPath = newParentPath ? `${newParentPath}/${entry.name}` : entry.name;

  if (entry.type === 'folder') {
    const allFiles = await listFiles(notebookId);
    const tx = db.transaction(FILES_STORE, 'readwrite');
    for (const file of allFiles) {
      if (file.path.startsWith(oldPath + '/')) {
        const suffix = file.path.slice(oldPath.length);
        const movedParent = file.parentPath === oldPath
          ? newPath
          : newPath + file.parentPath.slice(oldPath.length);
        await tx.store.delete([notebookId, file.path]);
        await tx.store.put({
          ...file,
          path: newPath + suffix,
          parentPath: movedParent,
          updatedAt: Date.now(),
        });
      }
    }
    await tx.done;
  }

  await db.delete(FILES_STORE, [notebookId, oldPath]);
  const updated: FileEntry = {
    ...entry,
    path: newPath,
    parentPath: newParentPath,
    updatedAt: Date.now(),
  };
  await db.put(FILES_STORE, updated);
  return updated;
}

/**
 * Persist notebook ordering. Accepts an array of notebook IDs in the desired order.
 */
export async function reorderNotebooks(orderedIds: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(NOTEBOOKS_STORE, 'readwrite');
  for (let i = 0; i < orderedIds.length; i++) {
    const nb = await tx.store.get(orderedIds[i]);
    if (nb) {
      nb.sortOrder = i;
      nb.updatedAt = Date.now();
      await tx.store.put(nb);
    }
  }
  await tx.done;
}

// --- Demo mode migration ---

/** Migrate notebooks and files from the anonymous DB to a user-scoped DB. */
export async function migrateAnonymousNotebooks(newUserId: string): Promise<number> {
  const anonDbName = `${DB_PREFIX}-anonymous`;
  const userDbName = `${DB_PREFIX}-${newUserId}`;

  const anonDb = await openDB(anonDbName, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(NOTEBOOKS_STORE)) {
        db.createObjectStore(NOTEBOOKS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        const store = db.createObjectStore(FILES_STORE, { keyPath: ['notebookId', 'path'] });
        store.createIndex('byNotebook', 'notebookId');
        store.createIndex('byParent', ['notebookId', 'parentPath']);
      }
    },
  });

  const notebooks = await anonDb.getAll(NOTEBOOKS_STORE) as NotebookMeta[];
  if (notebooks.length === 0) {
    anonDb.close();
    return 0;
  }

  const files = await anonDb.getAll(FILES_STORE) as FileEntry[];

  const userDb = await openDB(userDbName, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(NOTEBOOKS_STORE)) {
        db.createObjectStore(NOTEBOOKS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        const store = db.createObjectStore(FILES_STORE, { keyPath: ['notebookId', 'path'] });
        store.createIndex('byNotebook', 'notebookId');
        store.createIndex('byParent', ['notebookId', 'parentPath']);
      }
    },
  });

  // Offset sortOrder to avoid collisions with existing notebooks
  const existingNotebooks = await userDb.getAll(NOTEBOOKS_STORE) as NotebookMeta[];
  const maxSort = existingNotebooks.reduce((max, nb) => Math.max(max, nb.sortOrder), -1);

  const tx = userDb.transaction([NOTEBOOKS_STORE, FILES_STORE], 'readwrite');
  for (const nb of notebooks) {
    nb.sortOrder = maxSort + 1 + nb.sortOrder;
    await tx.objectStore(NOTEBOOKS_STORE).put(nb);
  }
  for (const file of files) {
    await tx.objectStore(FILES_STORE).put(file);
  }
  await tx.done;

  userDb.close();
  anonDb.close();

  // Delete the anonymous DB
  await deleteDB(anonDbName);

  // Reset scope so next getDb() opens the user DB
  currentScope = null;
  dbPromise = null;

  return notebooks.length;
}
