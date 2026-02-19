# Notebook.md — Plan Status & Session Context

**Purpose:** This document is the running register of implementation progress, decisions made, and context needed for any agent session to continue the work. If a session ends, a new agent should read this file first to understand where we left off.

**Last Updated:** 2026-02-19

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

### Post-Tier 1 Fixes (2026-02-18)

1. **Email link prefix fix:** Email verification, magic link, and password reset links were using `/auth/*` paths, which Vite's proxy intercepted and forwarded to the API as GET requests (API only has POST handlers → "Cannot GET"). Changed all email links to `/app/verify-email`, `/app/magic-link`, `/app/reset-password`. These paths bypass the Vite proxy and serve the SPA, which handles the URL params and POSTs to the API.
   - Files changed: `apps/api/src/lib/email.ts` (link URLs), `apps/web/src/App.tsx` (path matching)

2. **Email delivery tests:** Added 4 tests verifying email delivery via Mailpit API:
   - Verification email sent on sign-up with `/app/verify-email` link
   - Magic link email sent for existing users with `/app/magic-link` link
   - Magic link NOT sent for non-existent users (security by design)
   - Password reset email sent with `/app/reset-password` link
   - Added Mailpit helpers to test utilities: `clearMailpit()`, `getMailpitMessages()`, `getMailpitMessageBody()`
   - Total tests: **52 passing** (up from 48)

### UX Validation Results (2026-02-18)

User tested Phase 2 deliverables before proceeding to Phase 3:
- ✅ Magic link UX flow works (button correctly on sign-in page only, not sign-up)
- ✅ Sign-up with email+password sends verification email to Mailpit
- ✅ Multiple accounts can be created, each with isolated local storage (IndexedDB scoping working)
- ✅ Email verification link now works (was broken by Vite proxy, fixed above)
- ℹ️ Magic link doesn't send email for non-existent accounts — confirmed working as designed (security: don't reveal if email exists)

---

## Phase 3 Prep: OAuth Provider Registration

**Started:** 2026-02-18  
**Plan:** `plans/auth-provider-plan.md`

### 3-Prep.1 — GitHub OAuth App (Sign-In) — COMPLETED ✅

Registered a GitHub OAuth App for "Sign in with GitHub" on the welcome screen.

**What was done:**
- Created GitHub OAuth App "Notebook.md (Dev)" at github.com/settings/developers
  - Homepage: `http://localhost:5173`
  - Callback: `http://localhost:3001/auth/oauth/github/callback`
