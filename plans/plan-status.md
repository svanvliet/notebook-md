# Notebook.md — Plan Status & Session Context

**Purpose:** This document is the running register of implementation progress, decisions made, and context needed for any agent session to continue the work. If a session ends, a new agent should read this file first to understand where we left off.

**Last Updated:** 2026-02-18

---

## Instructions for Future Agent Sessions

1. **Read these files first** (in this order):
   - `plans/plan-status.md` (this file) — understand what's been done and current state
   - `plans/initial-plan.md` — the phased implementation plan with checkboxes
   - `requirements/requirements.md` — the living requirements document (v1.4)

2. **When making changes:**
   - Update the checklist in `plans/initial-plan.md` as tasks are completed (change `- [ ]` to `- [x]`)
   - Update this file (`plans/plan-status.md`) with a summary of what was done after each subphase
   - If a significant architectural or requirements change is discovered during implementation, update `requirements/requirements.md` — increment the version number and add a changelog note at the top

3. **Development environment:**
   - All work runs locally via `docker compose up`
   - The monorepo is at `/Users/svanvliet/repos/notebook-md`
   - GitHub repo: `svanvliet/notebook-md` (private)
   - Production deployment is deferred to Phase 6

4. **Key decisions made during requirements:**
   - "Workspace" was renamed to "Notebook" — use "Notebook" everywhere
   - iCloud and Apple Sign-In are deferred
   - GitHub integration uses a GitHub App (not OAuth App), named "Notebook.md"
   - Backend proxy model: OAuth tokens never reach the browser; API proxies all source system calls
   - Local notebooks use IndexedDB in the browser
   - Dev mode is a build-time flag (`NODE_ENV`), not a runtime env var
   - Admin promotion is CLI-only (`docker exec`)
   - Working branch naming: `notebook-md/<random-uuid>` (no username leak)
   - Repo is private; CI/CD triggers on `v*` tags
   - Legal entity: Van Vliet Ventures, LLC
   - Tailwind CSS for styling; react-i18next for i18n
   - GFM + footnotes + KaTeX math
   - DOMPurify for Markdown sanitization

5. **Commit conventions:**
   - Always include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer
   - Use descriptive commit messages

---

## Progress Log

### Phase 1: Foundation & Local Editor

#### 1.1 Project Setup
- **Status:** Complete
- **Started:** 2026-02-17
- **Completed:** 2026-02-17

**What was done:**
- Created npm workspaces monorepo with three apps (`web`, `api`, `admin`) and one shared package (`packages/shared`)
- **`apps/web`**: React 19 + TypeScript + Vite 6 + Tailwind CSS 3 + PostCSS + react-i18next. Vite proxies `/api`, `/auth`, `/webhooks` to the API on port 3001. English locale file at `src/locales/en/translation.json` with all strings externalized.
- **`apps/api`**: Express 5 + TypeScript + Helmet + CORS + Compression. Health endpoint at `/api/health`. Runs on port 3001 via `tsx watch`.
- **`apps/admin`**: Placeholder `package.json` only (Phase 5).
- **`packages/shared`**: Shared TypeScript types (`SourceType`, `UserSettings`, `NotebookConfig`) and defaults. Composite TypeScript project referenced by web and api.
- **`.prettierrc`**: Semi, single quotes, trailing commas, 100 char width.
- **`docker-compose.yml`**: PostgreSQL 16, Redis 7, Mailpit (SMTP trap on 1025, Web UI on 8025). Health checks on DB and Redis.
- **`.env.example`**: Template for all env vars (DB, Redis, SMTP, OAuth placeholders, session secret, encryption key).
- **`.gitignore`**: node_modules, dist, .env, IDE files, OS files, build artifacts.

**Verified:**
- `npm install` — 329 packages, all workspaces resolved
- `tsc --noEmit` passes for both web and api
- Vite dev server starts on port 5173 and serves the React app
- API dev server starts on port 3001 and responds to `/api/health`
- Docker Compose file is valid (Docker CLI not available on this machine but config is correct)

