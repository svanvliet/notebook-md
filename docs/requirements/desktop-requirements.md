# Notebook.md — Desktop App Requirements

**Status:** Draft
**Target platforms:** macOS (Apple Silicon + Intel), Windows (x64 + ARM64)
**Framework:** Tauri v2 (Rust backend, system WebView, React frontend)

---

## 1. Overview

Notebook.md Desktop is a native desktop application that wraps the existing React web app using Tauri v2. It provides the full Notebook.md editing experience with native OS integration, offline filesystem access, and a small install footprint (~5–10 MB vs. ~150 MB for Electron).

### 1.1 Goals

- **Same experience as web** — identical editor, toolbar, slash commands, AI generation, all features
- **Native file system storage** — local notebooks stored on disk instead of IndexedDB
- **Offline-capable** — local notebooks work fully offline; cloud notebooks degrade gracefully
- **Small footprint** — leverages system WebView (WebKit on macOS, WebView2 on Windows)
- **Auto-updates** — built-in update mechanism for new versions
- **Code reuse** — shares the React codebase from `apps/web` with minimal desktop-specific code

### 1.2 Non-Goals (V1)

- Mobile apps (iOS/Android via Tauri Mobile — future phase)
- Full offline mode for cloud notebooks (GitHub, OneDrive, Google Drive)
- System tray / menu bar persistence (standard window behavior — close = quit)
- Mac App Store / Microsoft Store distribution (direct download only)
- Sync between desktop local notebooks and web IndexedDB notebooks

---

## 2. Architecture

### 2.1 Project Structure

```
apps/
  desktop/
    src-tauri/
      src/
        main.rs          # Tauri entry point
        commands.rs      # Rust commands exposed to frontend
        fs.rs            # File system operations
        menu.rs          # Native menu bar
        updater.rs       # Auto-update logic
      tauri.conf.json    # Tauri configuration
      Cargo.toml         # Rust dependencies
    index.html           # Points to web app build
```

The desktop app consumes the `apps/web` build output. During development, it proxies to the Vite dev server. For production builds, it bundles the compiled web assets.

### 2.2 Frontend–Backend Communication

| Layer | Web App | Desktop App |
|-------|---------|-------------|
| **API calls** | `fetch()` → `api.notebookmd.io` | Same — `fetch()` → production API |
| **Local storage** | IndexedDB (`idb` library) | Tauri FS commands → local filesystem |
| **Auth** | Cookie-based sessions | Same cookies via system WebView |
| **Feature detection** | `window.__TAURI__` absent | `window.__TAURI__` present |

The frontend detects it's running inside Tauri via `window.__TAURI__` and conditionally uses native filesystem APIs for local notebooks instead of IndexedDB.

### 2.3 Storage Adapter Pattern

```
┌──────────────────────────────┐
│     useNotebookManager()     │  ← shared hook
├──────────────────────────────┤
│  StorageAdapter interface    │
├──────────┬───────────────────┤
│ IndexedDB│  Tauri FS Adapter │  ← platform-specific
│ (web)    │  (desktop)        │
└──────────┴───────────────────┘
```

The existing `localNotebookStore.ts` (IndexedDB) becomes one implementation of a `StorageAdapter` interface. A new `tauriNotebookStore.ts` provides native filesystem operations via Tauri commands.

---

## 3. Local Notebook Storage (Filesystem)

### 3.1 Default Location

| Platform | Default Path |
|----------|-------------|
| macOS | `~/Documents/Notebook.md/` |
| Windows | `%USERPROFILE%\Documents\Notebook.md\` |

The default location is configurable in Settings. Users can also choose any folder on their system.

### 3.2 Folder Structure

```
Notebook.md/
  My Notebook/
    README.md
    notes/
      meeting-notes.md
      ideas.md
    assets/
      screenshot.png
  Work Notes/
    project-plan.md