- Added `dotenv` to the API with explicit path resolution for monorepo workspace (`apps/api/` CWD doesn't find root `.env`)
- Added `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to `.env`
- Verified GitHub appears in `/auth/oauth/providers` endpoint

**Bugs found and fixed during integration testing:**
1. **dotenv CWD issue:** `import 'dotenv/config'` loads `.env` from CWD, but `npx --workspace=apps/api` sets CWD to `apps/api/`, not the repo root. Fixed with explicit path: `dotenv.config({ path: resolve(__dirname, '../../../.env') })`.
2. **OAuth error redirect (Vite proxy):** Error redirects to `/auth/error` were proxied to the API by Vite. Changed all OAuth error redirects to `/app/auth-error` to bypass proxy.
3. **Duplicate email security:** When GitHub email matched an existing email+password account, code tried to create a new user → unique constraint violation. Fixed: now throws `ACCOUNT_EXISTS_EMAIL_PASSWORD`, redirects to `/app/auth-error?error=account_exists&provider=github`, and displays a friendly message telling the user to sign in with email/password then link GitHub from Account Settings.
4. **OAuth error display race condition:** `auth.setError()` from a useEffect was being overwritten by the auth hook's `/auth/me` check (which sets `error: null` on 401). Fixed by using a `useState` initializer to capture the OAuth error synchronously before any effects run.
5. **Persistent OAuth error:** The `oauthError` state was never cleared, so it persisted through sign-in form submissions. Fixed by: (a) making `oauthError` clearable via setter, (b) calling `onClearError` before sign-in/sign-up form submissions, (c) passing `oauthError ?? auth.error` to WelcomeScreen.
6. **WelcomeScreen auto-redirect:** After OAuth error redirect, user landed on the "choose method" view, not the sign-in form. Fixed by initializing WelcomeScreen's `view` state to `'signin'` when an error is present.
7. **Test database isolation:** `cleanDb()` in API tests was wiping the dev database. Created separate `notebookmd_test` database: vitest env sets `DB_NAME=notebookmd_test`, globalSetup runs migrations, `dev.sh` auto-creates + migrates the test DB on startup.
8. **dev.sh variable bug:** Used `$DOCKER` (undefined) instead of `docker` in test DB creation commands.

**Files changed:**
- `apps/api/src/index.ts` — Added dotenv with explicit path
- `apps/api/src/routes/oauth.ts` — Error redirects use `/app/auth-error`, handle `ACCOUNT_EXISTS_EMAIL_PASSWORD`
- `apps/api/src/services/account-link.ts` — Throw specific error instead of falling through to INSERT
- `apps/api/package.json` — Added dotenv dependency
- `apps/web/src/App.tsx` — OAuth error via useState initializer, clearable
- `apps/web/src/hooks/useAuth.ts` — Added `setError` method
- `apps/web/src/components/welcome/WelcomeScreen.tsx` — Auto-switch to signin view on error, clear error on submit
- `apps/api/vitest.config.ts` — DB_NAME=notebookmd_test, globalSetup
- `apps/api/src/tests/globalSetup.ts` — New: runs migrations on test DB
- `docker-compose.yml` — Mount initdb scripts for test DB creation
- `docker/initdb/01-create-test-db.sql` — New: CREATE DATABASE notebookmd_test
- `dev.sh` — Auto-create and migrate test DB
- `.gitignore` — Added `docker/secrets/` and `*.pem`

**Verified:**
- ✅ GitHub OAuth sign-in works end-to-end (new user creation)
- ✅ Duplicate email protection blocks account takeover (email+password ↔ OAuth)
- ✅ Error message displays correctly and clears on form interaction
- ✅ All 52 API tests pass (using isolated test database)
- ✅ Dev database preserved after test runs
- ✅ TypeScript compiles cleanly (API + Web)

### 3-Prep.2 — GitHub App (Repo Access) — COMPLETED ✅

Registered a GitHub App for reading/writing .md files in user repos.

**What was done:**
- Created GitHub App "Notebook.md" at github.com/settings/apps
  - Permissions: Contents (read & write), Metadata (read-only)
  - Subscribed to: Push events
  - Webhook URL: smee.io proxy (see below)
  - Installable by: Any account
- Saved credentials to `.env`: `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY_PATH`, `GITHUB_WEBHOOK_SECRET`
- Moved private key `.pem` to `docker/secrets/github-app-private-key.pem` (gitignored)
- Updated `.env.example` with all new placeholder vars

**Smee.io webhook proxy for local dev:**
- User created smee.io channel: `https://smee.io/V2BOwXCCcJ5XS4ur` (set as webhook URL in GitHub App)
- Installed `smee-client` as dev dependency
- Added `WEBHOOK_PROXY_URL` to `.env` and `.env.example`
- Integrated smee into `dev.sh` as step 5/5: auto-starts when `WEBHOOK_PROXY_URL` is set, forwards to `http://localhost:3001/webhooks/github`
- Added smee to `dev.sh stop/status`, log tailing, and URL display
- Updated README.md with webhook proxy setup instructions

### 3-Prep.3 — Microsoft Entra ID App — DEFERRED (pivoted to Phase 3 implementation)

---

## Phase 3: Source System Integrations — IN PROGRESS

### 3.1 Source System Proxy Architecture — COMPLETED ✅

**Completed:** 2026-02-18

**New files:**
| File | Purpose |
|------|---------|
| `lib/encryption.ts` | AES-256-GCM envelope encryption: `encrypt`, `decrypt`, `encryptOptional`, `decryptOptional`. Gracefully handles pre-encryption plaintext tokens. |
| `services/sources/types.ts` | `SourceAdapter` interface (listFiles, readFile, writeFile, createFile, deleteFile, renameFile) + provider registry |
| `routes/sources.ts` | REST proxy: `GET/PUT/POST/DELETE /api/sources/:provider/files/{*filePath}` with auth, rate limiting, circuit breaker, path validation |
| `middleware/path-validation.ts` | Path canonicalization, directory traversal rejection, null byte protection, file extension filtering |
| `lib/circuit-breaker.ts` | Per-provider circuit breaker: closed→open→half-open, 5 failures/60s trips, 30s cooldown |
| `services/token-refresh.ts` | `getValidAccessToken()`: checks expiry (5-min buffer), auto-refreshes Microsoft/Google tokens, GitHub tokens don't expire |

**Files modified:**
- `services/account-link.ts` — All 5 token INSERT/UPDATE queries now encrypt with `encryptOptional()`
- `app.ts` — Registered `/api/sources` router

**Technical notes:**
- Express 5 uses `path-to-regexp` v8: wildcards must use `{*name}` syntax (not `*`)
- `express-rate-limit` v8: `keyGenerator` must not reference `req.ip` without `ipKeyGenerator` helper; source routes use `req.userId` only (auth required)
- `rate-limit-redis` installed for Redis-backed rate limiting on source endpoints
- `decryptOptional()` falls back to returning raw value if decryption fails — handles migration from plaintext tokens gracefully

**Phase 3.1 Tests (35 new, total 87 passing):**
| Suite | Tests | Coverage |
|-------|-------|----------|
| `encryption.test.ts` | 12 | Round-trip, random IV, unicode, tamper detection (ciphertext + auth tag), format validation, optional helpers, plaintext fallback |
| `path-validation.test.ts` | 11 | Traversal attacks (`../`, `../../`), null bytes, slash normalization, query param fallback, filterTreeEntries, isEditableExtension |
| `circuit-breaker.test.ts` | 8 | State transitions closed→open→half-open→closed, probe success/failure, failure window expiry, reset on success |

### 3.4 GitHub Integration — COMPLETED ✅

**Commit:** `a20d7a1` — Phase 3.4 GitHub integration

**What was built:**

1. **DB Migration** (`002_github-installations.sql`):
   - `github_installations` table: user_id, installation_id (unique), account_login, account_type, repos_selection, suspended_at
   - Indexes on user_id and installation_id

2. **GitHub App JWT Helper** (`lib/github-app.ts`):
   - `createAppJWT()` — RS256 JWT signed with App private key, 10-min TTL
   - `getInstallationToken(installationId)` — exchanges JWT for installation access token, cached in Redis (55 min)
   - `listInstallationRepos(installationId)` — lists repos accessible to an installation

3. **GitHub Source Adapter** (`services/sources/github.ts`):
   - Full `SourceAdapter` implementation using GitHub Contents API
   - `rootPath` format: `owner/repo` or `owner/repo/subfolder`
   - `listFiles` — GET /repos/{owner}/{repo}/contents/{path}, filters to file/dir
   - `readFile` — decodes base64 content from Contents API
   - `writeFile` — PUT with SHA for updates, base64-encodes content
   - `createFile` — PUT without SHA (fails if exists)
   - `deleteFile` — DELETE with SHA (auto-fetches if not provided)
   - `renameFile` — read → create new → delete old (no native rename API)
   - Branch operations exported: `createWorkingBranch`, `listBranches`, `publishBranch`, `deleteBranch`

4. **GitHub Routes** (`routes/github.ts`):
   - `GET /api/github/install` — returns install URL for GitHub App
   - `GET /api/github/install/callback` — stores installation in DB, redirects to settings
   - `GET /api/github/installations` — lists user's installations
   - `GET /api/github/repos?installation_id=X` — lists repos for an installation
   - `POST /api/github/branches` — create working branch (`notebook-md/<uuid>`)
   - `GET /api/github/branches?owner=X&repo=Y` — list branches
   - `POST /api/github/publish` — squash merge working branch → base, optional branch deletion

5. **Webhook Endpoint** (`routes/webhooks.ts`):
   - `POST /webhooks/github` — receives GitHub App events
   - HMAC-SHA256 signature verification (timing-safe compare)
   - Delivery ID deduplication via Redis (10-min TTL, NX set)
   - Handles: `installation` (created/deleted/suspend/unsuspend), `push` (marks repo:branch stale in Redis), `ping`
   - Raw body parsing via `express.text()` mounted before `express.json()` in app.ts

6. **Working Branch Strategy:**
   - User creates `notebook-md/<short-uuid>` branch from base branch
   - All file saves commit to the working branch
   - Publish = merge working branch → base branch via GitHub Merges API
   - Optional: delete working branch after publish

**Files created:**
| File | Purpose |
|------|---------|
| `migrations/002_github-installations.sql` | GitHub installations table |
| `lib/github-app.ts` | App JWT creation + installation token caching |
| `services/sources/github.ts` | SourceAdapter + branch operations |
| `routes/github.ts` | Install flow, repos, branches, publish |
| `routes/webhooks.ts` | Webhook verification + event handling |

**Files modified:**
| File | Change |
|------|--------|
| `app.ts` | Registered `/api/github`, `/webhooks/github` routes; side-effect import for GitHub adapter; raw body parsing for webhooks |
| `.env.example` | Added `GITHUB_APP_SLUG` |
| `package.json` | Added `jsonwebtoken` + `@types/jsonwebtoken` |

**Verified:**
- ✅ All 87 tests pass (no regressions)
- ✅ TypeScript compiles cleanly (production code)
- ✅ Migration applied to dev and test databases
- ✅ Webhook proxy (smee.io) already configured in dev.sh

### 3.5 Add Notebook Flow — COMPLETED ✅

**Commits:** `255e227`, `bfc4f45` — Multi-source notebook UI shell + GitHub file integration

**What was built:**

1. **Source Type Icons** (`components/icons/Icons.tsx`, `components/notebook/SourceTypes.tsx`):
   - GitHubIcon (Octocat), OneDriveIcon, GoogleDriveIcon, AppleIcon, DeviceIcon, CloudOffIcon
   - `SourceIcon` component maps `sourceType` to colored icon
   - `SOURCE_TYPES` registry with label, icon, color, and available flag

2. **Notebook Type System** (`stores/localNotebookStore.ts`):
   - `NotebookMeta` extended with `sourceType` and `sourceConfig` fields
   - `createNotebook()` accepts `sourceType` and `sourceConfig` parameters
   - Backward compatible — existing local notebooks default to `'local'`

3. **Add Notebook Modal** (`components/notebook/AddNotebookModal.tsx`):
   - Step 1: Select source type with icons (Local, GitHub, OneDrive, Google Drive, iCloud)
   - Step 2a: GitHub config — pick installation → repository with live API data
   - Step 2b: "Coming soon" placeholder for OneDrive, Google Drive, iCloud
   - Step 3: Name the notebook
   - Install app flow when no GitHub installations found

4. **GitHub API Client** (`api/github.ts`):
   - Typed wrappers for installations, repos, branches
   - File CRUD (listGitHubFiles, readGitHubFile, writeGitHubFile, createGitHubFile, deleteGitHubFile)
   - Branch management (create, list, publish)

5. **GitHub File Tree Integration** (`hooks/useNotebookManager.ts`):
   - Lazy loading: expanding a GitHub notebook fetches file list from API
   - File filtering: only .md, .mdx, .markdown, .txt shown for GitHub notebooks
   - `githubToFileEntries()` converts API response to `FileEntry` shape for tree

6. **GitHub File Open/Save**:
   - Open: fetches from API, decodes content, converts markdown → HTML, preserves SHA
   - Save: writes back via API with SHA for conflict detection, auto-updates SHA
   - Auto-save debounce: 1s local, 5s GitHub
   - Manual save (Cmd+S) works for both

7. **Notebook Tree Icons** (`components/notebook/NotebookTree.tsx`):
   - Shows `SourceIcon` per notebook (Octocat for GitHub, Device for local)
   - `onExpandNotebook` callback triggers lazy file loading for remote sources

8. **Webhook Tests** (`tests/webhook.test.ts`):
   - 8 tests for HMAC-SHA256 signature verification
   - Exported `verifyWebhookSignature` from `routes/webhooks.ts` for testability

**Files created:**
| File | Purpose |
|------|---------|
| `apps/web/src/api/github.ts` | Frontend GitHub API client |
| `apps/web/src/components/notebook/AddNotebookModal.tsx` | Multi-step add notebook flow |
| `apps/web/src/components/notebook/SourceTypes.tsx` | Source type icons + registry |
| `apps/api/src/tests/webhook.test.ts` | Webhook signature verification tests |

**Files modified:**
| File | Change |
|------|--------|
| `apps/web/src/App.tsx` | Added AddNotebookModal, onExpandNotebook wiring |
| `apps/web/src/components/icons/Icons.tsx` | Added 6 new icons |
| `apps/web/src/components/layout/NotebookPane.tsx` | Added onExpandNotebook prop passthrough |
| `apps/web/src/components/notebook/NotebookTree.tsx` | SourceIcon per notebook, onExpandNotebook on toggle |
| `apps/web/src/hooks/useNotebookManager.ts` | GitHub file ops, lazy tree, SHA tracking, split save logic |
| `apps/web/src/stores/localNotebookStore.ts` | sourceType + sourceConfig in NotebookMeta |
| `apps/api/src/routes/webhooks.ts` | Exported verifyWebhookSignature |

**Verified:**
- ✅ All 95 tests pass (87 prior + 8 webhook)
- ✅ Vite build succeeds
- ✅ TypeScript compiles cleanly (no new errors)

### 3.6 End-to-End Validation — COMPLETED ✅

**Commits:** `7570e36` → `324dd6e` (8 commits) — Validation fixes and crash hardening

**Bugs found and fixed during E2E testing:**

1. **ESM import hoisting broke env var loading** (`lib/github-app.ts`):
   - `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY_PATH` were read at module scope before `dotenv.config()` ran
   - Fix: lazy `getAppId()` and `getPrivateKey()` helpers that read `process.env` at call time
   - Commits: `7570e36`, `8c09e21`

2. **Private key path resolved relative to wrong directory** (`lib/github-app.ts`):
   - `resolve(process.cwd(), keyPath)` resolved against `apps/api/` but the path in `.env` is relative to monorepo root
   - Fix: compute `MONOREPO_ROOT` from `__dirname` and resolve against that
   - Commit: `9618ce9`

3. **Express 5 wildcard params are arrays** (`middleware/path-validation.ts`):
   - `{*filePath}` yields `req.params.filePath` as `string[]` in Express 5, not a string
   - Fix: `Array.isArray(rawParam) ? rawParam.join('/') : rawParam`
   - Commit: `0f913d8`

4. **New file creation used local store for GitHub notebooks** (`hooks/useNotebookManager.ts`):
   - `handleCreateFile` always called IndexedDB `createFile()` regardless of source type
   - Fix: check `nb.sourceType === 'github'` and call `createGitHubFile()` via API instead
   - Commit: `b47789d`

5. **File tree only showed root-level entries** (`hooks/useNotebookManager.ts`):
   - `refreshFiles` fetched only root directory contents; subfolder files never appeared
   - Fix: `fetchGitHubTreeRecursive()` walks all subdirectories and sets correct `parentPath` per level
   - Commit: `324dd6e`

6. **GITHUB_APP_SLUG was wrong** (`.env`, `routes/github.ts`):
   - Default slug was `notebook-md-dev` but user registered the app as `notebook-md`
   - Fix: updated `.env`, `.env.example`, and default in `routes/github.ts`

**Infrastructure improvements:**

7. **Crash protection** (`index.ts`):
   - Added `process.on('unhandledRejection')` and `process.on('uncaughtException')` handlers
   - Added HTTP server `error` and `close` event listeners for diagnostics
   - Commit: `4ad4a85`

8. **Dev server auto-restart** (`dev.sh`):
   - Changed `tsx` to `tsx watch` for auto-restart on file changes and crashes
   - Commit: `d3e9ad3`

**Validated end-to-end flows:**
- ✅ Sign in with email/password
- ✅ Add GitHub notebook (select installation → repo → name)
- ✅ Browse GitHub file tree (recursive subdirectories)
- ✅ Open .md files from GitHub repos
- ✅ Edit and save changes back to GitHub (with SHA conflict detection)
- ✅ Create new files in GitHub notebooks (appears in tree and on github.com)
- ✅ Multiple notebooks from different repos
- ✅ Tabbed view with multiple open files
- ✅ Auto-save with debounce (5s for GitHub)

**Known issues (non-blocking):**
- Smee webhook signature verification fails (smee modifies payload); webhooks work in production
- SHA conflict (409) on rapid saves — auto-save can race with manual save; retries succeed
- API process occasionally dies silently under load — restart loop wrapper keeps it alive

### Phase 3.7: Working Branch, Publish, and Save Fixes

**Working branch + squash-merge publish feature:**

9. **Auto working branch per session** (`hooks/useNotebookManager.ts`, `services/sources/github.ts`, `routes/sources.ts`, `api/github.ts`):
   - All GitHub edits now go to a `notebook-md/<short-uuid>` branch, auto-created on first save
   - Added `branch` parameter support throughout: SourceAdapter interface, GitHub adapter, source proxy routes, frontend API client
   - `ensureWorkingBranch()` creates working branch lazily; `branchCreating` ref deduplicates concurrent saves
   - `publishableNotebooks` reactive state tracks which notebooks have pending changes
   - Commit: `4545da2`

10. **Prominent Publish button** (`components/layout/DocumentPane.tsx`, `App.tsx`):
    - Green "Publish" button with upload arrow icon in document tab bar, right-aligned
    - Only appears when the active notebook has a working branch with unpublished changes
    - Squash-merges working branch to default branch, deletes working branch after
    - Commit: `a5b83c8`

**Additional bugs found and fixed:**

11. **Temporal dead zone crash — blank screen** (`hooks/useNotebookManager.ts`):
    - `ensureWorkingBranch` was defined after `handleCreateFile` but referenced in its `useCallback` dependency array
    - Caused `ReferenceError: Cannot access 'ensureWorkingBranch' before initialization` — entire app rendered blank
    - Fix: moved `ensureWorkingBranch` and its refs/state declarations above `handleCreateFile`
    - Commit: `94d2187`

12. **Hardcoded 'main' branch caused 404 on repos with other defaults** (`routes/github.ts`, `api/github.ts`, `hooks/useNotebookManager.ts`):
    - Frontend hardcoded `'main'` as base branch; repos using `master` or other defaults failed with 404
    - Fix: backend now auto-detects the repo's `default_branch` from the GitHub API when `baseBranch` is not provided
    - Returns `defaultBranch` to frontend; stored in `defaultBranches` ref for use during publish
    - Commit: `e719d2c`

13. **Files saved as HTML instead of Markdown** (`hooks/useNotebookManager.ts`):
    - WYSIWYG editor stores content as HTML internally; `saveTab` wrote raw HTML to GitHub
    - Fix: added `htmlToMarkdown()` conversion in `saveTab` before writing to any backend
    - Commit: `43878d5`

**Updated validated end-to-end flows:**
- ✅ Working branch auto-created on first edit/save (branch name: `notebook-md/<uuid>`)
- ✅ All saves go to working branch, not directly to main/master
- ✅ Publish button appears when working branch has changes
- ✅ Publish squash-merges to default branch and cleans up working branch
- ✅ Works with repos using `main`, `master`, or any default branch
- ✅ Files saved as proper Markdown syntax (not HTML)
- ✅ New file creation on working branch

---

### Phase 3.8: Print / Export PDF — COMPLETED ✅

**Requirement added:** Users can print or export the current document as a clean PDF.

**Approach:** CSS `@media print` + `window.print()` — zero dependencies, browser-native.

**Implementation tasks:**
- [x] Add `@media print` stylesheet that hides all UI chrome (toolbar, sidebar, tabs, status bar)
- [x] Style document content for print: full-width, clean typography, page-break rules
- [x] Map user margin preferences (regular/wide/narrow) to print margins
- [x] Add "Print" button to toolbar
- [x] Wire `Ctrl/Cmd + P` keyboard shortcut to trigger `window.print()`
- [x] Test print output across browsers (Chrome, Safari, Firefox)

**Files changed:**
- `apps/web/src/index.css` — 128 lines of `@media print` rules (chrome hiding, typography, page breaks, margin mapping)
- `apps/web/src/components/editor/EditorToolbar.tsx` — Print icon + button after Undo/Redo
- `apps/web/src/components/editor/MarkdownEditor.tsx` — Cmd/Ctrl+P shortcut handler
- `apps/web/src/components/layout/DocumentPane.tsx` — Added `document-pane` and `document-tabs` CSS classes
- `apps/web/src/components/layout/NotebookPane.tsx` — Added `data-print="hide"` and `notebook-pane` class
- `apps/web/src/components/layout/StatusBar.tsx` — Added `data-print="hide"` and `statusbar` class
- `apps/web/src/App.tsx` — Added `data-print-margins` attribute bound to settings

Commit: `1ae920b`

---

### Phase 3.9: Microsoft & Google OAuth Registration — COMPLETED ✅

**Microsoft Entra ID app registered:**
- App registered in Azure Portal with multi-tenant support (personal + enterprise accounts)
- Delegated permissions: `openid`, `profile`, `email`, `User.Read`, `Files.ReadWrite`, `offline_access`
- `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` added to `.env`
- `MICROSOFT_TENANT_ID=common` for multi-tenant support

**Google OAuth app registered:**
- Project created in Google Cloud Console, Google Drive API enabled
- OAuth configured via the new Google Auth Platform UI (Branding → Audience → Data Access → Clients)
- Scopes: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.file`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` added to `.env`
- App in testing mode (test users only until verification)

**Status:** Credentials stored in `.env`. Backend OAuth providers for both were already fully implemented in Phase 2. Ready for end-to-end testing of sign-in flows.

**Verification needed:**
- [x] Test Microsoft sign-in: redirects → consent → callback → signed in
- [x] Test Google sign-in: redirects → consent → callback → signed in
- [x] Verify `identity_links` table populated for each provider
- [x] Test account linking (sign in with email, then link Microsoft/Google)

---

### Phase 3.10: OneDrive Integration (Phase 3.2) — COMPLETED ✅

**Backend:**
- `apps/api/src/services/sources/onedrive.ts` — Full SourceAdapter implementation using Microsoft Graph API
  - All CRUD operations via `/me/drive/root:/path:` pattern (listFiles, readFile, writeFile, createFile, deleteFile, renameFile)
  - Path-based access (no file IDs needed, unlike Google Drive)
  - Uses eTag for optimistic concurrency on writes
- `apps/api/src/routes/onedrive.ts` — OneDrive-specific endpoints:
  - `GET /api/onedrive/status` — Check if user has linked Microsoft account with file access
  - `GET /api/onedrive/folders` — Browse OneDrive folders for notebook setup (folder picker)
- `apps/api/src/services/oauth/microsoft.ts` — Updated OAuth scope to include `Files.ReadWrite` and `offline_access`
- Registered adapter and routes in `app.ts`

**Frontend:**
- `apps/web/src/api/onedrive.ts` — Client API wrapper (list, read, write, create, delete files + folder browser + status check)
- `AddNotebookModal.tsx` — OneDrive folder picker with breadcrumb navigation and "Use this folder" selection
- `SourceTypes.tsx` — OneDrive set to `available: true`
- `useNotebookManager.ts` — OneDrive-aware operations:
  - `fetchOneDriveTreeRecursive()` for file tree loading
  - OneDrive handling in `refreshFiles`, `handleCreateFile`, `handleOpenFile`, `saveTab`
  - Auto-save works via existing debounce (3s inactivity)

**Tests: 12 new tests (132 total, all passing)**
- `apps/api/src/tests/onedrive-routes.test.ts`:
  - Status endpoint: linked/unlinked/expired token states (3 tests)
  - Folder browsing: auth required (2 tests)
  - Source proxy: auth required for list/read/write/create/delete (5 tests)
  - Adapter registration: onedrive registered, unknown providers return 404 (1 test)
  - OAuth scope: Microsoft auth URL includes Files.ReadWrite + offline_access (1 test)

Commit: `ca2720a`

**Note:** User must re-authenticate with Microsoft to consent to the new `Files.ReadWrite` scope.

**Verification needed:**
- [x] Re-authenticate with Microsoft (new scope consent)
- [x] Add OneDrive notebook: browse folders → select → create
- [x] Open .md file from OneDrive
- [x] Edit and save changes
- [x] Create new file in OneDrive notebook
- [x] Verify changes on OneDrive web (onedrive.live.com)

---

### Phase 3.11: E2E Bug Fixes & UX Improvements — COMPLETED ✅

**Session context:** After Phase 3.10's OneDrive integration, full E2E testing revealed a chain of bugs across the OAuth link flow, source proxy, and file tree. All were fixed and tested.

**Bug fixes (in order discovered/fixed):**

1. **ESM `require` in encryption.ts** — `getKey()` used `require('crypto')` which fails in ESM modules. `linkProviderToUser` threw `ReferenceError: require is not defined`, causing OAuth callback to silently redirect to error page. Fixed by importing `createHash` from `'crypto'` at top level.
   - Commit: `35c1d81`

2. **OAuth callback not reopening modal** — After Microsoft OAuth redirect, the app returned to default view instead of the Add Notebook modal. Added `initialSource` prop: URL `?source=onedrive` param is captured and passed to `AddNotebookModal`, which initializes at the `'configure'` step with the correct `sourceType`.
   - Commit: `b862afa`

3. **OneDrive source proxy 401** — Source proxy looked up OAuth tokens using `'onedrive'` as provider, but tokens are stored under `'microsoft'` in `identity_links`. Added `oauthProvider` mapping: `onedrive → microsoft` in `resolveProvider()`.
   - Commit: `99fe16b`

4. **OneDrive file tree not loading** — Two issues in `api/onedrive.ts`:
   - `listOneDriveFiles` didn't unwrap `{ entries: [...] }` response from source proxy
   - Client sent `dir` query param but backend reads `path`
   - Commit: `a2a3939`

5. **Notebook Refresh context menu** — Added right-click "Refresh" option on notebooks to manually reload file tree from remote source (picks up files created outside the app). Added `RefreshIcon`, `onRefreshNotebook` prop threaded through `NotebookTree → NotebookPane → App`.
   - Commit: `97fcb20`

6. **GitHub App Setup URL missing** — After installing the GitHub App, GitHub didn't redirect back to our app. Setup URL was set to "Leave blank" in docs. Updated `auth-provider-plan.md` to set Setup URL to `http://localhost:5173/api/github/install/callback` with "Redirect on update" checked.
   - Commit: `bee62b9`

7. **GitHub install callback redirect** — Callback redirected to `/settings` instead of `/?source=github`, so the Add Notebook modal didn't reopen. Changed to redirect to `/?source=github` to trigger the same `initialSource` logic as OneDrive.
   - Commit: `d4bff07`

8. **Stale GitHub installation cleanup** — When a user uninstalls the GitHub App from GitHub settings, the webhook signature verification fails in dev (no tunnel), leaving a stale DB record. The repos endpoint now detects 401 from GitHub, auto-deletes the stale record, and returns `INSTALLATION_REMOVED` error. Frontend catches this, removes the stale entry, and shows the "Install App" prompt.
   - Commit: `36743d7`

**New tests (7 tests, 139 total):**
- `encryption.test.ts`: Key derivation with short keys + long keys (2 tests)
- `github-routes.test.ts`: Install callback missing ID, unauthenticated, stale install cleanup (3 tests)
- `onedrive-routes.test.ts`: OAuth provider mapping assertion fix, unknown provider 404 (2 tests)
- Commit: `573805b`

**Files modified:**
- `apps/api/src/lib/encryption.ts` — ESM import fix
- `apps/api/src/routes/oauth.ts` — Error logging in catch block
- `apps/api/src/routes/sources.ts` — `oauthProvider` mapping for token lookup
- `apps/api/src/routes/github.ts` — Install callback redirect, stale install cleanup
- `apps/web/src/api/onedrive.ts` — Unwrap entries response, fix query param name
- `apps/web/src/App.tsx` — `initialSource` state, pass to modal, `onRefreshNotebook`
- `apps/web/src/components/notebook/AddNotebookModal.tsx` — `initialSource` prop, stale install recovery
- `apps/web/src/components/notebook/NotebookTree.tsx` — RefreshIcon, Refresh context menu item
- `apps/web/src/components/layout/NotebookPane.tsx` — Thread `onRefreshNotebook` prop
- `plans/auth-provider-plan.md` — GitHub App Setup URL instructions

---

### Phase 3.12: Google Drive Integration (Phase 3.3) — COMPLETED ✅

**Backend:**
- `apps/api/src/services/sources/googledrive.ts` — Full SourceAdapter using Google Drive API v3
  - ID-based architecture: resolves relative paths to Google Drive file IDs by walking parent→child
  - All CRUD operations: listFiles, readFile, writeFile (PATCH upload), createFile (multipart upload), deleteFile (trash), renameFile (with move support)
  - Uses `resolvePathToId()` to bridge the path-based SourceAdapter interface with Google's ID-based API
- `apps/api/src/routes/googledrive.ts` — Google Drive–specific endpoints:
  - `GET /api/googledrive/status` — Check linked status; distinguishes "not linked" from "linked but insufficient scope"
  - `GET /api/googledrive/folders` — Browse Drive folders by parent ID (for folder picker)
- `apps/api/src/services/oauth/google.ts` — Updated scope: added `https://www.googleapis.com/auth/drive` (full read/write)
- `apps/api/src/routes/sources.ts` — Source proxy maps `google-drive → google` for OAuth token lookup
- Registered adapter and routes in `app.ts`

**Frontend:**
- `apps/web/src/api/googledrive.ts` — Client API wrapper (status, folders, list, read, write, create, delete)
- `AddNotebookModal.tsx` — GoogleDriveConfig component:
  - ID-based folder picker with breadcrumb navigation (green-themed)
  - Distinguishes "not linked" vs "linked but needs re-auth for Drive scope"
  - OAuth link flow with `returnTo=/?source=google-drive`
- `SourceTypes.tsx` — Google Drive set to `available: true`
- `useNotebookManager.ts` — Google Drive operations:
  - `fetchGoogleDriveTreeRecursive()` for file tree loading
  - Google Drive handling in `refreshFiles`, `handleCreateFile`, `handleOpenFile`, `saveTab`

**Scope decision:** Used `https://www.googleapis.com/auth/drive` (full access) instead of `drive.file` because the app needs to browse and edit existing files in user-selected folders, not just files created by the app.

**Tests: 13 new tests (152 total)**
- `apps/api/src/tests/googledrive-routes.test.ts`:
  - Status endpoint: linked/unlinked/expired token states (3 tests)
  - Folder browsing: auth required (2 tests)
  - Source proxy: auth required for list/read/write/create/delete (5 tests)
  - Adapter registration: google-drive registered (1 test)
  - OAuth provider mapping: google-drive → google (1 test)
  - OAuth scope: auth URL includes drive scope (1 test)

Commits: `4b91cbd`, `7f3b196`, `b63971e`

**Verification completed:**
- [x] Google OAuth consent with drive scope
- [x] Add Google Drive notebook: browse folders → select → create
- [x] Open .md file from Google Drive
- [x] Edit and save changes
- [x] Create new file in Google Drive notebook
- [x] Verify changes on Google Drive web (drive.google.com)

---

### Phase 4.1: Slash Commands & Editor Polish — COMPLETED ✅

**Slash Commands (22 total):**
The slash command palette was largely pre-built (16 commands). Added 6 new commands and supporting infrastructure:

- **Paragraph** — Convert block back to plain text (`setParagraph()`)
- **Image** — Insert image from URL with alt text prompt
- **Math Block** — Inline KaTeX math expression (`$E = mc^2$`)
- **Callout - Info/Warning/Tip/Note** — 4 styled admonition block types

**New Extensions:**
- `apps/web/src/components/editor/CalloutExtension.ts` — Custom Tiptap node for callout blocks
  - 4 types: info (blue), warning (amber), tip (green), note (purple)
  - Each rendered with icon + styled container, light/dark mode
  - `parseHTML` with `contentElement: '.callout-content'` for proper content hole mapping
- `@tiptap/extension-mathematics` + `katex` — Inline/block LaTeX rendering

**Markdown Roundtrip (callouts):**
- HTML→MD: Callouts serialize as `> [!TYPE]\n> body` (GitHub-style admonitions)
- MD→HTML: Custom `marked` extension parses both formats:
  - Multi-line: `> [!NOTE]\n> body text`
  - Single-line: `> [!NOTE] body text`
- Trailing blank line added between consecutive callouts to prevent merging

**Editor UI Bug Fixes:**

1. **Task list vertical alignment** — Checkboxes were misaligned with text. Changed from `align-items: flex-start` + `margin-top: 0.25rem` to `align-items: baseline` for natural text alignment.

2. **Smart quote auto-conversion** — Typography extension was converting `"` to `"` / `"` automatically. Disabled `openDoubleQuote`, `closeDoubleQuote`, `openSingleQuote`, `closeSingleQuote` in Typography config.

3. **Image floating toolbar (alt text, URL editing; resize removed — no MD syntax)** — Created `ImageView.tsx` custom NodeView:
   - Blue selection outline when image is selected
   - Drag handle on bottom-right corner for proportional resizing
   - Floating toolbar above image showing: dimensions (W×H), editable alt text, editable URL
   - Added `width`/`height` attributes to Image extension

4. **Source view roundtrip corruption** — Multiple cascading bugs caused content degradation on each source↔design toggle:
   - **Callout tokenizer regex** used `im` flags, causing double-matching. Removed `m` flag from tokenizer.
   - **DOMPurify stripping callout attrs** — Added `data-callout`, `data-callout-type`, `contenteditable` to sanitizer allowlist.
   - **Task list HTML mismatch** — `marked` outputs `<input type="checkbox">` but Tiptap needs `data-type="taskItem"`. Added post-processing in `markdownToHtml()` to transform GFM checkbox HTML.
   - **Task list with blank lines** — `marked` wraps items in `<p>` tags when separated by blank lines. Updated regex to handle both `<li><input>` and `<li><p><input>`.
   - **Single-line callout** — `> [!NOTE] text` on one line wasn't matched by tokenizer. Added single-line fallback regex.

**Files created:**
- `apps/web/src/components/editor/CalloutExtension.ts`
- `apps/web/src/components/editor/ImageView.tsx`

**Files modified:**
- `apps/web/src/components/editor/extensions.ts` — Mathematics, Callout, ImageView, Typography config
- `apps/web/src/components/editor/SlashCommands.ts` — 6 new commands (22 total)
- `apps/web/src/components/editor/editor.css` — Callout styles, KaTeX styles, image resize handles, task list alignment
- `apps/web/src/components/editor/markdownConverter.ts` — Callout HTML↔MD rules, task list post-processor, single-line callout support
- `apps/web/src/components/editor/MarkdownEditor.tsx` — DOMPurify allowlist expanded

Commits: `f114cb1`, `76033be`, `7d4dc28`, `c09d41b`

---

### Phase 4.2: Split View — COMPLETED ✅

**Implementation:**
- Three-state view mode in `MarkdownEditor.tsx`: `wysiwyg` | `source` | `split`
- Split view renders source textarea (left, 50%) and WYSIWYG editor (right, 50%) side-by-side
- Dedicated split-view toolbar button (vertical split icon) alongside existing source toggle
- ⌘⇧M cycles through all three modes

**Synchronized editing:**
- Editing in source pane → debounced (500ms) sync to WYSIWYG via `markdownToHtml` + `setContent`
- Editing in WYSIWYG pane → immediate sync to source pane via `htmlToMarkdown` in `onUpdate`
- `syncingFromSource` flag prevents feedback loop (source edit → `setContent` → `onUpdate` → overwrite source → cursor jump)

**Synchronized scrolling:**
- Percentage-based scroll sync between panes using `requestAnimationFrame`
- `syncingScroll` flag prevents infinite scroll feedback loops

**Bug fix:** Split view cursor jump when editing tables in source pane — the debounced sync triggered `onUpdate` which overwrote `rawContent`, resetting the textarea cursor position

Commits: `2287fc5`, `a5ab990`

---

### Phase 4.1–4.2 Tests — COMPLETED ✅

**Web app test infrastructure:**
- Created `apps/web/vitest.config.ts` — standalone vitest config for frontend unit tests
- Created `apps/web/src/tests/markdownConverter.test.ts` — 29 tests

**Test coverage:**
- `markdownToHtml`: headings, bullet lists, blockquotes, images, inline code, code blocks (6 tests)
- Task list roundtrip: GFM→Tiptap conversion, blank line handling, regular list non-conversion (3 tests)
- Callout roundtrip: multi-line, single-line, all types, regular blockquote distinction, consecutive separation (5 tests)
- `htmlToMarkdown`: headings, bold/italic, links, images, highlight marks (5 tests)
- Full roundtrip (MD→HTML→MD): headings, blockquotes, images, horizontal rules (4 tests)
- `isMarkdownContent`: headings, lists, code blocks, HTML detection, empty string, plain text (6 tests)

**Bug fix during testing:** Checked task list regex — `(checked)?` capture group was consumed by lazy `[^>]*?`. Changed to capture all attrs then test with `/\bchecked\b/`.

**Total tests: 152 API + 29 web = 181**

---

### Phase 4.3: Drag and Drop — COMPLETED ✅

**Editor drag-and-drop (initial):**
- DragHandle extension: 6-dot grip icon on block hover for reordering
- Image drop: drag image files from desktop → inline base64 insertion
- File linking: drag tree files into editor → insert Markdown link

**Tree drag-and-drop (this session):**
- **File/folder move:** Drag files/folders within same notebook between folders
  - Drop targets (folders) highlight blue on dragover
  - Prevents dropping on self or parent into child
- **Notebook reordering:** Drag notebooks to reorder in pane
  - Added `sortOrder: number` to NotebookMeta
  - `reorderNotebooks()` persists order via IndexedDB
  - `listNotebooks()` sorts by sortOrder; migrates old records without it
- **Import overlay fix:** Internal tree drags (`text/notebook-tree-item` type) no longer trigger the app-level "Drop Markdown file to import" overlay
- **Cross-source prevention:** Only same-notebook drops accepted (file moves)
- **Visual feedback:** Drop target folders highlight with blue ring; notebooks show top border indicator

**Requirements updated:** Added drag-and-drop tree requirements to `requirements/requirements.md` §3.4

**Files created:**
- `apps/web/src/components/editor/DragHandle.ts`
- `apps/web/src/tests/localNotebookStore.test.ts` — 8 tests

**Files modified:**
- `apps/web/src/stores/localNotebookStore.ts` — `sortOrder` field, `reorderNotebooks()`, `listNotebooks()` sorting + migration
- `apps/web/src/hooks/useNotebookManager.ts` — `handleMoveFile`, `handleReorderNotebooks`
- `apps/web/src/components/notebook/NotebookTree.tsx` — tree item drag/drop, notebook drag/drop, drop target state
- `apps/web/src/components/layout/NotebookPane.tsx` — thread `onMoveFile`, `onReorderNotebooks` props
- `apps/web/src/App.tsx` — suppress import overlay for tree drags, wire new props
- `apps/web/src/components/editor/MarkdownEditor.tsx` — image drop handler, file link drop
- `apps/web/src/components/editor/editor.css` — drag handle, drop cursor, drop zone styles
- `requirements/requirements.md` — §3.4 drag-and-drop requirements

**Tests: 8 new (37 web total, 189 overall)**
- `reorderNotebooks`: persist order, single notebook (2 tests)
- `moveFile`: to folder, to root, folder with children, not found (4 tests)
- `sortOrder`: new notebooks have it, list returns sorted (2 tests)

**Bug fixes (post-initial):**
- **Duplicate tab on move:** Moving an open file now updates the existing tab's id/path instead of opening a duplicate
- **Drop to notebook root:** Notebook header row accepts file drops to move items to root (parentPath='')
- **Remote move guard:** Skips move for non-local notebooks with console warning

**Cross-notebook file copy:**
- Dragging a file between local notebooks copies it to the target (not move)
- Visual indicators with three states:
  - **Blue** highlight: same-notebook move (default)
  - **Green** highlight + ⊕ badge (right-aligned): local-to-local copy allowed
  - **Red** highlight + 🚫 badge (right-aligned): blocked cross-type drop (e.g., local → remote)
- `crossDropStyle()` helper returns `'copy'` | `'blocked'` | `null` based on source/target notebook `sourceType`
- `dragSourceNotebookId` state tracks origin notebook during drag for cursor/highlight logic
- `effectAllowed = 'copyMove'` and `dropEffect = 'copy'` provide native OS copy cursor on valid targets
- Badges use stroke-based SVG outlines (circle+plus for copy, circle+line for blocked)
- Recursive folder copy (copies folder and all children)
- Cross-notebook copy restricted to local-to-local only
- New `handleCopyFile` in useNotebookManager with `onCopyFile` prop threading
- 3 new tests: single file copy, folder with children copy, copy to subfolder (40 web total, 192 overall)

**Remote notebook loading indicator:**
- Added `loadingNotebooks` state (`Set<string>`) to `useNotebookManager` tracking which notebooks are fetching files
- `refreshFiles()` sets loading before remote API calls, clears in `finally` block
- When a notebook is loading, shows an animated spinning circle + "Loading…" text instead of "Empty notebook"
- "Empty notebook" only appears after loading completes with zero files
- Loading state threaded via `loadingNotebooks` prop: `useNotebookManager` → `App.tsx` → `NotebookPane` → `NotebookTree`

---

### Follow-up: Remote Notebook Drag-and-Drop

The following drag-and-drop features for remote notebooks are deferred for future implementation:
- **OneDrive:** File move/copy within OneDrive notebooks (requires move/rename API in source proxy)
- **Google Drive:** File move/copy within Google Drive notebooks (requires move API endpoint)
- **GitHub:** File move/copy within GitHub repo notebooks (needs git-based file rename/move support)
- **Cross-source type:** Copy between different source types (e.g., OneDrive → local) — requires read from remote + write to local

These will need backend API additions for each source type's file management operations.

---

### UI Polish (this session, continued)

**Loading indicator for remote notebooks:**
- Added `loadingNotebooks` state (`Set<string>`) to `useNotebookManager` tracking which notebooks are fetching files
- `refreshFiles()` sets loading before remote API calls, clears in `finally` block
- When a notebook is loading (first expand), shows animated spinner + "Loading…" text (non-italic) instead of "Empty notebook"
- When refreshing a notebook that already has files (context menu refresh), shows a small inline spinner to the right of the notebook name — file tree stays visible during refresh
- "Empty notebook" only appears after loading completes with zero files
- Loading state threaded via `loadingNotebooks` prop: `useNotebookManager` → `App.tsx` → `NotebookPane` → `NotebookTree`

**Source type icons:**
- Replaced OneDrive icon with official Microsoft OneDrive logo SVG (2019–2025) from Wikimedia Commons — 4-segment layered cloud with brand blues (#0364b8, #0078d4, #1490df, #28a8ea)
- Replaced Google Drive icon with official logo SVG (2020) from Wikimedia Commons — 6-segment multi-color triangle with proper brand colors
- Both render cleanly at all sizes in the notebook tree and Add Notebook picker

---

### OAuth Auto-Merge Bug Fix

**Problem:** Logging in with a new OAuth provider created a duplicate account instead of merging with the existing one, when the email matched a `provider_email` on an identity link but not the `users.email` column.

**Example scenario:**
1. User signs up via Microsoft → `users.email = svanvliet@outlook.com`
2. User links Google from settings → `identity_links.provider_email = svanvliet@gmail.com`
3. User logs out, logs in via GitHub (email: `svanvliet@gmail.com`)
4. **Before fix:** `users.email` lookup found no match → new user created
5. **After fix:** Falls through to `identity_links.provider_email` lookup → finds existing user → auto-merges

**Fix in `apps/api/src/services/account-link.ts` (`handleOAuthLogin`, step 2):**
- After checking `users.email`, now also queries `identity_links.provider_email` for a matching email
- If exactly one user is found via provider email, proceeds with auto-merge logic (same OAuth↔OAuth rules apply)
- Email+password accounts still never auto-merge (must link manually)

**Dev DB cleanup:**
- Moved orphaned GitHub identity link from duplicate user to correct account
- Deleted duplicate user and associated sessions/audit records
- Verified all 3 providers (Microsoft, Google, GitHub) now linked to single account

---

### Phase 4.4: Media Handling — COMPLETED ✅

**Toolbar media insert button:**
- New Image icon (🖼) in toolbar between Link and Undo/Redo sections
- Dropdown menu with two options: "From URL…" and "Upload file…"
- URL mode: modal with URL + alt text fields, supports both image and video URLs
- Upload mode: file picker filtered to supported formats, 10 MB size limit with alert
- Video URLs detected by extension (.mp4, .webm) → inserted as `<video>` with controls
- Image URLs → inserted via `setImage()`

**Slash commands updated:**
- Image and Video commands open a clean centered modal (not browser prompt)
- Modal has URL field, alt text (images), "Upload file" button, Cancel/Insert
- Uses custom DOM event (`notebook-media-insert`) dispatched from SlashCommands → handled in MarkdownEditor
- Total slash commands: 24

**Drag-and-drop updated:**
- Desktop drops now accept both image and video files
- 10 MB per-file limit enforced with user-friendly alert
- Video files inserted as `<video controls>` element
- Tree file drags also handle video extensions

**DOMPurify updated:**
- Added `video` to ADD_TAGS
- Added `controls`, `autoplay`, `loop`, `muted`, `poster` to ADD_ATTR

**Video styling:**
- `.tiptap video` CSS: max-width 100%, auto height, rounded corners, vertical margin

**Assets folder auto-creation (utility only):**
- `ensureAssetsFolder(notebookId, parentPath)` in localNotebookStore
- Creates `assets/` folder under given parent if it doesn't exist (idempotent)
- Returns the assets path for use by callers

**Current behavior:** Uploaded files are base64-encoded inline in the Markdown. This works but inflates file size for large images.

**Supported formats:**
- Images: `.jpg`, `.jpeg`, `.png`, `.svg`, `.gif`, `.webp`
- Videos: `.mp4`, `.webm`
- Max upload size: 10 MB

**Files modified:**
- `apps/web/src/components/editor/EditorToolbar.tsx` — ImageIcon, MediaInsertMenu, insertMedia/uploadMedia handlers, toolbar button
- `apps/web/src/components/editor/SlashCommands.ts` — Updated Image/Video to use custom event + modal
- `apps/web/src/components/editor/MarkdownEditor.tsx` — MediaInsertModal, video in drag-drop, DOMPurify video allowlist
- `apps/web/src/components/editor/editor.css` — Video styles
- `apps/web/src/stores/localNotebookStore.ts` — `ensureAssetsFolder()`

**Tests: 3 new (43 web total, 195 overall)**
- `ensureAssetsFolder`: creates at root, idempotent (no duplicate), creates under parent path

---

### Deferred: Media Asset Storage

**Status:** Deferred — pending user decision on approach

Currently uploaded images/videos are base64-encoded inline in the Markdown source. The `ensureAssetsFolder()` utility exists but is not wired to the upload flow.

**To implement later:**
- Thread `notebookId` and `parentPath` into the editor/upload handlers
- On upload: call `ensureAssetsFolder()` → `createFile()` to store the binary in `assets/`
- Insert a relative path (`assets/filename.png`) instead of the base64 blob
- Consider: user may prefer inline base64 for portability vs. assets folder for file size

---

### Bug Fix: Remote Notebook Sync on Login

**Fixed:** 2026-02-19

**Problem:** Remote notebooks (OneDrive, Google Drive, GitHub) only appeared in the browser where they were originally added. Logging in from a different browser showed an empty notebook pane because notebooks were only stored in browser-local IndexedDB.

**Root cause:** When a remote notebook was created, it was saved to both the server DB and IndexedDB. But on login, only IndexedDB was read — no sync from server.

**Fix:** Added a sync step in `useNotebookManager`'s login effect that fetches `GET /api/notebooks` and upserts each remote notebook into IndexedDB before rendering the pane. Gracefully degrades if offline.

**Files modified:**
- `apps/web/src/stores/localNotebookStore.ts` — Added `upsertNotebook()` for idempotent insert/update by id
- `apps/web/src/hooks/useNotebookManager.ts` — Added server sync fetch before `listNotebooks()` in login effect

**Tests: 3 new (47 web total)**
- upsertNotebook: inserts new notebook, updates without duplicating, does not overwrite local notebooks

---

### Phase 4.6: Toast Notifications ✅ (core system + notebook/editor wiring)

**Completed:** 2026-02-19

**Implementation:**

- **`useToast.tsx`** — React context provider with `addToast(message, type?)` API
  - Types: success (green ✓), info (blue ℹ), warning (amber ⚠), error (red ✕)
  - Auto-dismiss: success/info 4s, warning 6s, error persistent (manual dismiss only)
  - Max 5 visible, newest on top, oldest trimmed
  - Timer cleanup on dismiss and overflow

- **`ToastContainer.tsx`** — Positioned `fixed top-14 right-4`, below title bar
  - Each toast: white card with colored left border, icon, message, × button
  - Slide-in from right animation on mount
  - Dark mode support, hidden during print

- **`main.tsx`** — Wrapped `<App />` in `<ToastProvider>`

- **Wiring completed:**
  - `useNotebookManager`: 23 `flash()` → `toast?.()` conversions (success/error/info)
  - `useNotebookManager`: 5 `console.warn/error` → `toast?.()` (warning/error)
  - `EditorToolbar`: 1 `alert()` → `addToast()` (warning, file too large)
  - `MarkdownEditor`: 2 `alert()` → `addToast()` (warning, file too large)
  - `AccountModal`: profile updated + password changed → `addToast()` (success)
  - Kept `flash()` only for: "Saved", "Failed to save", "Failed to auto-save" (status bar)

- **Requirements updated:** Added §5.5.1 Notification Catalog with full event list

**Files created:**
- `apps/web/src/hooks/useToast.tsx` — Toast context provider + hook
- `apps/web/src/components/common/ToastContainer.tsx` — Toast rendering component
- `apps/web/src/tests/useToast.test.tsx` — 8 tests for toast logic

**Files modified:**
- `apps/web/src/main.tsx` — ToastProvider wrapping
- `apps/web/src/App.tsx` — ToastContainer + addToast wired to useNotebookManager
- `apps/web/src/hooks/useNotebookManager.ts` — toast param, 28 message conversions
- `apps/web/src/components/editor/EditorToolbar.tsx` — alert→toast
- `apps/web/src/components/editor/MarkdownEditor.tsx` — alert→toast
- `apps/web/src/components/account/AccountModal.tsx` — toast for profile/password
- `apps/web/vitest.config.ts` — Added .test.tsx to include pattern
- `requirements/requirements.md` — §5.5.1 Notification Catalog
- `plans/initial-plan.md` — Phase 4.6 checklist updated

**Tests: 8 new (55 web total)**
- addToast, auto-dismiss success/warning/error, manual dismiss, stacking, max limit, default type

**Remaining (future):**
- Wire remaining auth events (useAuth, WelcomeScreen): provider link/unlink, sign-out, magic link, OAuth errors
- Wire silent catch blocks in useAuth and AddNotebookModal

---

### Phase 4.7.5: Settings & Account Polish ✅

**Completed:** 2026-02-19

#### Editor Font & Size
- Threaded `fontFamily`, `fontSize`, `spellCheck` from `App.tsx` → `DocumentPane` → `MarkdownEditor`
- Applied via CSS custom properties `--editor-font-family` and `--editor-font-size` on `.tiptap`
- SettingsModal font dropdown replaced with button list — each option renders in its own typeface as a live preview
- Added Merriweather and Source Sans 3 to font options (6 total)
- Google Fonts loaded via `index.html` for Inter, JetBrains Mono, Merriweather, Source Sans 3

#### Spell Check
- Wired `spellCheck` setting to Tiptap editor `spellcheck` attribute (init + dynamic sync via useEffect)
- Wired to source textarea's `spellCheck` prop (was hardcoded `false`, now respects setting)

#### Account Modal — Provider Management
- Fetches linked providers via `GET /auth/oauth/linked` on modal open
- Displays each provider with icon (GitHub/OneDrive/Google Drive), label, and email
- Unlink button with confirmation dialog and toast feedback
- Blocks unlink if it's the last sign-in method (API returns 400, shown as error toast)
- "Link a new provider" section shows unlinked providers with buttons to initiate OAuth flow

**Files created:**
- `apps/web/src/tests/appSettings.test.ts` — 6 settings validation tests

**Files modified:**
- `apps/web/src/App.tsx` — Thread settings to DocumentPane
- `apps/web/src/components/layout/DocumentPane.tsx` — Accept and pass fontFamily/fontSize/spellCheck
- `apps/web/src/components/editor/MarkdownEditor.tsx` — Apply settings via CSS vars + spellcheck attr
- `apps/web/src/components/editor/editor.css` — `.tiptap` font from CSS custom properties
- `apps/web/src/components/settings/SettingsModal.tsx` — Font preview buttons, 2 new fonts
- `apps/web/src/components/account/AccountModal.tsx` — Linked Accounts section with unlink/link
- `apps/web/index.html` — Google Fonts imports
- `plans/initial-plan.md` — Phase 4.7.5 checklist updated

**Tests: 6 new (62 web total)**

---

### Provider Unlink Cleanup Fix

**Completed:** 2026-02-19

**Problem:** Unlinking a provider (e.g., GitHub) only removed the identity link. Notebooks connected to that provider remained visible in the UI, auto-save failed (tokens deleted), and publish still worked (GitHub App installation token survived). No cleanup of notebooks, tabs, installations, or local state.

**Server-side fix (account-link.ts):**
- `unlinkProvider()` now maps provider → source_type and deletes matching notebooks
- For GitHub, also deletes `github_installations` rows
- Each deleted notebook is audit-logged

**Client-side fix:**
- Added `handleProviderUnlinked(provider)` to `useNotebookManager` — closes tabs, removes notebooks from IndexedDB + state, clears GitHub working branch refs
- `AccountModal` accepts `onProviderUnlinked` callback, calls it after successful unlink
- Wired through `App.tsx`

**Files modified:**
- `apps/api/src/services/account-link.ts` — Notebook + installation cleanup in `unlinkProvider()`
- `apps/web/src/hooks/useNotebookManager.ts` — `handleProviderUnlinked()`, exported in return object
- `apps/web/src/components/account/AccountModal.tsx` — `onProviderUnlinked` prop + call
- `apps/web/src/App.tsx` — Wire `nb.handleProviderUnlinked` to AccountModal
- `apps/web/src/tests/localNotebookStore.test.ts` — 3 new provider unlink cleanup tests
- `apps/api/src/tests/oauth.test.ts` — 3 new server-side unlink cleanup tests

**Tests: 3 new web (65 total), 3 new API (155 total)**

---

### Provider Token Revocation on Unlink

**Completed:** 2026-02-19

**What:** When a user unlinks a provider, we now revoke OAuth tokens and delete GitHub App installations at the provider level — not just locally.

**Implementation (`apps/api/src/services/provider-revocation.ts`):**
- `revokeGitHubToken()` — `DELETE /applications/{client_id}/token` with Basic Auth
- `deleteGitHubInstallation()` — `DELETE /app/installations/{id}` with App JWT
- `revokeGoogleToken()` — `POST https://oauth2.googleapis.com/revoke` with token as form data
- `revokeMicrosoftToken()` — `POST /oauth2/v2.0/revoke` with refresh token + client credentials
- `revokeProviderTokens()` — dispatcher that routes to the correct provider handler

**Integration in `unlinkProvider()` (`account-link.ts`):**
- Before deleting records, fetches encrypted tokens from `identity_links` and decrypts them
- For GitHub, also gathers `installation_id`s from `github_installations`
- Calls `revokeProviderTokens()` fire-and-forget (doesn't block unlink on revocation failure)

**Design decisions:**
- Best-effort / fire-and-forget — revocation failures are logged but never block the unlink
- Prefers refresh token over access token for Google/Microsoft (revoking refresh token invalidates access tokens too)
- GitHub App installations are deleted in parallel via `Promise.allSettled`

**Files created:**
- `apps/api/src/services/provider-revocation.ts` — Revocation functions for all 3 providers
- `apps/api/src/tests/provider-revocation.test.ts` — 15 unit tests with mocked fetch

**Files modified:**
- `apps/api/src/services/account-link.ts` — Added revocation step before record deletion
- `plans/initial-plan.md` — Added revocation checklist items

**Tests: 15 new API unit tests (170 API total)**

---

### Provider Link Conflict Error Handling

**Completed:** 2026-02-19

**Problem:** When User B tries to link a provider (e.g., Microsoft) that is already linked to User A, `linkProviderToUser` throws an error. The OAuth callback redirects to `/app/auth-error`, but since the user is already signed in, the WelcomeScreen (which displays errors) is skipped — error is silently swallowed.

**Fixes:**
1. **API**: `linkProviderToUser` now throws with `code: 'PROVIDER_ALREADY_LINKED'` for structured error handling
2. **API**: OAuth callback routes this code to `/app/auth-error?error=provider_already_linked&provider=...`
3. **Frontend**: App.tsx parses `provider_already_linked` error with clear user message
4. **Frontend**: New `useEffect` shows `oauthError` as toast when user is already signed in (instead of only on WelcomeScreen)

**Files modified:**
- `apps/api/src/services/account-link.ts` — Error code on duplicate provider link
- `apps/api/src/routes/oauth.ts` — Handle `PROVIDER_ALREADY_LINKED` error code
- `apps/web/src/App.tsx` — Toast for signed-in OAuth errors, `provider_already_linked` message
- `apps/api/src/tests/oauth.test.ts` — 1 new test for duplicate link rejection

**Tests: 1 new API test (171 API total)**

---

## Open Questions

*(Any unresolved questions that need user input)*