**Note:** Docker is installed at `/Applications/Docker.app/Contents/Resources/bin/docker` (added to PATH in `~/.zshrc`). All 3 containers verified running: PostgreSQL 16 (port 5432), Redis 7 (port 6379), Mailpit (SMTP 1025, Web UI 8025).

#### 1.2 Application Shell & Layout
- **Status:** Complete
- **Started:** 2026-02-17
- **Completed:** 2026-02-17

**What was done:**
- **Icons** (`components/icons/Icons.tsx`): SVG icon components — NotebookIcon, ChevronLeft/Right, User, Sun, Moon, Monitor, X, Plus, Folder. All accept a `className` prop.
- **TitleBar** (`components/layout/TitleBar.tsx`): Logo + "Notebook.md" text on left, toolbar portal placeholder in center, display mode toggle (light/dark/system) and account dropdown on right. Account dropdown has Account Settings, Settings, and Sign Out items (non-functional UI).
- **NotebookPane** (`components/layout/NotebookPane.tsx`): Collapsible left sidebar with tree view placeholder. Shows "Add your first notebook" empty state. Collapse/expand button and resize drag handle. Width and collapse state driven by `useSidebarResize` hook.
- **DocumentPane** (`components/layout/DocumentPane.tsx`): Tabbed document area. Tab bar shows file names, unsaved-changes dot indicator, and close button per tab. Empty state when no tabs open. Exports `Tab` type.
- **StatusBar** (`components/layout/StatusBar.tsx`): Thin bottom bar showing word count, char count, last saved timestamp. Supports ephemeral message display.
- **WelcomeScreen** (`components/welcome/WelcomeScreen.tsx`): Centered card with logo (blue rounded square + NotebookIcon), app name, tagline, Sign In / Sign Up buttons, and provider buttons (Microsoft, GitHub, Google). All non-functional.
- **useDisplayMode** (`hooks/useDisplayMode.ts`): Light/dark/system toggle. Persists to `localStorage('display-mode')`. Listens to `prefers-color-scheme` media query for system mode. Adds/removes `dark` class on `<html>`.
- **useSidebarResize** (`hooks/useSidebarResize.ts`): Drag-to-resize sidebar with min 160px, max 480px. Collapse threshold at 100px. Toggle collapse via button. Persists width to `localStorage`.
- **App.tsx**: Composes all layout components. Has temporary `isSignedIn` state toggle — shows WelcomeScreen when false, full app layout when true. "Skip to app (dev)" button in bottom-right corner for quick testing.

**Verified:**
- TypeScript compiles cleanly (`tsc --noEmit`)
- Vite production build succeeds (259KB JS, 13.5KB CSS gzip)
- All i18n strings use existing translation keys (no new keys needed)

#### 1.3 WYSIWYG Markdown Editor
- **Status:** Complete (core features; footnotes, KaTeX, emoji, front matter deferred to Phase 4)
- **Started:** 2026-02-17
- **Completed:** 2026-02-17

