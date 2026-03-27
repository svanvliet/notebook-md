# Notebook.md — Desktop App Implementation Plan

**Status:** Phases 1–8 implemented (in progress, on branch `feature/desktop`)
**Framework:** Tauri v2 (Rust backend, system WebView)
**Platforms:** macOS (Universal), Windows (x64 + ARM64)
**Requirements:** [desktop-requirements.md](../requirements/desktop-requirements.md)

---

## Phase 1: Project Scaffolding & Tauri Setup

**Goal:** Bare-bones Tauri v2 app that loads the existing web app in a native window.

**Dependencies:** None (starting point)

### Tasks

1. **Initialize `apps/desktop` workspace**
   Create the `apps/desktop` directory with a minimal `package.json` for the workspace. Add Tauri CLI as a dev dependency (`@tauri-apps/cli@^2`). Add the Tauri JS API package (`@tauri-apps/api@^2`) as a dependency.

   Files to create:
   - `apps/desktop/package.json`

2. **Add workspace entry to root `package.json`**
   The root `package.json` already has `"workspaces": ["apps/*", "packages/*"]`, so `apps/desktop` will be picked up automatically. Add convenience scripts:
   - `"dev:desktop": "npm -w apps/desktop run tauri dev"`
   - `"build:desktop": "npm -w apps/web run build && npm -w apps/desktop run tauri build"`

   Files to modify:
   - `package.json` (root)

3. **Scaffold Tauri v2 project structure**
   Create the `src-tauri/` directory with Tauri v2 configuration. The Tauri app consumes `apps/web/dist/` as its frontend in production and proxies to `http://localhost:5173` in dev mode.

   Files to create:
   - `apps/desktop/src-tauri/tauri.conf.json` — App identifier (`io.notebookmd.desktop`), window config (title: "Notebook.md", 1200×800 default, min 800×600), dev server URL (`http://localhost:5173`), build config pointing `frontendDist` to `../../web/dist`
   - `apps/desktop/src-tauri/Cargo.toml` — Rust crate with `tauri` v2 dependency, edition 2021
   - `apps/desktop/src-tauri/src/main.rs` — Minimal Tauri entry point: `tauri::Builder::default().run()`
   - `apps/desktop/src-tauri/build.rs` — Standard Tauri build script
   - `apps/desktop/src-tauri/icons/` — Default Tauri icons (generate via `npm run tauri icon` later)

4. **Add npm scripts to `apps/desktop/package.json`**
   - `"tauri": "tauri"` — Tauri CLI passthrough
   - `"tauri dev": "tauri dev"` — Dev mode (opens window pointing to Vite dev server)
   - `"tauri build": "tauri build"` — Production build

5. **Configure dev mode proxy**
   In `tauri.conf.json`, set `build.devUrl` to `http://localhost:5173` so Tauri proxies to the running Vite dev server. The developer workflow is:
   - Terminal 1: `npm -w apps/web run dev` (Vite at :5173)
   - Terminal 2: `npm -w apps/desktop run tauri dev` (native window)

   Optionally create a `dev.sh` script or npm script that starts both concurrently.

6. **Verify the app loads**
   Build `apps/web`, then run `tauri dev` and confirm the web app renders inside the native window with full functionality (editor, sidebar, routing). All existing features should work since the app is just loading in a WebView.

### Testing Approach

- Manual: Run `tauri dev`, confirm the web app loads and is interactive
- Verify Vite HMR works through the Tauri window
- Confirm the window title, default size, and minimum size are correct

---

## Phase 2: Storage Adapter Abstraction

**Goal:** Decouple the local notebook storage from IndexedDB so both IndexedDB (web) and filesystem (desktop) adapters can be used interchangeably.

**Dependencies:** Phase 1 (Tauri loads the web app)

> **⚠️ Risk note:** This is the riskiest phase. Refactoring `useNotebookManager` to use an abstract adapter touches a critical hook that every part of the app depends on. The adapter pattern with backward-compatible wrappers mitigates this — existing function exports continue to work, and all 213 web tests must pass after the refactor before proceeding to Phase 3.

### Tasks

1. **Define the `StorageAdapter` interface**
   Extract the public API surface from `localNotebookStore.ts` into a TypeScript interface. This interface covers all operations that `useNotebookManager` calls on local storage.

   ```typescript
   export interface StorageAdapter {
     setStorageScope(userId: string | null): void;
     createNotebook(name: string, sourceType?: NotebookMeta['sourceType'], sourceConfig?: Record<string, unknown>): Promise<NotebookMeta>;
     upsertNotebook(notebook: NotebookMeta): Promise<void>;
     listNotebooks(): Promise<NotebookMeta[]>;
     renameNotebook(id: string, name: string): Promise<void>;
     deleteNotebook(id: string): Promise<void>;
     createFile(notebookId: string, parentPath: string, name: string, type: 'file' | 'folder', content?: string): Promise<FileEntry>;
     getFile(notebookId: string, path: string): Promise<FileEntry | undefined>;
     listFiles(notebookId: string): Promise<FileEntry[]>;
     listChildren(notebookId: string, parentPath: string): Promise<FileEntry[]>;
     saveFileContent(notebookId: string, path: string, content: string): Promise<void>;
     renameFile(notebookId: string, oldPath: string, newName: string): Promise<FileEntry>;
     deleteFile(notebookId: string, path: string): Promise<void>;
     moveFile(notebookId: string, oldPath: string, newParentPath: string): Promise<FileEntry>;
     reorderNotebooks(orderedIds: string[]): Promise<void>;
     ensureAssetsFolder(notebookId: string, parentPath: string): Promise<string>;
   }
   ```

   Files to create:
   - `apps/web/src/stores/StorageAdapter.ts` — Interface definition + `NotebookMeta` and `FileEntry` type re-exports

2. **Refactor `localNotebookStore.ts` into an IndexedDB adapter**
   Wrap the existing module-level functions into a class or factory that implements `StorageAdapter`. The existing exports remain as-is for backward compatibility (they delegate to the default IndexedDB adapter instance).

   Files to modify:
   - `apps/web/src/stores/localNotebookStore.ts` — Add `export class IndexedDBAdapter implements StorageAdapter { ... }`, keep existing function exports as thin wrappers over a default instance

3. **Create `tauriNotebookStore.ts` (Tauri filesystem adapter)**
   Implements `StorageAdapter` by calling Tauri `invoke()` commands for every operation. Each method maps to a Rust command (Phase 3). Notebook metadata is stored in a JSON manifest file (`notebooks.json`) in the root notebook directory.

   ```typescript
   import { invoke } from '@tauri-apps/api/core';

   export class TauriFilesystemAdapter implements StorageAdapter {
     async listFiles(notebookId: string): Promise<FileEntry[]> {
       return invoke('list_notebook_files', { notebookId });
     }
     async saveFileContent(notebookId: string, path: string, content: string): Promise<void> {
       return invoke('write_file', { notebookId, path, content });
     }
     // ... etc
   }
   ```

   Files to create:
   - `apps/web/src/stores/tauriNotebookStore.ts`