```

Each notebook is a top-level folder. Files and subfolders inside mirror the notebook tree exactly. This is a plain, human-readable folder structure — no hidden databases or proprietary formats.

### 3.3 File Operations

All file operations go through Tauri Rust commands:

| Operation | Tauri Command |
|-----------|--------------|
| List files | `list_notebook_files` → recursive directory listing |
| Read file | `read_file` → UTF-8 text content |
| Write file | `write_file` → atomic write (write to temp + rename) |
| Create file/folder | `create_file` / `create_folder` |
| Delete file/folder | `delete_file` / `delete_folder` (move to OS trash) |
| Rename/move | `rename_file` |
| Watch for changes | `watch_directory` → FS event stream for external changes |

### 3.4 File Watching

When a notebook folder is open, the app watches for external filesystem changes (e.g., user edits a file in VS Code, Finder renames a file). On change:
- File tree refreshes automatically
- If the currently open file was modified externally, show a notification: "This file was modified outside Notebook.md. Reload?"
- Conflict resolution: external changes take precedence (the user explicitly edited outside the app)

---

## 4. Authentication & Cloud Notebooks

### 4.1 Authentication

The desktop app authenticates the same way as the web app — via the system WebView which supports cookies and OAuth redirects. The session cookie is stored by the WebView and sent with all API requests.

- **"Remember Me"** is enabled by default on desktop (per requirements.md §2.4)
- OAuth flows (Microsoft, GitHub, Google) open in the same WebView window
- Magic link emails open in the default browser; the app registers a deep link handler (`notebookmd://`) to complete authentication

### 4.2 Cloud Notebooks

Cloud notebooks (GitHub, OneDrive, Google Drive, Cloud) work identically to the web app — all API calls go through the Notebook.md backend. No local caching or offline support for cloud notebooks in V1.

### 4.3 Offline Behavior

| Notebook Type | Offline | Online |
|---------------|---------|--------|
| Local (filesystem) | ✅ Full read/write | ✅ Full read/write |
| Cloud / GitHub / OneDrive / Google Drive | ❌ Unavailable (show message) | ✅ Full read/write |
| AI generation | ❌ Unavailable | ✅ Available |

When offline, cloud notebooks show a "No internet connection" state. Local notebooks are fully functional.

---

## 5. Native OS Integration

### 5.1 Native Menu Bar

| Menu | Items |
|------|-------|
| **File** | New Notebook, New File, Open Notebook Folder, Save (⌘S / Ctrl+S), Close Tab, Close Window |
| **Edit** | Undo, Redo, Cut, Copy, Paste, Select All, Find (⌘F / Ctrl+F) |
| **View** | Toggle Sidebar, Toggle Dark Mode, Zoom In/Out, Actual Size |
| **Help** | About Notebook.md, Check for Updates, Open Documentation |

### 5.2 Window Management

- Standard native window chrome (title bar, traffic lights on macOS, min/max/close on Windows)
- Window size and position remembered between sessions
- Multiple windows supported (each can show a different notebook)

### 5.3 File Associations

- Register as a handler for `.md`, `.mdx`, `.markdown` files
- Double-clicking a markdown file in Finder/Explorer opens it in Notebook.md
- "Open with" context menu integration

### 5.4 Deep Links

- Custom protocol: `notebookmd://`
- Used for: magic link auth completion, opening specific notebooks/files from external sources
- Format: `notebookmd://open?notebook=My%20Notebook&file=notes/ideas.md`

### 5.5 Notifications

- Native OS notifications for:
  - External file changes detected
  - Auto-update available
  - Share link copied (if applicable)

---

## 6. Auto-Updates

### 6.1 Update Mechanism

Tauri v2's built-in updater with the following flow:

1. On launch (and periodically), check for updates from a hosted update manifest
2. If an update is available, show a non-intrusive notification: "A new version of Notebook.md is available"
3. User clicks "Update" → download and install in background
4. Prompt to restart: "Restart now to apply the update?"
5. On macOS: update via `.dmg` replacement. On Windows: update via `.msi` / NSIS installer

### 6.2 Update Manifest Hosting

- Static JSON file hosted on a CDN or Azure Blob Storage
- Updated by CI/CD pipeline on each release
- Signed with a private key to prevent tampering

---

## 7. Build & Distribution

### 7.1 Build Pipeline

```
1. Build apps/web (Vite) → dist/
2. Build apps/desktop/src-tauri (Cargo) → bundles web dist + Rust binary
3. Sign the binary (Apple Developer ID / Windows code signing)
4. Package: .dmg (macOS), .msi + .exe (Windows)
5. Upload to distribution channel
```

### 7.2 Distribution

| Channel | macOS | Windows |
|---------|-------|---------|
| **Primary** | Direct download from notebookmd.io (.dmg) | Direct download from notebookmd.io (.exe + .msi) |
| **Auto-update** | Tauri updater | Tauri updater |

### 7.3 Code Signing

- **macOS:** Apple Developer ID certificate; notarized via `notarytool` (required for Gatekeeper). Developer account already available.
- **Windows:** Code signing certificate (EV certificate recommended to avoid SmartScreen warnings)
- CI/CD handles signing automatically during release builds

### 7.4 Target Architectures