**What was done:**
- Installed Tiptap 2 + ProseMirror with 20+ extensions: StarterKit, Placeholder, Underline, Highlight, Link (autolink, noopener), Image (inline, base64), TaskList/TaskItem, CodeBlockLowlight, Table/TableRow/TableHeader/TableCell, Typography, TextAlign, Superscript, Subscript, TextStyle, Color
- Installed `lowlight` with 16 language grammars: JS, TS, Python, CSS, JSON, Markdown, Bash, HTML/XML, YAML, SQL, Java, C#, Go, Rust, Ruby, PHP
- Installed `@tailwindcss/typography` for `prose` styling in the editor
- Installed `dompurify` for HTML sanitization — all content passed through DOMPurify before rendering
- **`components/editor/extensions.ts`**: Centralized Tiptap extension config with lowlight syntax highlighting setup
- **`components/editor/EditorToolbar.tsx`**: Full toolbar with heading selector (H1–H6 + paragraph), formatting (bold/italic/underline/strikethrough/code/highlight), lists (bullet/ordered/task), block elements (blockquote/code block/hr/table), link input modal, undo/redo — all with active state tracking and keyboard shortcut hints
- **`components/editor/SlashCommands.ts`**: ProseMirror plugin that detects "/" at cursor, tracks query text, and exposes state via a PluginKey. 15 commands: H1–H3, bullet/ordered/task list, blockquote, code block, table, hr, bold, italic, strikethrough, inline code, highlight
- **`components/editor/SlashCommandMenu.tsx`**: React component that reads slash command state, renders a floating command palette with fuzzy filtering, keyboard navigation (↑↓ Enter Escape), and executes commands by deleting the slash text then applying the action
- **`components/editor/MarkdownEditor.tsx`**: Main editor component composing toolbar + Tiptap EditorContent + slash command menu. Supports raw Markdown toggle (⌘⇧M), word/char count reporting, content sync from props via DOMPurify
- **`components/editor/markdownConverter.ts`**: HTML↔Markdown conversion using `turndown` + `turndown-plugin-gfm`. Custom rules for task lists and highlight marks. `htmlToMarkdown()` and `markdownToHtml()` functions.
- **`components/editor/editor.css`**: Custom styles for placeholder text, task list checkboxes, code blocks with syntax token colors (light+dark), tables with selection/resize handles, blockquotes, horizontal rules, links, inline code, highlights, images, slash command active text
- Updated `DocumentPane` to render `MarkdownEditor` in active tab, with `content` and `onContentChange` props

**Deferred to Phase 4 (Editor Polish):**
- Footnotes extension
- KaTeX math extension
- Emoji shortcodes
- YAML front matter (collapsible metadata block)

**Verified:**
- TypeScript compiles cleanly
- Vite build succeeds (827KB JS — expected for Tiptap+ProseMirror+highlight.js; will code-split in Phase 7)

#### 1.4 Local Notebook Storage
- **Status:** Complete (media preview deferred to Phase 4)
- **Started:** 2026-02-18
- **Completed:** 2026-02-18

**What was done:**
- Installed `idb` (IndexedDB wrapper) for browser-local storage
- **`stores/localNotebookStore.ts`**: Full IndexedDB data layer with two object stores:
  - `notebooks` store: CRUD for notebook metadata (id, name, timestamps)
  - `files` store: CRUD for file entries (path, notebookId, name, type, parentPath, content, timestamps). Compound key `[notebookId, path]`. Indexes on `byNotebook` and `byParent` for efficient tree queries.
  - Operations: createNotebook, listNotebooks, renameNotebook, deleteNotebook (cascade deletes files), createFile, getFile, listFiles, listChildren, saveFileContent, renameFile (handles folder rename with child path updates), deleteFile (cascade for folders), moveFile
- **`components/notebook/NotebookTree.tsx`**: Full tree view component with:
  - Device icon for local notebooks, file icons (blue for .md files)
  - Expand/collapse for notebooks and folders with chevron rotation
  - Right-click context menus: New File, New Folder, Rename, Delete (with folder-specific menu items)
  - Inline rename via input field (Enter to confirm, Escape to cancel, blur to confirm)
  - Active file highlighting (blue background)
  - Files sorted folders-first then alphabetically
  - Editable file detection (.md, .mdx, .markdown, .txt)
  - Empty notebook state ("Empty notebook" italic text)
  - No-notebooks empty state with browser storage warning and "Add Notebook" button