4. **Create adapter factory with platform detection**
   Detect the runtime environment via `window.__TAURI__` (or `window.__TAURI_INTERNALS__` in Tauri v2) and return the appropriate adapter. The factory is called once at app startup.

   ```typescript
   export function createStorageAdapter(): StorageAdapter {
     if (window.__TAURI_INTERNALS__) {
       return new TauriFilesystemAdapter();
     }
     return new IndexedDBAdapter();
   }
   ```

   Files to create:
   - `apps/web/src/stores/storageAdapterFactory.ts`

5. **Refactor `useNotebookManager` to accept an abstract adapter**
   Change `useNotebookManager` to receive a `StorageAdapter` instance (or obtain one from a React context/factory) instead of importing `localNotebookStore` functions directly. The hook's logic remains identical — only the import source changes.

   The adapter can be provided via a React context so it's initialized once and shared across components:

   ```typescript
   const StorageContext = createContext<StorageAdapter>(new IndexedDBAdapter());
   ```

   Files to modify:
   - `apps/web/src/hooks/useNotebookManager.ts` — Replace direct imports from `localNotebookStore` with calls through the adapter
   - `apps/web/src/App.tsx` (or equivalent root) — Wrap app in `StorageContext.Provider` with the result of `createStorageAdapter()`

6. **Add TypeScript declaration for `window.__TAURI_INTERNALS__`**
   Extend the global `Window` interface so TypeScript doesn't complain about the property check.

   Files to create or modify:
   - `apps/web/src/tauri.d.ts` or `apps/web/vite-env.d.ts`

### Testing Approach

- Unit tests: Test `IndexedDBAdapter` with the existing `fake-indexeddb` setup — all current `localNotebookStore` tests should pass unchanged
- Unit tests: Test `TauriFilesystemAdapter` with mocked `invoke()` calls
- Integration: Run the web app (`npm -w apps/web run dev`) and confirm no regressions — the IndexedDB adapter should be selected automatically
- Integration: Run `tauri dev` and confirm the Tauri adapter is selected (will fail on invoke calls until Phase 3, but the detection should work)

---

## Phase 3: Tauri FS Commands (Rust)

**Goal:** Implement all file system operations in Rust, exposed as Tauri commands that the frontend adapter calls via `invoke()`.

**Dependencies:** Phase 2 (frontend adapter calls these commands)

### Tasks

1. **Define the command module structure**
   Organize Rust source into modules: `commands.rs` (command registrations), `fs.rs` (filesystem operations), `state.rs` (app state like notebook directory paths).

   Files to create:
   - `apps/desktop/src-tauri/src/commands.rs`
   - `apps/desktop/src-tauri/src/fs.rs`
   - `apps/desktop/src-tauri/src/state.rs`

   Files to modify:
   - `apps/desktop/src-tauri/src/main.rs` — Register modules and commands with `tauri::Builder`

2. **Implement notebook directory management**
   Store the default notebook root directory in Tauri's app state. Default to `~/Documents/Notebook.md/` on macOS and `%USERPROFILE%\Documents\Notebook.md\` on Windows. Create the directory on first launch if it doesn't exist.

   Store notebook metadata (id, name, sourceType, sourceConfig, sortOrder, timestamps) in a `notebooks.json` file in **Tauri's app data directory** (e.g., `~/Library/Application Support/io.notebookmd.desktop/` on macOS, `%APPDATA%/io.notebookmd.desktop/` on Windows) — **not** inside the notebook folders themselves. This avoids polluting user project folders (especially important for "Open Local Folder" notebooks that point to arbitrary directories like Git repos). Notebook `sourceConfig` stores the absolute path to each notebook's folder on disk.

   Rust structs:
   ```rust
   #[derive(Serialize, Deserialize)]
   struct NotebookMeta {
       id: String,
       name: String,
       source_type: String,
       source_config: serde_json::Value,
       sort_order: i64,
       created_at: i64,
       updated_at: i64,
   }
   ```

3. **Implement `list_notebook_files` command**
   Recursively walk a notebook directory and return a flat list of `FileEntry` structs. Each entry includes: `path` (relative to notebook root), `name`, `type` ("file" or "folder"), `parentPath`, `content` (empty string — content loaded on demand), `createdAt`, `updatedAt` (from filesystem metadata).

   Skip hidden files (dotfiles) and common ignored patterns (`.git/`, `node_modules/`, `.DS_Store`).

   ```rust
   #[tauri::command]
   async fn list_notebook_files(notebook_id: String, state: State<'_, AppState>) -> Result<Vec<FileEntry>, String>
   ```

4. **Implement `read_file` command**
   Read a file's UTF-8 content given a notebook ID and relative path. Return the content as a string. Error if file doesn't exist or isn't valid UTF-8 (for non-text files, return an error — the frontend handles binary files differently).

   ```rust
   #[tauri::command]
   async fn read_file(notebook_id: String, path: String, state: State<'_, AppState>) -> Result<String, String>
   ```

5. **Implement `write_file` command (atomic writes)**
   Write content to a file using an atomic write strategy: write to a temporary file in the same directory, then rename to the target path. This prevents data loss if the app crashes mid-write.

   ```rust
   #[tauri::command]
   async fn write_file(notebook_id: String, path: String, content: String, state: State<'_, AppState>) -> Result<(), String>
   ```

6. **Implement `create_file` and `create_folder` commands**
   Create a new file (with optional initial content) or folder at the given path. Ensure parent directories exist. Return the created `FileEntry`.

7. **Implement `delete_file` and `delete_folder` commands (OS trash)**
   Move files/folders to the OS trash instead of permanent deletion. Use the `trash` crate on both macOS and Windows.

   Add to `Cargo.toml`:
   ```toml
   [dependencies]
   trash = "5"
   ```

8. **Implement `rename_file` command**
   Rename a file or folder. For folders, this is a filesystem rename — all children move automatically. Return the updated `FileEntry`.

9. **Implement `move_file` command**
   Move a file or folder to a different parent directory within the same notebook. Distinct from rename — this changes the file's location in the tree, not its name. Return the updated `FileEntry` with the new path and parentPath.

   ```rust
   #[tauri::command]
   async fn move_file(notebook_id: String, old_path: String, new_parent_path: String, state: State<'_, AppState>) -> Result<FileEntry, String>
   ```

10. **Implement notebook CRUD commands**
    Commands for managing notebook metadata: `create_notebook`, `list_notebooks`, `rename_notebook`, `delete_notebook`, `reorder_notebooks`. These read/write `notebooks.json` in the Tauri app data directory.

   For `delete_notebook`, move the entire notebook folder to trash.

11. **Register all commands in `main.rs`**
    Use `tauri::Builder::default().invoke_handler(tauri::generate_handler![...])` to register all commands.

    Files to modify:
    - `apps/desktop/src-tauri/src/main.rs`

12. **Add Rust dependencies to `Cargo.toml`**
    Add: `serde`, `serde_json`, `trash`, `walkdir` (for recursive directory listing), `tempfile` (for atomic writes).

    Files to modify:
    - `apps/desktop/src-tauri/Cargo.toml`

### Testing Approach

