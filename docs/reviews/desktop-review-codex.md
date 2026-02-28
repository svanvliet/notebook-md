# Desktop Review — Tauri v2 (Codex)

## 1. Executive Summary
Both failures are primarily caused by missing Tauri v2 capability configuration plus UI-side error handling that suppresses/obscures runtime failures, making broken actions look like no-ops. The native menu wiring is structurally present, but the frontend listener fails silently and no fallback diagnostics exist. The “Open Folder” flow is additionally architecturally incorrect (double-creation + wrong state path), so even when the dialog works, it does not produce the intended notebook behavior.

## 2. Issue 1 Deep Dive: Native Menu Actions

### What exists
- Native menu is built and attached in Rust:
  - `apps/desktop/src-tauri/src/menu.rs:7-73` (`build_menu`)
  - `apps/desktop/src-tauri/src/main.rs:34-40` (`app.set_menu(...)`)
- Menu click handler is registered:
  - `apps/desktop/src-tauri/src/main.rs:43-45` (`app.on_menu_event(...)`)
- Click events are emitted as global event `menu-action`:
  - `apps/desktop/src-tauri/src/menu.rs:76-78` (`app.emit("menu-action", event_id)`)
- Frontend listener hook exists:
  - `apps/web/src/hooks/useNativeMenu.ts:39-43` (`listen('menu-action', ...)`)
- App callback dispatcher exists and IDs match:
  - `apps/web/src/App.tsx:107-142` (switch over `MenuAction` IDs)

### Root causes
1. **No Tauri v2 capabilities are defined**
   - `apps/desktop/src-tauri/capabilities/` is missing entirely.
   - Generated schema confirms empty capabilities: `apps/desktop/src-tauri/gen/schemas/capabilities.json:1` is `{}`.
   - In Tauri v2, APIs (event, dialog, etc.) are permissioned by capabilities; without explicit capability grants, JS-side APIs can be blocked depending on runtime policy.

2. **Listener setup failure is swallowed silently**
   - `apps/web/src/hooks/useNativeMenu.ts:44-46` catches and ignores all errors.
   - If `@tauri-apps/api/event.listen` fails (permissions/runtime mismatch), the app gives no log or UI signal.
   - Result matches symptom exactly: menu items appear to do nothing.

3. **Menu “Open Folder” action is wired to the wrong UX path**
   - `apps/web/src/App.tsx:116-119` sets `initialSource='local-folder'` and opens modal.
   - `apps/web/src/components/notebook/AddNotebookModal.tsx:54-56` interprets initial source as `step='configure'`.
   - `apps/web/src/components/notebook/AddNotebookModal.tsx:154-156` routes unknown configure types to `ComingSoon`, including `local-folder`.
   - So even if menu event delivery works, `open_folder` does not invoke the folder picker; it opens the wrong screen.

### ID matching check
- Rust IDs (`menu.rs`): `new_notebook`, `new_file`, `open_folder`, `save`, `close_tab`, `find`, `toggle_sidebar`, `toggle_dark`, `about`, `check_updates`, `docs`.
- TS union (`useNativeMenu.ts:11-22`) and switch (`App.tsx:109-139`) are consistent for the implemented cases.
- No primary mismatch found; failure is transport/permission + UX routing, not identifier drift.

### Exact fix for Issue 1
1. Add capability file(s), e.g. `apps/desktop/src-tauri/capabilities/default.json`, granting at least:
   - `core:default`
   - `core:event:default`
   - `dialog:default`
   - any additional plugin permissions actually used.
2. Add capability declaration in `tauri.conf.json` (`app.security.capabilities`) if your setup requires explicit reference.
3. Replace silent catch in `useNativeMenu.ts` with actionable diagnostics (`console.error` + optional toast in dev).
4. Fix `open_folder` menu action handler to directly run folder-open flow (or explicitly set modal to `source` and trigger folder action), not `ComingSoon` path.

## 3. Issue 2 Deep Dive: Open Folder

### What exists
- Frontend button path:
  - `apps/web/src/components/notebook/AddNotebookModal.tsx:66-68` calls `handleOpenFolder()` for `local-folder`.
  - `apps/web/src/components/notebook/AddNotebookModal.tsx:82-83` calls dialog plugin `open({ directory: true })`.
  - `apps/web/src/components/notebook/AddNotebookModal.tsx:86` invokes Rust command `open_folder_as_notebook`.
- Rust command exists and is registered:
  - Definition: `apps/desktop/src-tauri/src/commands.rs:522-556`
  - Registration: `apps/desktop/src-tauri/src/main.rs:49-68` includes `commands::open_folder_as_notebook`.
- Dialog plugin is registered in Tauri builder:
  - `apps/desktop/src-tauri/src/main.rs:15` (`tauri_plugin_dialog::init()`)

### Root causes
1. **Likely missing capability permission for dialog/event APIs**
   - Same capability gap as Issue 1 (`capabilities.json` is `{}` and no capabilities dir).
   - Dialog API can fail at runtime even though plugin is installed and initialized.

2. **Failure feedback is effectively invisible in this flow**
   - `handleOpenFolder` catches errors and sets `error` (`AddNotebookModal.tsx:89-91`).
   - But error rendering is only passed into `NameStep` (`AddNotebookModal.tsx:157-165`), not source/configure views.
   - So dialog failure from source step appears as “nothing happened.”