- **`hooks/useNotebookManager.ts`**: Central state management hook coordinating:
  - Notebook/file CRUD operations wired to IndexedDB store
  - Tab management: open file → create tab, close tab with unsaved-changes confirmation, rename updates open tabs
  - Auto-save: 1-second debounce on content changes, writes to IndexedDB automatically
  - Manual save: `⌘S` / `Ctrl+S` keyboard shortcut triggers immediate save
  - Status bar integration: flash messages ("Saved", "Created notebook X", etc.) with 2-second auto-dismiss
  - Last saved timestamp flows to StatusBar
  - Delete notebook/file cascades to close affected tabs
- Updated **`NotebookPane`** to accept and pass through all notebook/file operation props to NotebookTree
- Updated **`App.tsx`** to use `useNotebookManager` hook instead of hardcoded demo tab. Maps OpenTab[] to Tab[] for DocumentPane compatibility.
- Updated **i18n translations** with new keys: localWarning, newFile, newFolder, rename, delete
- Browser storage warning alert shown on first notebook creation

**Deferred to Phase 4:**
- Image/video preview for media files in tree

**Verified:**
- TypeScript compiles cleanly
- Vite build succeeds (858KB JS)

#### 1.5 Phase 1 Validation
- **Status:** Complete
- **Started:** 2026-02-18
- **Completed:** 2026-02-18

**Technical validation performed:**
- ✅ TypeScript: all 3 packages (shared, web, api) compile cleanly with `tsc --noEmit`
- ✅ Vite production build: succeeds (858KB JS, 52KB CSS). Chunk size warning expected — will code-split in Phase 7.
- ✅ GFM extension audit: all 17 Tiptap extensions verified present and configured (headings, bold/italic/strikethrough, inline code, highlight, links with autolink, images, blockquotes, ordered/unordered/nested lists, task lists, code blocks with lowlight, tables, horizontal rules, superscript/subscript, typography, text align, underline, color)
- ✅ IndexedDB data flow audit: localNotebookStore → useNotebookManager → App.tsx → components chain is complete
- ✅ Docker services: PostgreSQL 16, Redis 7, Mailpit all healthy
- ✅ File structure: 24 source files, well-organized (components/editor, components/layout, components/notebook, components/welcome, components/icons, hooks, stores, types, locales)

**Bugs found and fixed during validation:**
1. **Auto-save stale closure** (HIGH): `handleContentChange` captured stale `tabs` array in its closure and dependency array, causing potential data loss and unnecessary re-renders. Fixed by removing `tabs` from deps and reading fresh state inside `setTabs` callback.
2. **Manual save stale closure** (MEDIUM): `handleSave` read `tabs` from closure which could be stale. Fixed by reading fresh state inside `setTabs` callback before saving.

**Remaining for UX review (user feedback requested):**
- Editor feel — does WYSIWYG editing feel responsive?
- Toolbar layout — are the controls intuitive? Any missing?
- Sidebar behavior — collapse/resize/tree navigation feel natural?
- Dark mode appearance — consistent across all elements?
- Overall layout proportions — title bar, sidebar, editor, status bar sizing

---

## Iteration Notes

- **1.3 follow-up:** User noticed raw Markdown toggle was showing HTML instead of Markdown. Added `turndown` + `turndown-plugin-gfm` for proper HTML→Markdown conversion with custom task list and highlight rules. Fixed and committed separately.
- **1.5 validation:** Code review found stale closure bugs in auto-save and manual save. Both fixed before committing.
- **1.5 UX feedback round:** User tested and reported 10 issues. All addressed:
  1. **+ button placement** — fixed flex layout so + is right-aligned next to NOTEBOOKS heading
  2. **File extension** — auto-appends .md if no extension provided on new file
  3. **Table raw view** — added turndown rule to strip Tiptap's tableWrapper div so GFM plugin converts tables to Markdown
  4. **Link button** — rewrote link insertion to handle both new text insertion and existing selection
  5. **Code block language** — added CodeBlockView with dropdown language selector (18 languages) positioned in top-right of code block
  6. **Inline code bolding** — added `font-weight: normal` to inline code and code inside headings/strong
  7. **Link slash command** — added /Link command with URL and display text prompts
  8. **Link modal** — rewrote as proper modal with Display Text and URL fields, Cancel/Apply buttons
  9. **Tooltips** — toolbar buttons already had `title` attributes (browser native tooltips); verified working
  10. **Prompt alignment** — using browser native `prompt()` for now; will replace with custom modal in Phase 4