- Rust unit tests: Test each command in isolation against a temporary directory (`tempdir` crate)
- Test atomic writes: Verify temp file is created and renamed
- Test trash: Verify file moves to OS trash (manual verification on macOS/Windows)
- Integration: Run `tauri dev`, create/edit/delete files through the UI, verify they appear on the actual filesystem
- Edge cases: Unicode filenames, deeply nested paths, files with special characters, empty files, large files (>1MB), move across folder boundaries

---

## Phase 4: File Watching & Auto-Save

**Goal:** Detect external filesystem changes and auto-save editor content with a debounce.

**Dependencies:** Phase 3 (filesystem commands must work)

### Tasks

1. **Add the `notify` crate for file watching**
   The `notify` crate provides cross-platform filesystem event watching. Use the recommended watcher (FSEvents on macOS, ReadDirectoryChangesW on Windows).

   Add to `Cargo.toml`:
   ```toml
   [dependencies]
   notify = "7"
   ```

   Files to modify:
   - `apps/desktop/src-tauri/Cargo.toml`

2. **Implement `watch_directory` command**
   Start a filesystem watcher on a notebook's directory. Emit events to the frontend via Tauri's event system (`app.emit("fs-change", payload)`). The payload includes the event type (create, modify, delete, rename) and the affected path.

   ```rust
   #[tauri::command]
   async fn watch_directory(notebook_id: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String>
   ```

   Also implement `unwatch_directory` to stop watching when a notebook is closed.

   Files to create:
   - `apps/desktop/src-tauri/src/watcher.rs`

   Files to modify:
   - `apps/desktop/src-tauri/src/main.rs` — Register watcher module and commands

3. **Frontend: Listen for filesystem events**
   In the Tauri adapter, listen for `fs-change` events using `@tauri-apps/api/event`. On receiving an event:
   - File created/deleted → refresh the file tree for that notebook
   - File modified → if the file is currently open in a tab, show a prompt: "This file was modified outside Notebook.md. Reload?"
   - Debounce rapid events (e.g., during a `git pull`) with a 500ms window

   Files to create:
   - `apps/web/src/hooks/useFsWatcher.ts` — Hook that subscribes to Tauri FS events and triggers tree refresh / file reload

   Files to modify:
   - `apps/web/src/stores/tauriNotebookStore.ts` — Add event listener setup/teardown

4. **Implement auto-save with 2-second debounce**
   When the editor content changes, start a 2-second debounce timer. After 2 seconds of no edits, write to disk. If the user edits again before the timer fires, reset it.

   The auto-save logic should live in a new hook or be added to `useNotebookManager`. It only applies when the active storage adapter is the Tauri filesystem adapter (web app with IndexedDB already saves on every keystroke).

   Files to create:
   - `apps/web/src/hooks/useAutoSave.ts` — Debounced save hook with configurable delay

5. **Implement explicit Save (Cmd+S / Ctrl+S)**
   Intercept the keyboard shortcut and trigger an immediate write, bypassing the debounce timer. This uses Tauri's global shortcut or a standard `keydown` event listener.

   Files to modify:
   - `apps/web/src/hooks/useNotebookManager.ts` — Add `saveImmediately()` method
   - `apps/web/src/hooks/useAutoSave.ts` — Expose `flushSave()` to bypass debounce

6. **Add save indicator to status bar**
   Display save state in the editor status bar: "Saved" (green), "Saving..." (yellow/spinner), "Unsaved changes" (orange). The state is derived from the auto-save hook.

   Files to modify:
   - `apps/web/src/components/StatusBar.tsx` (or equivalent) — Add save state indicator
   - `apps/web/src/hooks/useAutoSave.ts` — Expose `saveState: 'saved' | 'saving' | 'unsaved'`

7. **Make auto-save configurable in Settings**
   Add a toggle in the Settings UI: "Auto-save files" (on/off, default: on). When disabled, only explicit Save (Cmd+S) writes to disk. Store the preference in Tauri's app config (e.g., `tauri-plugin-store` or a JSON config file).

   Files to modify:
   - Settings component (add toggle)
   - `apps/web/src/hooks/useAutoSave.ts` — Respect the setting

### Testing Approach

- Rust tests: Test watcher setup/teardown, event emission for file create/modify/delete
- Frontend tests: Test debounce logic in `useAutoSave` (mock timers)
- Integration: Edit a file in VS Code while Notebook.md is open → verify tree refreshes and open file shows reload prompt
- Integration: Edit in Notebook.md → verify file appears on disk after 2s
- Integration: Cmd+S → verify immediate write
- Test rapid edits: Type continuously for 10 seconds → only one write after stopping

---

## Phase 5: Native OS Integration

**Goal:** Full native desktop experience — menus, file associations, deep links, window management.

**Dependencies:** Phase 3 (filesystem commands), Phase 4 (file watching for opened files)

### Tasks

1. **Implement native menu bar**
   Create menus using Tauri v2's menu API in Rust. Map menu items to Tauri events that the frontend handles.

   | Menu | Items |
   |------|-------|
   | **File** | New Notebook, New File, Open Notebook Folder…, Save (⌘S), Close Tab (⌘W), Close Window |
   | **Edit** | Undo, Redo, Cut, Copy, Paste, Select All, Find (⌘F) |
   | **View** | Toggle Sidebar, Toggle Dark Mode, Zoom In (⌘+), Zoom Out (⌘-), Actual Size (⌘0) |
   | **Help** | About Notebook.md, Check for Updates…, Documentation |

   Edit menu items (Undo, Redo, Cut, Copy, Paste, Select All) use Tauri's native role-based menu items so they work with the system clipboard and WebView undo/redo.

   Files to create:
   - `apps/desktop/src-tauri/src/menu.rs` — Menu definition and event handlers

   Files to modify:
   - `apps/desktop/src-tauri/src/main.rs` — Attach menu to window

2. **Implement "Open Notebook Folder" dialog**
   Use Tauri's `dialog` plugin to open a native folder picker. When the user selects a folder, create a local notebook entry pointing to that directory. The notebook's `sourceConfig` stores the absolute path.

   Add to `Cargo.toml` features:
   ```toml
   [dependencies]
   tauri-plugin-dialog = "2"
   ```

   Files to modify:
   - `apps/desktop/src-tauri/src/commands.rs` — Add `open_folder_dialog` command
   - `apps/web/src/stores/tauriNotebookStore.ts` — Call the dialog command from the "+" menu

3. **Register file associations**
   Configure Tauri to register as a handler for `.md`, `.mdx`, `.markdown` files. When a user double-clicks a markdown file, Notebook.md opens it.

   Files to modify:
   - `apps/desktop/src-tauri/tauri.conf.json` — Add file association config under `bundle.fileAssociations`

4. **Handle file open events**
   When a file is opened via file association (or drag-and-drop), Tauri emits an event. The frontend receives the file path and opens it in standalone editing mode (no notebook sidebar — just the editor).

   Files to create:
   - `apps/web/src/components/StandaloneEditor.tsx` — Minimal editor view for files opened outside a notebook context

   Files to modify:
   - `apps/desktop/src-tauri/src/main.rs` — Handle `tauri::RunEvent::Opened` to emit file-open event
   - `apps/web/src/App.tsx` — Route to standalone editor when a file is opened directly

