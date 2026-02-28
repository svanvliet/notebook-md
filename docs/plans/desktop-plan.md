# Notebook.md — Desktop App Implementation Plan

**Status:** Draft
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

   Store notebook metadata (id, name, sourceType, sourceConfig, sortOrder, timestamps) in a `notebooks.json` file in the root directory. This is the Tauri equivalent of the IndexedDB notebooks store.

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

9. **Implement notebook CRUD commands**
   Commands for managing notebook metadata: `create_notebook`, `list_notebooks`, `rename_notebook`, `delete_notebook`, `reorder_notebooks`. These read/write `notebooks.json` in the root directory.

   For `delete_notebook`, move the entire notebook folder to trash.

10. **Register all commands in `main.rs`**
    Use `tauri::Builder::default().invoke_handler(tauri::generate_handler![...])` to register all commands.

    Files to modify:
    - `apps/desktop/src-tauri/src/main.rs`

11. **Add Rust dependencies to `Cargo.toml`**
    Add: `serde`, `serde_json`, `trash`, `walkdir` (for recursive directory listing), `tempfile` (for atomic writes).

    Files to modify:
    - `apps/desktop/src-tauri/Cargo.toml`

### Testing Approach

- Rust unit tests: Test each command in isolation against a temporary directory (`tempdir` crate)
- Test atomic writes: Verify temp file is created and renamed
- Test trash: Verify file moves to OS trash (manual verification on macOS/Windows)
- Integration: Run `tauri dev`, create/edit/delete files through the UI, verify they appear on the actual filesystem
- Edge cases: Unicode filenames, deeply nested paths, files with special characters, empty files, large files (>1MB)

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
   3. Builds `apps/web` (`npm -w apps/web run build`)
   4. Installs Rust toolchain
   5. Builds the Tauri app (`npm -w apps/desktop run tauri build`)
   6. Uploads artifacts

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