- **Modal dialog fix:** Replaced all browser-native `prompt()` calls with custom `InputModal` component. Modal has proper text alignment, label, placeholder, Cancel/Create buttons, Enter/Escape keyboard support, backdrop overlay, dark mode support.
- **Table rendering fix:** Tables were showing as raw HTML text in the editor. Root cause: DOMPurify was stripping `colspan`, `rowspan`, `style` attributes and `colgroup`/`col` elements that Tiptap's table extension requires. Fixed by configuring DOMPurify with `ADD_TAGS` and `ADD_ATTR`. Note: existing files saved while the bug was present may have corrupted table data stored as text — user should re-create those tables.
- **Right-click context menus:** Added `EditorContextMenu` component with:
  - **Link context menu:** Edit Link (opens modal with URL + display text), Open Link (new tab), Copy Link URL, Remove Link
  - **Table context menu:** Insert/Delete Row, Insert/Delete Column, Toggle Header Row, Merge/Split Cells, Delete Table
  - Context menu positions cursor at right-click location so Tiptap knows which cell/link is active
  - Menu auto-repositions if it would go off-screen
- **Context menu icons:** Added SVG icons to all context menu items:
  - Editor context menu: arrow icons for row/column insert, trash for deletes, edit/external-link/copy/unlink for links, toggle/grid icons for table operations
  - Notebook tree context menu: file+, folder+, rename (pencil), trash icons
- **+ button dropdown:** Changed from creating a notebook directly to showing a dropdown with New Notebook, New File, and Import File options
- **Floating table toolbar:** Added `TableFloatingToolbar` component that appears above the table when cursor is inside a cell. Contains: insert/delete row, insert/delete column, toggle header, merge/split cells, delete table. Removed Merge/Split from right-click menu since right-click cancels multi-cell selection.
- **Table source view fix:** Tables were rendering as raw HTML in the source/raw view. Root cause: Tiptap's `resizable: true` adds `style` attributes, `<colgroup>` elements, and wraps cell content in `<p>` tags — all of which caused turndown-plugin-gfm to fail table recognition. Fixed by adding `cleanAndConvertTable()` that strips Tiptap artifacts before conversion.
- **Markdown source icon:** Replaced `</>` text with the Markdown logo SVG for the source toggle button.
- **File import:** Added Import File feature accessible from + dropdown menu and right-click context menus. Uses native file picker (accepts .md, .mdx, .markdown, .txt). When importing from + menu (no target location), shows SaveLocationPicker modal; from context menu, saves directly to that location.
- **Drag-and-drop import:** Drag a .md file onto the app canvas to import. Shows blue dashed overlay while dragging, then opens SaveLocationPicker to choose save location.
- **SaveLocationPicker modal:** New component showing notebooks and folders only (no files) in a tree view. User selects a location and clicks "Save Here". Shows selected path in footer.
- **Blank screen fix:** React hooks (useState, useCallback) for drag-and-drop were called after a conditional early return, violating rules of hooks. Moved all hooks before the conditional.
- **Imported files rendering fix:** Imported .md files showed raw markdown text because content was stored as markdown but the editor expects HTML. Replaced hand-rolled regex markdown→HTML parser with `marked` library for full GFM support (tables, nested lists, code blocks). Added `isMarkdownContent()` heuristic to detect markdown vs HTML on file open. Also fixed tables stored as pipe syntax not rendering.
- **Auto-open after import:** Imported files now automatically open in a new tab after saving.