5. **Implement deep link handler (`notebookmd://`)**
   Register the `notebookmd://` custom protocol. Parse incoming URLs and route them:
   - `notebookmd://auth/callback?token=...` → Complete magic link auth
   - `notebookmd://open?notebook=...&file=...` → Open a specific notebook/file

   Add to `Cargo.toml`:
   ```toml
   [dependencies]
   tauri-plugin-deep-link = "2"
   ```

   Files to modify:
   - `apps/desktop/src-tauri/tauri.conf.json` — Add deep link scheme configuration
   - `apps/desktop/src-tauri/src/main.rs` — Register deep link plugin
   - `apps/web/src/hooks/useDeepLink.ts` (create) — Listen for deep link events and route accordingly

6. **Window state persistence**
   Save window size and position on close, restore on next launch. Use `tauri-plugin-window-state`.

   Add to `Cargo.toml`:
   ```toml
   [dependencies]
   tauri-plugin-window-state = "2"
   ```

   Files to modify:
   - `apps/desktop/src-tauri/src/main.rs` — Register the window-state plugin
   - `apps/desktop/src-tauri/tauri.conf.json` — Plugin config

7. **Multiple windows support**
   Support opening multiple windows, each showing a different notebook. Implement the constraint: the same notebook cannot be open in two windows simultaneously — if attempted, focus the existing window.

   Track open notebooks in Tauri app state (a `HashMap<String, WebviewWindow>`). Add an "Open in New Window" action to the notebook context menu.

   Files to modify:
   - `apps/desktop/src-tauri/src/state.rs` — Add window tracking state
   - `apps/desktop/src-tauri/src/commands.rs` — Add `open_notebook_window` command that creates or focuses a window
   - Frontend: Add "Open in New Window" to notebook context menu

8. **Native OS notifications**
   Use Tauri's notification plugin for native notifications: external file changes detected, updates available.

   Add to `Cargo.toml`:
   ```toml
   [dependencies]
   tauri-plugin-notification = "2"
   ```

   Files to modify:
   - `apps/desktop/src-tauri/src/main.rs` — Register notification plugin
   - Frontend: Send notifications via `@tauri-apps/plugin-notification`

### Testing Approach

- Manual: Verify each menu item works and shortcuts fire correctly on macOS and Windows
- Manual: Open a folder via the dialog, confirm notebook appears in sidebar with files listed
- Manual: Double-click a `.md` file in Finder/Explorer → Notebook.md opens in standalone mode
- Manual: Click a `notebookmd://` link → app opens/focuses and handles the URL
- Manual: Close the app, reopen → window restores to previous size/position
- Manual: Open two notebooks in separate windows, attempt to open an already-open notebook → existing window focuses
- Automated: E2E test for menu items via `tauri-driver` (WebDriver)

---

## Phase 6: Authentication & Cloud Integration

**Goal:** Cloud notebooks and authentication work in the desktop app identically to the web app.

**Dependencies:** Phase 1 (Tauri window loads web app), Phase 5 (deep links for auth callbacks)

> **💡 Note:** This phase is likely simpler than estimated. OAuth in WebView2 (Windows) and WebKit (macOS) generally just works — cookies and redirects behave like a real browser. The main real work is the magic link deep link flow and adding Tauri origins to OAuth redirect URI allowlists.

### Tasks

1. **Verify cookie-based auth works in the WebView**
   The system WebView (WebKit on macOS, WebView2 on Windows) supports cookies natively. API calls via `fetch()` should include session cookies automatically. Test login/logout and verify the session persists across app restarts.

   No code changes expected — this should work out of the box since the WebView behaves like a browser.

2. **Configure OAuth redirects for desktop**
   OAuth flows (Microsoft, GitHub, Google) redirect back to the app's origin. In the desktop WebView, the origin is `tauri://localhost` (or the configured dev URL). Ensure the API's OAuth callback URLs accept this origin.

   Files to modify:
   - API OAuth configuration — Add `tauri://localhost` as an allowed redirect URI for each provider
   - `apps/api/` — Update CORS/redirect validation to accept Tauri origins

3. **Implement magic link auth completion via deep link**
   When a user clicks a magic link email, it opens in the default browser (not the Tauri WebView). The magic link URL should include a redirect to `notebookmd://auth/callback?token=...`. The deep link handler (Phase 5, Task 5) receives this and completes authentication.

   Files to modify:
   - `apps/api/` — Magic link emails include a desktop-aware callback URL when the request originates from the desktop app (detect via User-Agent or a query param)
   - `apps/web/src/hooks/useDeepLink.ts` — Handle `auth/callback` route: extract token, call API to validate, set session

4. **Cloud notebooks: verify full functionality**
   Cloud notebooks (GitHub, OneDrive, Google Drive, Cloud) should work identically to the web app since all API calls go through `fetch()` to the production backend. Test each provider:
   - GitHub: list repos, read/write files, branches, PRs
   - OneDrive: list files, read/write
   - Google Drive: list files, read/write
   - Cloud: list files, read/write

   No code changes expected — all cloud logic is in the shared frontend code.

5. **Implement offline detection**
   Detect network status using the browser's `navigator.onLine` API (works in WebView) or Tauri's network plugin. When offline:
   - Local notebooks: fully functional (no change)
   - Cloud notebooks: show "No internet connection" state instead of loading spinner
   - AI features: show "Unavailable offline" state
   - Status bar: show offline indicator

   Files to create:
   - `apps/web/src/hooks/useNetworkStatus.ts` — Hook that tracks online/offline state

   Files to modify:
   - `apps/web/src/hooks/useNotebookManager.ts` — Gracefully handle failed API calls when offline
   - Cloud notebook UI components — Show offline state

6. **"Remember Me" default for desktop**
   Ensure the "Remember Me" option is enabled by default in the desktop app's login flow. Detect desktop context via `window.__TAURI_INTERNALS__` and pre-check the option.

   Files to modify:
   - Login component — Default "Remember Me" to `true` when running in Tauri

### Testing Approach

- Manual: Log in via email/password → verify session cookie persists after restart
- Manual: Log in via OAuth (each provider) → verify redirect completes successfully
- Manual: Send a magic link → click in browser → verify desktop app receives the deep link and logs in
- Manual: Open a GitHub/OneDrive/Google Drive notebook → verify full read/write functionality
- Manual: Disconnect Wi-Fi → verify local notebooks work, cloud notebooks show offline state
- Automated: Mock API responses in Vitest to test offline fallback logic in `useNetworkStatus`

---

## Phase 7: Build, Sign & Distribute

**Goal:** Automated CI/CD pipeline that builds, signs, and distributes the desktop app for macOS and Windows.

**Dependencies:** All previous phases (the app must be feature-complete)

### Tasks