3. **Flow is functionally wrong after successful command**
   - Rust command already creates/persists notebook (`commands.rs:550-555`).
   - Frontend then calls `onAdd(nb.name, 'local', { path: selected })` (`AddNotebookModal.tsx:87`), which enters local create path.
   - `handleAddNotebook` ignores `sourceConfig` for local and creates a new local notebook (`useNotebookManager.ts:427-431`).
   - Net effect: selected-folder notebook isn’t properly reflected through the intended state path; behavior is inconsistent and can manifest as “didn’t open folder notebook.”

4. **Menu-initiated open-folder path is dead-end**
   - From native menu, `initialSource='local-folder'` goes to `ComingSoon` (`AddNotebookModal.tsx:154-156`), never calling dialog.

### Dynamic import viability
- Dynamic import pattern itself is valid in Tauri WebView; same pattern is used elsewhere (`useFsWatcher.ts:64-66`) and is not the fundamental issue.
- The broken behavior is permissions + control-flow + error visibility.

### Exact fix for Issue 2
1. Enable dialog permissions via capabilities (same as Issue 1).
2. Show errors in source/configure step (global inline alert in modal body) so failures are visible.
3. Remove double-create pattern:
   - Either (A) make `open_folder_as_notebook` return notebook and update in-memory state directly, **without** calling `onAdd`.
   - Or (B) stop creating notebook in Rust command and only return selected path, then let normal `onAdd` flow create with `sourceType='local'` + `sourceConfig.path` (requires local path support in adapter).
4. Fix menu `open_folder` action to call same `handleOpenFolder` logic directly (single source of truth).

## 4. Architecture Critique

### Tauri v2 idiomatic usage
- **Not idiomatic enough on security model:** v2 capability model appears unimplemented (no capability files, empty generated capabilities schema). This is a foundational desktop concern, not optional polish.
- Menu/event transport is conceptually fine, but operationally fragile because errors are swallowed.

### Storage adapter abstraction
- The abstraction is good in principle (`StorageAdapter` + `TauriFilesystemAdapter`), but the implementation leaks:
  - `useNotebookManager.handleAddNotebook` special-cases `local` and ignores `sourceConfig` (`useNotebookManager.ts:427-431`), bypassing richer source semantics.
  - `open_folder_as_notebook` creates state on Rust side while UI also creates notebook via `onAdd` (split responsibility, duplicated write path).
- Result: adapter contract is not consistently respected.

### `isTauriEnvironment()` branching sustainability
- Current approach (`storageAdapterFactory.ts:32-34`) is simple but too binary.
- Repeated runtime checks across many components/hooks create distributed platform logic and subtle divergence.
- Better: centralize desktop capabilities into one `desktopBridge` service with explicit feature probes (event bridge available, dialog available, deep link available).

### Anti-patterns / risks
- Silent catches in platform-critical hooks (`useNativeMenu.ts:44-46`) hide integration failures.
- Desktop-specific deps are not declared in `apps/web/package.json` despite direct imports (`@tauri-apps/api`, `@tauri-apps/plugin-dialog`), creating monorepo-hoist coupling risk.
- “Done” status in planning docs does not reflect runtime reality (`docs/plans/desktop-plan.md:858`, `:873`), indicating weak desktop QA gates.

### Web↔desktop sharing quality
- Shared UI is strong, but desktop feature integration is scattered in top-level app and modal logic.
- A dedicated desktop action layer (menu + dialog + native commands) would reduce coupling and eliminate duplicate notebook creation paths.

## 5. Remediation Plan

### Priority 0 — unblock runtime permissions
1. **Create capability config** in `apps/desktop/src-tauri/capabilities/default.json` with required permissions.
2. Ensure `tauri.conf.json` references capabilities if needed by your setup.
3. Rebuild desktop app and verify `listen('menu-action')` + `dialog.open()` execute without permission errors.

### Priority 1 — fix menu action transport/behavior
4. In `useNativeMenu.ts`, replace silent catch with logged error and dev toast.
5. In `App.tsx`, replace `open_folder` action behavior:
   - Do not set `initialSource='local-folder'` configure path.
   - Trigger explicit open-folder action (shared helper) instead.

### Priority 2 — correct open-folder data flow
6. Refactor `AddNotebookModal.handleOpenFolder` + parent callback contract:
   - Return/consume the notebook created by `open_folder_as_notebook` directly.
   - Do **not** call `onAdd` local create path afterward.
7. Or refactor command semantics so only one side creates the notebook (pick one owner).
8. Update `useNotebookManager.handleAddNotebook` to respect `sourceConfig` for local notebooks if local-folder remains in shared path.

### Priority 3 — improve observability + robustness
9. Surface modal error state on source/configure steps (not only name step).
10. Add integration tests:
   - Native menu event receipt test (mocked event bus).
   - Open-folder happy path and permission-failure UX path.
11. Add a desktop smoke checklist in CI/release process validating menu and dialog actions before marking phase complete.

## 6. Recommendations
- Treat desktop integration as a first-class platform with its own quality gates; “feature wired” is not “feature working.”
- Consolidate all Tauri interactions behind a typed bridge module and remove scattered dynamic imports/catches across UI components.
- Enforce dependency hygiene: any package that imports `@tauri-apps/*` should declare it directly to avoid hoisting accidents.
- Stop dual-write flows between Rust and React state management; pick one write authority per action and make the other side purely sync/refresh.