### Key Technical Decisions (Post-Phase 1)
- Installed `marked` library for markdown→HTML conversion (replaces custom regex parser)
- DOMPurify configured with `ADD_TAGS: ['colgroup', 'col']` and `ADD_ATTR: ['colspan', 'rowspan', 'style', 'data-type', 'data-checked']`
- Content detection: `isMarkdownContent()` checks for markdown patterns vs HTML to determine if conversion is needed on file open

### New Files Created (Post-Phase 1)
- `apps/web/src/components/editor/EditorContextMenu.tsx` — Right-click context menus for links and tables
- `apps/web/src/components/editor/TableFloatingToolbar.tsx` — Floating toolbar above tables
- `apps/web/src/components/common/InputModal.tsx` — Custom modal replacing browser prompt()
- `apps/web/src/components/common/SaveLocationPicker.tsx` — Folder-only tree view for import save location

---

## Phase 2: Auth & Account System — COMPLETED ✅

**Completed:** 2026-02-18

### 2.1 Backend API Foundation
- Express 5 API with helmet, cors, compression, cookie-parser
- PostgreSQL connection pool (`db/pool.ts`) with health check
- Redis client (`lib/redis.ts`) with lazy connect
- SQL migration (`001_initial-schema.sql`) with 11 tables: users, identity_links, sessions, notebooks, user_settings, audit_log, feature_flags, announcements, email_verification_tokens, magic_link_tokens, password_reset_tokens
- Structured JSON logger with correlation IDs (`lib/logger.ts`)
- Request logging and global error handler middleware (`middleware/common.ts`)
- Dev seed script creates `admin@localhost` with bcrypt password

### 2.2 Email Authentication
- Email+password sign-up/sign-in with bcrypt (cost 12)
- Magic link request and verify (15 min expiry)
- Password reset request and confirm (1 hour expiry)
- Email verification on sign-up
- Session management: HttpOnly/Secure/SameSite cookies
- Refresh token rotation with family tracking (reuse detection → revoke all)
- Remember Me (30 days) vs default (24 hours)
- Rate limiting (memory-backed; later split into mutation 30/15min and read 200/15min — see Post-Phase 2 Fixes)
- Audit logging for all auth events
- Nodemailer with Mailpit for local dev

### 2.3 OAuth Provider Scaffolding
- `OAuthProvider` abstraction interface with provider registry
- Mock OAuth provider (HTML form for dev testing)
- GitHub, Microsoft, Google provider implementations (real API integrations)
- Provider registration from env vars; mock auto-registered in dev
- Account linking/merging service:
  - OAuth↔OAuth auto-merge (verified email match)
  - Email+password ↔ OAuth never auto-merges
  - Manual link/unlink from settings
- State tokens in Redis (10 min TTL) for CSRF

### 2.4 Account Management UI
- `useAuth` hook: sign-up, sign-in, sign-out, magic link, password reset, profile update, password change, account delete, dev skip
- `useSettings` hook: app preferences with local + server sync
- `WelcomeScreen`: sign-in/sign-up forms, magic link, OAuth buttons (Microsoft/GitHub/Google) with proper SVG logos
- `TitleBar`: wired account dropdown (name, email, Account Settings, Settings, Sign Out)
- `SettingsModal`: display mode, font family, font size, margins, toggles (auto-save, spell check, etc.)
- `AccountModal`: profile editing, password change, danger zone (account deletion)
- Settings API (GET/PUT /auth/settings)
- URL param handling for magic link, email verification, OAuth callback

### 2.5 Connect Auth to Local Notebooks
- Notebooks CRUD API (GET/POST/PUT/DELETE /api/notebooks)
- Notebook metadata persisted server-side; local notebook data in IndexedDB

### 2.6 Validation
- Full E2E test: sign up → get me → save settings → create notebook → sign out → sign back in → settings preserved → notebooks preserved
- Audit log captures all events
- Emails arrive in Mailpit
- Both API and web typecheck clean, web builds successfully