1. **Set up the CI/CD build pipeline**
   Create a GitHub Actions workflow (or Azure DevOps pipeline) that:
   1. Checks out the repo
   2. Installs Node.js dependencies (`npm ci`)
   3. Builds `apps/web` with `VITE_API_URL=https://api.notebookmd.io` so the bundled app calls the production API
   4. Installs Rust toolchain
   5. Builds the Tauri app (`npm -w apps/desktop run tauri build`)
   6. Uploads artifacts

   **Important:** The web frontend resolves `VITE_API_URL` at build time via `import.meta.env`. In dev, it's unset (empty string → relative URLs to local dev server). In production builds, it must be set to the production API origin. This is handled in:
   - CI: `env: VITE_API_URL: https://api.notebookmd.io` on the "Build web app" step
   - Local: `build:desktop` script prefixes the web build with `VITE_API_URL=https://api.notebookmd.io`

   Run on: push to `main` (nightly), tags matching `desktop-v*` (release), and PR builds (test-only, no signing).

   Files to create:
   - `.github/workflows/desktop-build.yml` (or equivalent Azure DevOps pipeline)

2. **macOS code signing and notarization**
   Sign the app with an Apple Developer ID certificate. Notarize with Apple's `notarytool` (required for Gatekeeper to allow the app to run).

   CI secrets needed:
   - `APPLE_CERTIFICATE` — Base64-encoded .p12 certificate
   - `APPLE_CERTIFICATE_PASSWORD` — Certificate password
   - `APPLE_SIGNING_IDENTITY` — Developer ID Application identity
   - `APPLE_ID` — Apple ID for notarization
   - `APPLE_PASSWORD` — App-specific password for notarization
   - `APPLE_TEAM_ID` — Team ID

   Tauri v2 handles signing and notarization automatically when these environment variables are set.

   Files to modify:
   - `apps/desktop/src-tauri/tauri.conf.json` — Configure bundle signing identity
   - CI workflow — Set environment variables from secrets

3. **macOS universal binary**
   Build a universal binary (Apple Silicon + Intel) by specifying both targets: `aarch64-apple-darwin` and `x86_64-apple-darwin`. Tauri's `--target universal-apple-darwin` flag handles this.

   Files to modify:
   - CI workflow — Add `--target universal-apple-darwin` to the build command

4. **macOS `.dmg` packaging**
   Tauri v2 generates a `.dmg` by default on macOS. Configure the DMG appearance (background image, icon layout) in `tauri.conf.json`.

   Files to modify:
   - `apps/desktop/src-tauri/tauri.conf.json` — DMG config under `bundle.macOS`

5. **Windows code signing**
   Sign the Windows executable with a code signing certificate. An EV certificate is recommended to avoid SmartScreen warnings.

   CI secrets needed:
   - `WINDOWS_CERTIFICATE` — Base64-encoded .pfx certificate
   - `WINDOWS_CERTIFICATE_PASSWORD` — Certificate password

   Files to modify:
   - CI workflow — Set `TAURI_SIGNING_PRIVATE_KEY` and related variables

6. **Windows packaging (NSIS + MSI)**
   Tauri v2 supports both NSIS (.exe) and MSI installers. Build both for each architecture (x64, ARM64).

   Files to modify:
   - `apps/desktop/src-tauri/tauri.conf.json` — Configure NSIS and MSI settings under `bundle.windows`

7. **Configure Tauri auto-updater**
   Enable Tauri's built-in updater plugin. The updater checks a JSON manifest hosted on a CDN for new versions. The manifest is signed with a private key to prevent tampering.

   Add to `Cargo.toml`:
   ```toml
   [dependencies]
   tauri-plugin-updater = "2"
   ```

   Updater config in `tauri.conf.json`:
   ```json
   {
     "plugins": {
       "updater": {
         "endpoints": ["https://releases.notebookmd.io/desktop/latest.json"],
         "pubkey": "<PUBLIC_KEY>"
       }
     }
   }
   ```

   Files to create:
   - `apps/desktop/src-tauri/src/updater.rs` — Check for updates on launch, show notification, handle download + restart

   Files to modify:
   - `apps/desktop/src-tauri/Cargo.toml` — Add updater plugin
   - `apps/desktop/src-tauri/tauri.conf.json` — Updater config
   - `apps/desktop/src-tauri/src/main.rs` — Register updater plugin
   - CI workflow — Generate and upload update manifest + signed artifacts

8. **Generate signing keypair for updater**
   Generate a Tauri updater keypair (`tauri signer generate`). Store the private key as a CI secret. The public key goes in `tauri.conf.json`.

9. **Host update manifest and artifacts**
   Set up hosting (Azure Blob Storage, S3, or Cloudflare R2) for:
   - `latest.json` — Update manifest with version, platform URLs, signatures
   - Platform artifacts: `.dmg`, `.exe`, `.msi`, `.tar.gz` (macOS), `.zip` (Windows)

   The CI pipeline uploads new artifacts and updates `latest.json` on each release.

10. **Create download page at `notebookmd.io/download`**
    A public web page that:
    - Detects the user's OS via `navigator.platform` / `navigator.userAgentData`
    - Highlights the appropriate download button (macOS or Windows)
    - Shows both platform options
    - Displays current version and release notes
    - Links to release history

    Files to create:
    - `apps/web/src/pages/DownloadPage.tsx` (or a separate static page, depending on site architecture)

11. **Add "Get the Desktop App" link in web app**
    Add a link/banner in the web app header or settings page directing users to the download page.

    Files to modify:
    - Web app header/settings component

### Testing Approach

- CI: Build pipeline runs on every PR (without signing) to catch build failures
- CI: Release build (with signing) triggered on version tags
- Manual: Download the signed `.dmg` on macOS → verify Gatekeeper allows it → verify notarization
- Manual: Download the signed `.exe` on Windows → verify SmartScreen doesn't block → verify installation
- Manual: Install v1, publish v2 manifest → verify auto-updater detects and installs the update
- Manual: Verify the download page detects OS correctly and links to the right artifacts
- Automated: Smoke test in CI — build the app, launch it headlessly, verify the window opens (via `tauri-driver`)

---

## Summary: File Inventory

### New Files

| File | Phase | Description |
|------|-------|-------------|
| `apps/desktop/package.json` | 1 | Desktop workspace package |
| `apps/desktop/src-tauri/tauri.conf.json` | 1 | Tauri configuration |
| `apps/desktop/src-tauri/Cargo.toml` | 1 | Rust dependencies |
| `apps/desktop/src-tauri/build.rs` | 1 | Tauri build script |
| `apps/desktop/src-tauri/src/main.rs` | 1 | Tauri entry point |
| `apps/desktop/src-tauri/src/commands.rs` | 3 | Tauri command registrations |
| `apps/desktop/src-tauri/src/fs.rs` | 3 | Filesystem operations |
| `apps/desktop/src-tauri/src/state.rs` | 3 | App state management |
| `apps/desktop/src-tauri/src/menu.rs` | 5 | Native menu bar |
| `apps/desktop/src-tauri/src/watcher.rs` | 4 | File system watcher |
| `apps/desktop/src-tauri/src/updater.rs` | 7 | Auto-update logic |
| `apps/web/src/stores/StorageAdapter.ts` | 2 | Storage adapter interface |
| `apps/web/src/stores/tauriNotebookStore.ts` | 2 | Tauri filesystem adapter |
| `apps/web/src/stores/storageAdapterFactory.ts` | 2 | Platform detection + adapter factory |
| `apps/web/src/hooks/useFsWatcher.ts` | 4 | FS event listener hook |
| `apps/web/src/hooks/useAutoSave.ts` | 4 | Debounced auto-save hook |
| `apps/web/src/hooks/useDeepLink.ts` | 5 | Deep link handler hook |
| `apps/web/src/hooks/useNetworkStatus.ts` | 6 | Online/offline detection hook |
| `apps/web/src/components/StandaloneEditor.tsx` | 5 | Standalone file editor view |
| `.github/workflows/desktop-build.yml` | 7 | CI/CD build pipeline |