| Platform | Architectures | Installer Formats |
|----------|--------------|-------------------|
| macOS | Universal binary (Apple Silicon + Intel) | `.dmg` |
| Windows | x64, ARM64 | `.exe` (NSIS) + `.msi` |

---

## 8. Development Workflow

### 8.1 Local Development

```bash
# Terminal 1: Start the web dev server
npm -w apps/web run dev

# Terminal 2: Start Tauri in dev mode (opens native window pointing to Vite dev server)
npm -w apps/desktop run tauri dev
```

Tauri dev mode hot-reloads the frontend via Vite and recompiles the Rust backend on changes.

### 8.2 Testing

- **Frontend tests:** Same Vitest suite as web (shared codebase)
- **Integration tests:** Tauri-specific tests for FS commands, menu actions, deep links
- **E2E tests:** WebDriver-based tests via `tauri-driver` (uses WebDriver protocol)
- **Manual testing:** macOS and Windows CI runners build and smoke-test on each PR

---

## 9. Migration & Compatibility

### 9.1 IndexedDB → Filesystem Migration

When a user installs the desktop app and was previously using the web app with local notebooks (IndexedDB), they may want to migrate:

- Desktop app detects if IndexedDB has local notebooks (via the web storage layer)
- Offers a one-time migration: "Export your browser notebooks to your Documents folder?"
- Exports each notebook as a folder with all files preserved
- After successful migration, the web IndexedDB data remains intact (user can still use web)

### 9.2 Web ↔ Desktop Interop

- Cloud notebooks are fully interoperable — same account, same data
- Local notebooks are device-specific (filesystem on desktop, IndexedDB on web) — no sync between them
- Settings (theme, font, margins) sync via the user's account (stored server-side)

---

## 10. Decisions (Resolved)

| # | Question | Decision |
|---|----------|----------|
| 1 | Monetization | Free — same monetization strategy as web (future state) |
| 2 | Windows installer | Both NSIS (.exe) and MSI |
| 3 | Mac App Store | Direct download only for V1; signed + notarized with Apple Developer account |
| 4 | Multiple windows | Yes — support multiple windows (see §10.1) |
| 5 | System tray | No — standard window behavior (close = quit) |
| 6 | File associations | Open as standalone file outside any notebook |
| 7 | V1 scope | Full native features: menu bar, file associations, file watching, folder picker for local notebooks |
| 8 | Auto-save | Debounced auto-save (2s) + explicit Save (⌘S / Ctrl+S) |

### 10.1 Multiple Windows

Tauri v2 natively supports multiple windows via `WebviewWindow::new()`. Each window runs its own React app instance with independent state. Key rules:
- Each window shows a different notebook — the same notebook cannot be opened in two windows simultaneously
- If a user tries to open an already-open notebook in a new window, focus the existing window instead
- "Open in New Window" action in notebook context menu

This keeps implementation simple and avoids file-conflict issues. Included in V1.

---

## 11. Additional V1 Features (from decisions)

### 11.1 Local Notebook from Folder Picker

The "+" menu in the notebook tree includes an "Open Local Folder" option that:
1. Opens a native folder picker dialog (via Tauri's `dialog` plugin)
2. User selects any folder on their filesystem
3. App creates a local notebook pointing to that folder
4. All `.md` files and subfolders are shown in the notebook tree
5. Changes are read/written directly to the selected folder

This is in addition to creating new notebooks in the default `~/Documents/Notebook.md/` location.

**No limit** on the number of local folder-based notebooks — local notebooks are free and unlimited (cloud notebooks retain their free-tier limits).

### 11.2 Save Behavior

- **Auto-save:** Enabled by default with a 2-second debounce after the last edit. Writes to the filesystem after the debounce period.
- **Explicit save:** ⌘S (macOS) / Ctrl+S (Windows) triggers an immediate write, bypassing the debounce.
- **Save indicator:** Status bar shows save state — "Saved", "Saving...", "Unsaved changes"
- **Configurable:** Auto-save can be disabled in Settings, making explicit save the only write trigger.

### 11.3 Standalone File Editing

When a `.md` file is opened via file association (double-click in Finder/Explorer) or drag-and-drop onto the app:
- Opens in a new window with no notebook sidebar
- Full editor experience (toolbar, slash commands, AI if authenticated)
- Save writes back to the original file location
- No notebook metadata — just a direct file editor

### 11.4 Download Page

A public download page at `notebookmd.io/download` that:
- Detects the user's OS and highlights the appropriate download button
- Shows both macOS (.dmg) and Windows (.exe / .msi) options
- Displays current version number and release notes
- Linked from the web app header/settings ("Get the Desktop App")