### New Files Created (Phase 2)
**API:**
- `apps/api/migrations/001_initial-schema.sql`
- `apps/api/src/db/pool.ts`, `apps/api/src/db/seed.ts`
- `apps/api/src/lib/logger.ts`, `apps/api/src/lib/redis.ts`, `apps/api/src/lib/crypto.ts`, `apps/api/src/lib/email.ts`, `apps/api/src/lib/audit.ts`
- `apps/api/src/middleware/common.ts`, `apps/api/src/middleware/auth.ts`
- `apps/api/src/routes/auth.ts`, `apps/api/src/routes/oauth.ts`, `apps/api/src/routes/settings.ts`, `apps/api/src/routes/notebooks.ts`
- `apps/api/src/services/session.ts`, `apps/api/src/services/account-link.ts`
- `apps/api/src/services/oauth/types.ts`, `apps/api/src/services/oauth/index.ts`, `apps/api/src/services/oauth/mock-provider.ts`, `apps/api/src/services/oauth/github.ts`, `apps/api/src/services/oauth/microsoft.ts`, `apps/api/src/services/oauth/google.ts`

**Web:**
- `apps/web/src/hooks/useAuth.ts`, `apps/web/src/hooks/useSettings.ts`
- `apps/web/src/components/settings/SettingsModal.tsx`
- `apps/web/src/components/account/AccountModal.tsx`

### Key Architecture Decisions (Phase 2)
- SQL migrations (not JS/CJS) due to ESM `"type": "module"` in package.json
- Memory-backed rate limiter for dev (swap to Redis store for production)
- OAuth state stored in Redis, session cookies as refresh tokens
- Settings sync: localStorage for instant access + API sync when signed in
- `useAuth` includes `devSkipAuth()` to bypass auth during dev

### Post-Phase 2 Fixes & Improvements

1. **Rate limiter split (2026-02-18):** Blanket 20 req/15min rate limiter on all `/auth/*` routes caused 429 errors during normal use because `/auth/me` fires on every page load. Split into two tiers:
   - `authMutationLimiter` (30 req/15min): sign-up, sign-in, magic link, password reset
   - `authReadLimiter` (200 req/15min): /me, /refresh, /signout, profile update, password change
   - Applied per-route instead of blanket `router.use()`

2. **IndexedDB user scoping (2026-02-18):** After signing in, users saw notebooks/files created before they had an account (or by other users in the same browser). Root cause: `localNotebookStore.ts` used a single shared IndexedDB database (`notebook-md`) with no user scoping. Fix:
   - Added `setStorageScope(userId)` function that changes the DB name to `notebook-md-<userId>` (or `notebook-md-anonymous` for dev-skip)
   - `useNotebookManager` now accepts an optional `userId` parameter and re-scopes + reloads on change
   - Open tabs are cleared when switching users
   - Old un-scoped `notebook-md` DB is orphaned (harmless; can be cleaned up manually)

3. **dev.sh startup script (2026-02-18):** Created `dev.sh` in repo root — single script to manage the full dev environment:
   - `./dev.sh` — starts Docker (PostgreSQL, Redis, Mailpit), runs DB migrations, starts API + Web servers
   - `./dev.sh stop` — stops all services
   - `./dev.sh status` — shows running status of all components
   - `./dev.sh logs` — tails API and Web log files
   - Logs written to `.dev-logs/` (gitignored)
   - Fixed PostgreSQL health check (was trying HTTP on port 5432, switched to Docker health check polling)
   - Fixed API path issue (`npx --workspace=` doubled the path; now runs `tsx src/index.ts` directly)

4. **README.md rewrite (2026-02-18):** Replaced placeholder README with comprehensive docs: current features, tech stack table, project structure tree, prerequisites, full dev.sh usage, service URLs, dev account info, current status section.