### Modified Files

| File | Phase | Description |
|------|-------|-------------|
| `package.json` (root) | 1 | Add desktop scripts |
| `apps/web/src/stores/localNotebookStore.ts` | 2 | Refactor into IndexedDB adapter class |
| `apps/web/src/hooks/useNotebookManager.ts` | 2, 4, 6 | Accept abstract adapter, add save logic, offline handling |
| `apps/web/src/App.tsx` | 2, 5 | Storage context provider, standalone editor route |
| `apps/web/vite-env.d.ts` | 2 | Tauri type declarations |
| `apps/desktop/src-tauri/Cargo.toml` | 3, 4, 5, 7 | Add crate dependencies per phase |
| `apps/desktop/src-tauri/src/main.rs` | 3, 4, 5, 7 | Register commands, plugins, menus |
| `apps/desktop/src-tauri/tauri.conf.json` | 5, 7 | File associations, deep links, updater, bundle config |

---

## Implementation Order & Timeline Estimate

| Phase | Estimated Effort | Can Parallelize With |
|-------|-----------------|---------------------|
| Phase 1: Scaffolding | 1–2 days | — |
| Phase 2: Storage Adapter | 3–4 days | — |
| Phase 3: Tauri FS Commands | 3–4 days | — |
| Phase 4: File Watching & Auto-Save | 2–3 days | Phase 5 (partially) |
| Phase 5: Native OS Integration | 4–5 days | Phase 4 (partially) |
| Phase 6: Auth & Cloud | 2–3 days | Phase 5 |
| Phase 7: Build & Distribute | 3–4 days | Phase 6 |
| **Total** | **~18–25 days** | |

Phases 4–6 can be partially parallelized since they modify different parts of the codebase. Phase 7 can begin CI/CD setup as soon as Phase 1 is complete (build pipeline without signing), with signing and distribution added after all features land.

---

## Phase 8: Desktop UX Polish (Post-Scaffold)

**Goal:** Fix the four UX issues discovered during initial desktop testing. The scaffolded app loads the web frontend but doesn't yet adapt the experience for a native desktop context.

**Dependencies:** Phases 1–7 (scaffolding complete)

### Issues & Proposed Changes

#### Issue 1: Homepage shows instead of a streamlined login/signup

**Problem:** When the desktop app launches, unauthenticated users see the full marketing homepage (WelcomeScreen) with `<MarketingNav>` header and `<MarketingFooter>`, including marketing links (Features, About, Contact) and demo-mode CTAs. This is the web conversion funnel — it doesn't make sense in a native app the user already downloaded.

**Proposed fix:** Detect the Tauri environment in `WelcomeScreen` and render a simplified "desktop login" variant:
- Strip `<MarketingNav>` and `<MarketingFooter>` — no top nav bar, no footer
- Remove the "Try it free — no account needed" demo-mode CTA (desktop users should create a local notebook or sign in)
- Keep: logo, sign-in form, sign-up form, OAuth buttons
- Add: a "Skip — use local notebooks only" button that bypasses auth entirely and drops the user into the editor with the local storage adapter. Desktop doesn't require an account for local-only usage.

**Files to modify:**
- `apps/web/src/components/welcome/WelcomeScreen.tsx` — Conditionally strip marketing chrome when `isTauriEnvironment()` is true; add "Use offline" skip button
- `apps/web/src/App.tsx` — When in Tauri and user clicks "skip", set a `desktopOfflineMode` flag (persisted in localStorage) that bypasses the auth gate for local-only notebooks

**Alternative considered:** A completely separate `DesktopWelcome.tsx` component. Rejected because the auth forms, OAuth flow, and 2FA logic would be duplicated. Better to branch within the existing component.

---

#### Issue 2: Cookie consent banner appears in the desktop app

**Problem:** The `CookieConsentBanner` pops up on first launch. Cookie consent is a GDPR/ePrivacy requirement for *websites* that set tracking cookies. A native desktop app doesn't need this — the user already installed the software, and we control the execution context.

**Proposed fix:** Suppress the cookie banner when running in Tauri:
- In `useCookieConsent.ts`, detect Tauri and auto-accept essential-only consent (or all consent, depending on preference), never showing the banner.
- Analytics tracking in the desktop app can be handled separately via opt-in in Settings (future), not via a cookie banner.

**Files to modify:**
- `apps/web/src/hooks/useCookieConsent.ts` — Early return in `useEffect`: if `isTauriEnvironment()`, auto-set consent and skip showing the banner

---

#### Issue 3: "Local (Browser)" shown instead of "Local (Desktop)"

**Problem:** The notebook source picker in `AddNotebookModal` lists "Local (Browser)" as the local option. In the desktop app, this should say "Local (Desktop)" or just "Local" since the files are stored on the filesystem, not in IndexedDB. Additionally, the desktop app should add an "Open Folder…" option that lets users point to an existing directory.

**Proposed fix:**
1. In `SourceTypes.tsx`, dynamically set the label for the `local` source type based on the runtime environment.
2. Add a new `local-folder` source type (or an "Open Folder…" button in the source picker) that is only visible in Tauri. When clicked, it invokes Tauri's native folder picker dialog, then calls `open_folder_as_notebook` (already implemented in Phase 5).
3. Update `AddNotebookModal` source picker to show the folder option in desktop mode.

**Files to modify:**
- `apps/web/src/components/notebook/SourceTypes.tsx` — Change `local.label` to `'Local (Desktop)'` when in Tauri; add `'local-folder'` source type visible only in Tauri
- `apps/web/src/components/notebook/AddNotebookModal.tsx` — Handle `local-folder` selection: invoke Tauri dialog, skip name step (use folder name), call `open_folder_as_notebook`

---

#### Issue 4: Native menu items are non-functional

**Problem:** The native menu bar (File → New Notebook, Save, etc.) was scaffolded in Phase 5, but the frontend doesn't yet handle the `menu-action` events. The `useNativeMenu` hook was created but never wired into `App.tsx`.

**Proposed fix:** Wire `useNativeMenu` into the main `App.tsx` component and dispatch each action to the appropriate handler:

| Menu Action | Handler |
|------------|---------|
| `new_notebook` | Open the AddNotebookModal |
| `new_file` | Call `nb.createFile()` in the current notebook |
| `open_folder` | Invoke Tauri folder dialog → `open_folder_as_notebook` |
| `save` | Call `flushSave()` from the auto-save hook |
| `close_tab` | Close the active editor tab |
| `find` | Focus the editor's search/find UI |
| `toggle_sidebar` | Toggle sidebar visibility state |
| `toggle_dark` | Toggle dark mode |
| `about` | Show an about dialog (version, links) |
| `check_updates` | Invoke Tauri updater check (stub for now) |
| `docs` | Open docs URL in default browser |

**Files to modify:**
- `apps/web/src/App.tsx` — Import and call `useNativeMenu` with a handler that dispatches to existing actions (nb.createFile, sidebar toggle, etc.)
- `apps/web/src/hooks/useNativeMenu.ts` — Already implemented, no changes needed

---

### Testing Approach

- Manual: Launch desktop app → verify clean login screen (no marketing nav/footer, no demo CTA, "use offline" button works)
- Manual: Launch desktop app → verify no cookie banner appears
- Manual: Click "+" to add notebook → verify "Local (Desktop)" label and "Open Folder…" option
- Manual: File → New Notebook → verify AddNotebookModal opens
- Manual: File → Save → verify flush save fires (check console or save indicator)
- Manual: View → Toggle Sidebar → verify sidebar hides/shows
- Manual: View → Toggle Dark Mode → verify dark mode toggles
- Automated: Update existing web tests to verify `isTauriEnvironment()` conditional branches

### Implementation Status

| Issue | Status | Commit |
|-------|--------|--------|
| Icon transparency (white background) | ✅ Done | Regenerated all icons with white→transparent conversion |
| Cookie banner in desktop | ✅ Done | `useCookieConsent.ts` auto-accepts in Tauri |
| "Local (Browser)" label | ✅ Done | Dynamic label + "Open Folder…" desktop-only source type |
| Menu actions non-functional | ✅ Done | Added `capabilities/default.json`; menu events now reach frontend |
| Open Folder flow broken | ✅ Done | Menu action bypasses modal; modal uses `onFolderOpened` + `reloadNotebooks` |
| Double-create on folder open | ✅ Done | Rust creates notebook, frontend just refreshes — no duplicate `onAdd` |
| Silent error swallowing | ✅ Done | `useNativeMenu` logs errors; modal shows errors on source step |
| WelcomeScreen simplification | ⏳ Pending | Strip MarketingNav/Footer + add "Use offline" button |
| Version bump script | ✅ Done | `scripts/bump-version.sh` updates all 5 version files |
| Production API URL in builds | ✅ Done | `VITE_API_URL` injected in CI workflow + `build:desktop` script |

#### Root-Cause Analysis (from Codex review)

The two persistent failures (menu actions + open folder) shared a root cause: **missing Tauri v2 capabilities configuration**. Tauri v2 uses a permission-based security model — without explicit capability grants in `capabilities/default.json`, JS-side APIs (`listen`, `dialog.open`) were silently blocked at runtime. Additional issues:

- **Menu open_folder routing**: `initialSource='local-folder'` sent the modal to a `ComingSoon` fallback instead of triggering the folder dialog
- **Double-create**: Both Rust and React created a notebook on folder open, producing duplicates or inconsistent state
- **Error invisibility**: Silent catches in `useNativeMenu` and error display limited to `NameStep` hid all failures

Full review: `docs/reviews/desktop-review-codex.md`

---

## Progress Summary

| Phase | Status | Key Commits |
|-------|--------|-------------|
| Phase 1: Scaffolding | ✅ Complete | Tauri v2 project, builds .app/.dmg |
| Phase 2: Storage Adapter | ✅ Complete | StorageAdapter interface, IndexedDB + Tauri adapters, factory (8 tests) |
| Phase 3: FS Commands | ✅ Complete | 18 Rust commands, notebook/file CRUD, atomic writes, OS trash, standalone file ops |
| Phase 4: File Watching | ✅ Complete | notify crate watcher, useFsWatcher, useAutoSave (7 tests) |
| Phase 5: Native OS | ✅ Complete | Menu bar, dialog/window-state plugins, file associations, file-open events |
| Phase 6: Auth & Cloud | ⏸️ Deferred | See "Deferred Features" below |
| Phase 7: Build & Distribute | ✅ Complete | Signed + notarized builds via `scripts/build-desktop.sh`; GitHub Releases |
| Phase 8: UX Polish | ✅ Complete | Icons, cookie, labels, menus, folder-open, auth bypass, desktop empty state |

**Test totals:** 232 web tests + 4 Rust tests — all passing
**Current version:** 0.1.2
**Branch:** `feature/desktop` → merged to `main`

---

## Releases

| Version | Tag | Date | Highlights |
|---------|-----|------|------------|
| **0.1.0** | `desktop-v0.1.0` | 2026-03-26 | Initial V1 release — zero-auth local editor, signed + notarized |
| **0.1.1** | `desktop-v0.1.1` | 2026-03-27 | Untitled file support (Cmd+N), Save As flow, bug fixes |
| **0.1.2** | `desktop-v0.1.2` | 2026-03-27 | Fix Finder duplicate tabs, app name/icon cleanup |

All releases published as GitHub Releases with signed `.dmg` artifacts (macOS Apple Silicon).

---

## Desktop V1 Simplification (March 2026)

The desktop app was simplified to focus on its core value: a zero-auth local markdown editor. Open the app → pick a folder or file → start editing.

### What changed

1. **Auth gate bypassed** — Desktop skips WelcomeScreen entirely, goes straight to the editor
2. **Cloud sources hidden** — Source picker shows only "Local (Desktop)" and "Open Folder…"
3. **Account UI hidden** — No sign-in, avatar, or account menu in TitleBar; just a Settings button
4. **Desktop empty state** — First launch shows "Open Folder" / "New Notebook" CTAs in the notebook pane
5. **Zero API calls** — Desktop init uses TauriFilesystemAdapter directly; no `syncNotebooksFromServer`, no permission polling
6. **Deferred plugins removed** — `tauri-plugin-deep-link` and `tauri-plugin-notification` removed from Cargo.toml, main.rs, and capabilities
7. **Unused hooks unwired** — `useDeepLink` and `useNetworkStatus` were never imported in App.tsx (confirmed clean)
8. **Standalone file open** — Cmd+O opens any .md file directly in the editor (no notebook required), with auto-save
9. **File associations** — `.md` files double-clicked in Finder emit `file-open` events to the frontend
10. **Large directory guard** — Blocks home dir, root, /Users etc. from being opened as notebooks
11. **File type filter** — Notebook tree only shows .md/.mdx/.markdown/.txt and image files
12. **External folder safety** — "Close Folder" (not "Delete") for external folders; no filesystem deletion
13. **Duplicate prevention** — `open_folder_as_notebook` returns existing notebook if path already registered
14. **Signed builds** — `scripts/build-desktop.sh` produces signed + notarized .app/.dmg via Developer ID certificate
15. **Untitled files** — Cmd+N creates an untitled tab with zero friction; Shift+Cmd+N creates a new notebook
16. **Save As flow** — Cmd+S on untitled files opens native Save As dialog; tab converts to standalone with auto-save
17. **App identity** — productName changed to "Notebook MD" (dot in "Notebook.md" caused macOS to show ".app" suffix)
18. **Production icon** — Clean icon without DEV badge; solid blue fills full canvas for proper macOS rounding