### Files Modified (Post-Phase 2)
- `apps/api/src/routes/auth.ts` — Split rate limiters
- `apps/web/src/stores/localNotebookStore.ts` — Added `setStorageScope()`, DB name keyed by userId
- `apps/web/src/hooks/useNotebookManager.ts` — Accepts `userId` param, calls `setStorageScope`, clears tabs on user change
- `apps/web/src/App.tsx` — Reordered hooks (auth before notebook manager), passes `auth.user?.id` to notebook manager
- `dev.sh` — New dev startup script
- `README.md` — Full rewrite
- `.gitignore` — Added `.dev-logs/`

---

### Testing Strategy Added (2026-02-18)

Added §8.15 to requirements (v1.5) and updated initial-plan (v1.1) with a 3-tier testing strategy:

| Tier | Scope | Framework | Phase |
|------|-------|-----------|-------|
| **1** | API integration tests | Vitest + Supertest | 2.7 (now) |
| **2** | Web unit tests (hooks, stores, converters) | Vitest + React Testing Library + fake-indexeddb | 4.8 |
| **3** | E2E browser tests | Playwright (Chromium/Firefox/WebKit) | 6.4 |

Plan changes:
- Added §2.7 with detailed Tier 1 test suites (auth, sessions, notebooks, settings, OAuth, rate limiting)
- Added §4.8 with Tier 2 test suites (localNotebookStore, markdownConverter, useAuth, useNotebookManager, useSettings)
- Added §6.4 with Tier 3 E2E suites (auth flows, notebook CRUD, editor, settings, data isolation)
- Updated §6.3 CI/CD to run Tier 1+2 on every push/PR and Tier 3 on PR to main
- Renumbered Phase 6 sections (6.4→6.5 DNS, 6.5→6.6 Monitoring, etc.)

### Phase 2.7 — Tier 1 API Integration Tests — COMPLETED ✅ (2026-02-18)

Installed Vitest + Supertest and wrote 48 integration tests across 5 test suites, all passing against real PostgreSQL + Redis (Docker Compose).

**Test suites:**
| File | Tests | Coverage |
|------|-------|----------|
| `auth.test.ts` | 23 | Sign-up (success, duplicate, validation), sign-in (success, wrong pw, unknown email), magic link, password reset, email verify, sign-out, /me, profile update, password change, account delete |
| `sessions.test.ts` | 7 | Refresh token rotation, old token invalidation, reuse detection → family revocation, expired token rejection |
| `notebooks.test.ts` | 8 | CRUD, user isolation (A can't see B's), unauth rejection, validation |
| `settings.test.ts` | 6 | Default empty, save/retrieve, overwrite, cross-session persistence, unauth, validation |
| `oauth.test.ts` | 4 | Provider listing, mock flow redirect, linked accounts, unauth |

**Infrastructure decisions:**
- `app.ts` extracted from `index.ts` so Supertest imports the Express app without starting the server
- `fileParallelism: false` in vitest config — tests share a real DB, parallel execution causes race conditions
- Rate limiters set to 10000 max in test env (`VITEST=true`) to avoid 429s — dedicated rate limit test verifies limits work
- `NODE_ENV=test` set via vitest config env
- Test helpers: `signUp()`, `signIn()`, `extractRefreshToken()`, `extractCookies()`, `cleanDb()` (truncates all tables between tests)

**New files:**
- `apps/api/src/app.ts` — Express app extracted for testability
- `apps/api/vitest.config.ts` — Vitest config (sequential, node env, test DB)
- `apps/api/src/tests/helpers.ts` — Shared test utilities
- `apps/api/src/tests/auth.test.ts` — Auth flow tests
- `apps/api/src/tests/sessions.test.ts` — Session management tests
- `apps/api/src/tests/notebooks.test.ts` — Notebooks CRUD tests
- `apps/api/src/tests/settings.test.ts` — Settings CRUD tests
- `apps/api/src/tests/oauth.test.ts` — OAuth callback tests

**Run with:** `npm test` (root) or `npm -w apps/api run test`

---

## Open Questions

*(Any unresolved questions that need user input)*