### Keyboard Shortcuts (Desktop)

| Shortcut | Action |
|----------|--------|
| **Cmd+N** | New untitled file |
| **Shift+Cmd+N** | New notebook |
| **Cmd+O** | Open file from disk |
| **Shift+Cmd+O** | Open folder as notebook |
| **Cmd+S** | Save (or Save As for untitled files) |
| **Cmd+W** | Close tab |
| **Cmd+B** | Toggle sidebar |
| **Shift+Cmd+D** | Toggle dark mode |
| **Cmd+F** | Find |

### Bug Fixes (v0.1.1–v0.1.2)

| Bug | Fix | Version |
|-----|-----|---------|
| Folder notebooks show device icon | Set sourceType to `local-folder` in Rust | 0.1.1 |
| Opening same folder creates duplicates | Dedup check in `open_folder_as_notebook` | 0.1.1 |
| "Delete" shown for external folders | "Close Folder" label + skip trash for local-folder | 0.1.1 |
| Files don't open from notebook tree | Route through TauriFilesystemAdapter in handleOpenFile/saveTab | 0.1.1 |
| Non-markdown files in tree | `is_supported_file` filter in list_notebook_files/list_children | 0.1.1 |
| Cmd+N creates duplicate tabs | 300ms debounce guard (Tauri accelerator + WebView keydown) | 0.1.1 |
| Finder double-click creates duplicate tabs | Atomic dedup via `setTabs` callback + stable event listener ref | 0.1.2 |
| App shows as "Notebook.md.app" in Finder | Changed productName to "Notebook MD" | 0.1.2 |
| Icon has DEV badge + grey outline | Regenerated from clean production source with full-bleed blue | 0.1.2 |

### Files modified

| File | Change |
|------|--------|
| `apps/web/src/App.tsx` | Auth gate, isDesktop, standalone file open, file-open listener (ref-based), untitled tab via menu, large dir guard |
| `apps/web/src/hooks/useNotebookManager.ts` | Tauri adapter in init/save/open, standalone tabs (atomic dedup), untitled tabs, Save As flow, local-folder type, auto-save skip for untitled |
| `apps/web/src/hooks/useNativeMenu.ts` | Added `open_file` MenuAction |
| `apps/web/src/components/layout/TitleBar.tsx` | `isDesktopMode` prop; Settings button replaces account dropdown |
| `apps/web/src/components/layout/NotebookPane.tsx` | Desktop empty state; `onOpenFolder` prop |
| `apps/web/src/components/notebook/SourceTypes.tsx` | `webOnly` flag on cloud sources; `local-folder` type |
| `apps/web/src/components/notebook/AddNotebookModal.tsx` | `isDesktopMode` prop; filters `webOnly` sources |
| `apps/web/src/components/notebook/NotebookTree.tsx` | "Close Folder" for local-folder notebooks |
| `apps/web/src/stores/localNotebookStore.ts` | Added `local-folder` to sourceType union |
| `apps/desktop/src-tauri/src/main.rs` | Removed deferred plugins, file-open event handler, Emitter import, `let app = .build()` pattern |
| `apps/desktop/src-tauri/src/commands.rs` | `local-folder` sourceType, dedup check, standalone file read/write, file type filter, external folder safety |
| `apps/desktop/src-tauri/src/state.rs` | `StandaloneFile` struct |
| `apps/desktop/src-tauri/src/menu.rs` | New File (Cmd+N), New Notebook (Shift+Cmd+N), Open File (Cmd+O), Open Folder (Shift+Cmd+O) |
| `apps/desktop/src-tauri/Cargo.toml` | Removed deferred plugin deps |
| `apps/desktop/src-tauri/tauri.conf.json` | productName "Notebook MD", removed deep-link config |
| `apps/desktop/src-tauri/capabilities/default.json` | Removed deferred permissions |
| `apps/desktop/src-tauri/icons/*` | Regenerated from clean production source |
| `apps/desktop/app-icon.png` | Full-bleed production icon (1024×1024) |
| `scripts/build-desktop.sh` | Signed + notarized build script |
| `docs/plans/desktop-plan.md` | This document |

---

## Build & Distribution

### Local Development
```bash
./desktop.sh          # Starts Docker + API + Web + Tauri (hot-reload)
```

### Production Build (signed + notarized)
```bash
./scripts/build-desktop.sh                # Full build with notarization
./scripts/build-desktop.sh --skip-notarize  # Signed only (faster)
```

**Prerequisites:**
- Apple Developer ID certificate in Keychain (auto-imported from `~/certs/apple-developer/`)
- Rust toolchain, Node.js, npm dependencies installed

**Output:**
- `apps/desktop/src-tauri/target/release/bundle/macos/Notebook MD.app` — signed + notarized
- `apps/desktop/src-tauri/target/release/bundle/dmg/Notebook MD_<version>_aarch64.dmg` — signed DMG

### Releasing
```bash
# 1. Bump version in tauri.conf.json, package.json, Cargo.toml
# 2. Commit and push
# 3. Build
./scripts/build-desktop.sh
# 4. Tag and push
git tag desktop-v<version> -m "Desktop v<version> — description"
git push origin desktop-v<version>
# 5. Create GitHub Release (switch to svanvliet account)
gh auth switch --user svanvliet
gh release create desktop-v<version> "apps/desktop/src-tauri/target/release/bundle/dmg/Notebook MD_<version>_aarch64.dmg" --title "Notebook MD v<version>" --notes "..." --latest
gh auth switch --user svanvliet_green
```

---

## Deferred Features (V2+)

These features are partially or fully scaffolded in the codebase but not wired into the desktop V1 flow. The code remains in the repo for future use.

| Feature | Status | Rationale |
|---------|--------|-----------|
| **Authentication** (OAuth, magic links, 2FA) | Scaffolded (useAuth, WelcomeScreen) | Not needed for local-only editing; adds startup friction |
| **Cloud notebooks** (GitHub, OneDrive, Google Drive) | Scaffolded (SourceTypes, cloud adapters) | Requires auth + API; not core desktop value prop |
| **Deep links** (`notebookmd://`) | Plugin removed; useDeepLink.ts retained | Only needed for magic link auth callbacks |
| **Auto-updater** (Tauri updater plugin) | Not implemented | Adds CI/CD complexity; manual updates fine for V1 |
| **Multiple windows** | Not implemented | Nice-to-have; adds state management complexity |
| **Native notifications** | Plugin removed | Only needed for file-watch alerts + update prompts |
| **Download page** (`/download` route) | Not implemented | No distribution channel yet |
| **IndexedDB → filesystem migration** | Not implemented | No web users to migrate from yet |
| **AI features in desktop** | Scaffolded (AI hooks) | Requires auth + API key management |
| **Windows build** | Not built | Need Windows CI runner + code signing certificate |
| **Intel Mac (x86_64)** | Not built | Need `--target universal-apple-darwin` in build script |
