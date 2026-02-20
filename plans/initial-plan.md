# Notebook.md — Implementation Plan

**Version:** 1.1  
**Last Updated:** 2026-02-18  
**Requirements Reference:** `requirements/requirements.md` v1.5

---

## Plan Philosophy

This plan is organized into **7 phases**, each delivering a working, testable milestone. The guiding principles:

1. **Local-first development** — Phases 1–5 run entirely on `docker compose` locally. Production deployment is deferred to Phase 6 so we can iterate on design and technical choices without cloud cost or deployment friction.
2. **Prove feasibility early** — The riskiest technical components (editor, source system integrations, OAuth) are tackled in the first three phases so we surface blockers before investing in polish.
3. **UX experimentation built in** — Each phase ends with a usable state where you can interact with the app, test flows, and provide feedback before we advance.
4. **Vertical slices** — Each phase delivers end-to-end functionality (frontend + backend + data) rather than building all backend first, then all frontend.

---

## Phase Overview

| Phase | Name | What You Can Do When It's Done |
|-------|------|-------------------------------|
| **1** | Foundation & Local Editor | Open the app locally, see the welcome screen, and edit Markdown in a WYSIWYG editor with Local notebook storage |
| **2** | Auth & Account System | Sign up/sign in with email (magic link + password), manage your account, persist settings across sessions |
| **3** | Source System Integrations | Connect OneDrive, Google Drive, and GitHub notebooks; browse files; open/edit/save documents to real cloud storage |
| **4** | Editor Polish & Advanced Features | Slash commands, split view, drag-and-drop, find/replace, media handling, auto-save, GitHub publish workflow |
| **5** | Admin Console, Security Hardening & Legal | Admin console, 2FA, CSP, rate limiting, cookie consent, Terms/Privacy pages |
| **6** | Production Deployment | Azure infrastructure, CI/CD pipeline, DNS, monitoring, canary deployments |
| **7** | Launch Readiness | Analytics, performance tuning, accessibility audit, responsive polish, final QA |

---

## Phase 1: Foundation & Local Editor

**Goal:** Establish the project structure, local dev environment, and a working WYSIWYG Markdown editor with Local notebook support. You should be able to open the app in a browser, see the full layout (toolbar, notebook pane, document pane, status bar), and create/edit Markdown files stored in the browser.

### 1.1 Project Setup

- [x] Initialize monorepo structure:
  ```
  notebook-md/
  ├── apps/
  │   ├── web/          # React SPA (main app)
  │   ├── api/          # Node.js backend
  │   └── admin/        # Admin console (placeholder)
  ├── packages/
  │   └── shared/       # Shared types, utilities, component library
  ├── docker/           # Dockerfiles and compose
  ├── plans/
  ├── requirements/
  └── reviews/
  ```
- [x] Configure TypeScript, ESLint, Prettier across the monorepo (shared configs)
- [x] Set up Tailwind CSS in the web app
- [x] Set up `react-i18next` with English locale file structure (all strings externalized from day one)
- [x] Create `docker-compose.yml` with services: `web` (Vite dev), `api` (Node.js), `db` (PostgreSQL), `cache` (Redis), `mailpit` (SMTP trap)
- [x] Verify `docker compose up` starts everything and the web app is accessible at `localhost:5173`

### 1.2 Application Shell & Layout

- [x] Implement the main application layout (§5):
  - Title bar with logo placeholder + "Notebook.md" text
  - Notebook pane (left sidebar) — collapsible to thin strip, resizable via drag handle
  - Document pane (right) with tab bar
  - Status bar (bottom) — word count, character count, last saved timestamp
  - Account dropdown area (top-right) — placeholder for now
- [x] Implement light/dark/system display mode toggle (Tailwind `dark:` classes)
- [x] Welcome screen (§6.1) — logo, tagline, sign-in/sign-up buttons (non-functional; just the UI)

### 1.3 WYSIWYG Markdown Editor

- [x] Integrate Tiptap editor with ProseMirror
- [x] Configure GFM extensions: headings (H1–H6), bold, italic, strikethrough, inline code, highlight
- [x] Links (inline, auto-links), images (rendered inline), blockquotes
- [x] Ordered lists, unordered lists, nested lists, task/checkbox lists
- [x] Fenced code blocks with syntax highlighting (language selector)
- [x] GFM tables with alignment
- [x] Horizontal rules
- [ ] Footnotes extension *(deferred to Phase 4)*
- [ ] KaTeX math extension (inline `$...$` and block `$$...$$`) *(deferred to Phase 4)*
- [ ] Emoji shortcodes *(deferred to Phase 4)*
- [ ] YAML front matter (collapsible metadata block) *(deferred to Phase 4)*
- [x] Toolbar (§4.4): heading selector, formatting buttons, insert controls, undo/redo — contextual state
- [x] Markdown sanitization: integrate DOMPurify; strip dangerous HTML, `javascript:` URIs, event handlers
- [x] Raw Markdown toggle (`Cmd/Ctrl+Shift+M`) — switch between WYSIWYG and source view
- [x] Keyboard shortcuts (§4.6): bold, italic, strikethrough, inline code, link, save, undo, redo
- [x] Slash commands (/) — type "/" to open command palette with heading, list, table, code block, etc.

### 1.4 Local Notebook Storage

- [x] Implement Local notebook source using IndexedDB (via `idb` or Dexie.js library)
- [x] File/folder CRUD operations (create, rename, delete, move) — all client-side
- [x] Notebook tree view in the sidebar with expand/collapse, selection, context menus
- [x] Device icon for Local notebooks in the tree
- [x] Open `.md` / `.mdx` / `.markdown` files in the editor; `.txt` files as plaintext
- [ ] Image/video preview for media files in the tree *(deferred to Phase 4)*
- [x] Tabbed documents: open multiple files, switch between tabs, close tabs, unsaved-changes indicator
- [x] Manual save to IndexedDB (`Cmd/Ctrl+S`)
- [x] Auto-save for Local notebooks (immediate write on every change)
- [x] Status bar: live word count, character count, last saved timestamp
- [x] Warning on Local notebook creation: "Data is stored in your browser. Clearing browser data will delete Local notebook content."

### 1.5 Phase 1 Validation

- **Technical:** Tiptap + ProseMirror renders all GFM elements correctly; IndexedDB read/write is reliable; layout is responsive
- **UX:** You can create a Local notebook, add files/folders, edit Markdown with the WYSIWYG editor, toggle to raw mode, and see your changes persisted across page refreshes
- **Feedback points:** Editor feel, toolbar layout, sidebar behavior, dark mode appearance, overall layout proportions

---

## Phase 2: Auth & Account System

**Goal:** Implement the full authentication system with email sign-in (magic link + password), OAuth provider scaffolding, account management, and user settings. You should be able to create an account, sign in, and have your settings persist.

### 2.1 Backend API Foundation

- [x] Set up Express/Fastify API server with TypeScript
- [x] Configure PostgreSQL connection with a migration tool (e.g., `node-pg-migrate` or Knex migrations)
- [x] Create initial database migrations for all tables (§10.1): `users`, `identity_links`, `notebooks`, `user_settings`, `sessions`, `audit_log`, `feature_flags`, `announcements`
- [x] Set up Redis connection for session storage and rate limiting
- [x] Implement structured JSON logging (correlation IDs on every request)
- [x] Configure error handling middleware: return correlation IDs to clients, never stack traces (even in dev — use Mailpit for secrets, Log Analytics for errors)
- [x] Set up database seed script for local dev (default admin account `admin@localhost`)

### 2.2 Email Authentication

- [x] Implement email sign-up flow:
  - Enter email → choose magic link or create password
  - Magic link: generate token, send via email (Mailpit in dev), verify on click
  - Password: validate strength, hash with bcrypt (cost 12+), store in `users.password_hash`
  - Email verification: send verification link, set `email_verified` flag
- [x] Implement email sign-in flow:
  - Magic link: enter email → send link → verify
  - Password: enter email + password → validate → create session
- [x] Implement password reset: enter email → send reset link → new password form
- [x] Session management (§2.6):
  - Issue HttpOnly, Secure, SameSite session cookies
  - Refresh token rotation with family tracking (detect reuse → revoke all family tokens)
  - "Remember Me" checkbox: extends session to 30 days (refresh token)
  - Default session: 24 hours
- [x] Rate limiting on auth endpoints (Redis-backed)
- [x] Audit logging for auth events (sign-in, sign-up, password reset)

### 2.3 OAuth Provider Scaffolding

- [x] Implement OAuth abstraction layer (provider-agnostic interface)
- [x] Set up mock OAuth provider for local dev (simulates the OAuth redirect flow without real credentials)
- [x] Wire up OAuth callback → account creation / linking logic
- [x] Implement account merging rules (§2.3): OAuth↔OAuth auto-merge (verified email only); email+password ↔ OAuth requires manual link
- [x] Configure Microsoft, Google, GitHub OAuth client registrations (real credentials can be added when ready; mock provider for dev)

### 2.4 Account Management UI

- [x] Sign-in / sign-up page (§6.2, §6.3): provider buttons + email form
- [x] Post-sign-in empty state (§6.4): "Add your first notebook" prompt
- [x] Account dropdown (§7.1): display name, avatar, menu items
- [x] Account Settings modal (§7.2): profile editing, linked accounts list (add/remove), danger zone (delete account)
- [x] Settings modal (§7.3): display mode, font family, font size, margins, auto-save default, spell check, line numbers, tab size, word count toggle, GitHub delete-branch-on-publish
- [x] Settings sync: persist to `user_settings` table via API, load on sign-in

### 2.5 Connect Auth to Local Notebooks

- [x] Persist Local notebook configuration to the `notebooks` table (source_type: `local`) so the notebook list survives sign-out/sign-in
- [x] Local notebook data remains in IndexedDB (browser-local); only the notebook metadata (name, config) is stored server-side

### 2.6 Phase 2 Validation

- **Technical:** ✅ Full auth flow works end-to-end locally; sessions persist; settings sync; Mailpit captures all emails
- **UX:** ✅ You can sign up with email, sign in, change settings (dark mode, font), sign out, sign back in, and see settings preserved. Local notebooks still work.
- **Feedback points:** Sign-in/sign-up flow, settings options, account modal UX

### 2.7 Tier 1: API Integration Tests (§8.15)

- [x] Install Vitest + Supertest in `apps/api`
- [x] Configure Vitest for ESM (`vitest.config.ts`) with test database setup/teardown
- [x] Add `test` script to `apps/api/package.json` and root `package.json`
- [x] Test suite: Auth flows
  - [x] Sign-up with email + password (success + duplicate email + short password)
  - [x] Sign-in with email + password (success + wrong password + unknown email)
  - [x] Magic link request + verification
  - [x] Password reset request + confirmation
  - [x] Email verification
  - [x] Token refresh + rotation (valid refresh, reused token → family revocation)
  - [x] Sign-out (session invalidated)
- [x] Test suite: Session management
  - [x] Session creation with "Remember Me" (30-day) vs default (24-hour)
  - [x] Refresh token rotation: new token issued, old token invalidated
  - [x] Token reuse detection: revoke entire token family
- [x] Test suite: Notebooks CRUD
  - [x] Create, list, update, delete notebooks (scoped to authenticated user)
  - [x] Unauthenticated access returns 401
  - [x] User A cannot see User B's notebooks
- [x] Test suite: Settings CRUD
  - [x] GET/PUT settings (scoped to authenticated user)
  - [x] Settings persist across sessions
- [x] Test suite: OAuth callbacks
  - [x] Mock provider callback creates user + session
  - [x] Duplicate email merging (OAuth↔OAuth auto-merge)
  - [x] Account linking and unlinking
- [x] Test suite: Rate limiting
  - [x] Mutation endpoints enforce limits
  - [x] Read endpoints have higher limits

---

## Phase 3: Source System Integrations

**Goal:** Connect real cloud storage (OneDrive, Google Drive, GitHub) as notebook sources. You should be able to authenticate with each provider, browse files, and open/edit/save Markdown documents to your real cloud storage.

### 3.1 Source System Proxy Architecture

- [x] Implement backend proxy layer (§8.2): all source system API calls routed through the API server
- [x] OAuth token storage: encrypt tokens at rest with envelope encryption (AES-256 + a local dev key; KMS integration deferred to Phase 6)
- [x] Token refresh logic: auto-refresh expired access tokens using stored refresh tokens
- [x] Path validation middleware (§9.3 security): canonicalize paths, reject `..` traversal, validate paths are within notebook root
- [x] Per-user rate limiting on file proxy endpoints (Redis-backed)
- [x] Circuit breaker per source system (prevent cascading failures)

### 3.2 Microsoft OneDrive Integration

- [x] Register Microsoft Entra ID app (dev tenant or personal)
- [x] Implement OAuth flow for Microsoft (§2.1): personal + enterprise accounts
- [x] Request scope: `Files.ReadWrite` + `User.Read` + `offline_access`
- [x] Implement Microsoft Graph API proxy endpoints:
  - List folder contents (tree view)
  - Read file content
  - Write file content
  - Create file/folder
  - Delete file/folder
  - Rename/move file
- [x] OneDrive icon in notebook tree
- [x] Manual save to OneDrive (`Cmd/Ctrl+S`)
- [x] Auto-save with debounce (3s inactivity, 30s max)

### 3.3 Google Drive Integration

- [x] Register Google Cloud project + OAuth consent screen
- [x] Implement OAuth flow for Google (§2.1)
- [x] Request scope: `drive` + `profile` + `email`
- [x] Implement Google Drive API proxy endpoints (same operations as OneDrive)
- [x] Google Drive icon in notebook tree
- [x] Manual and auto-save (same debounce as OneDrive)

### 3.4 GitHub Integration

- [x] Register GitHub App ("Notebook.md") on GitHub
- [x] Implement GitHub App installation flow (§9.1): redirect to install → callback → store installation ID
- [x] Implement GitHub API proxy endpoints:
  - List repository contents (tree view — filtered to supported file types only)
  - Read file content (via Contents API)
  - Create/update files (via Contents API to working branch)
  - Create working branch (`notebook-md/<random-uuid>`) from base branch
  - List branches, get branch status
- [x] GitHub Octocat icon in notebook tree
- [x] Manual save: commit to working branch
- [x] Auto-save: batch commits (30s inactivity threshold), squash on publish
- [x] Publish flow: squash merge working branch → base branch (or open PR)
- [x] "Delete branch on publish" setting integration
- [x] Webhook endpoint (`/webhooks/github`):
  - HMAC-SHA256 signature verification
  - Timestamp validation (reject > 5 min old)
  - Delivery ID deduplication (Redis, 10-min TTL)
  - On external `push`: notify connected clients to refresh file tree

### 3.5 Add Notebook Flow

- [x] "Add Notebook" UI: select source type → authenticate (if not linked) → browse/select folder or repo → name the notebook
- [x] Notebook tree: show all notebooks with source-type icons, expandable file trees
- [x] File type filtering in tree: only show `.md`, `.mdx`, `.markdown`, `.txt`, and supported media files
- [x] Context menus on tree items: new file, new folder, rename, delete, move, refresh

### 3.6 Phase 3 Validation

- **Technical:** All three source systems work end-to-end: auth → browse → open → edit → save → verify file changed in the real source (OneDrive folder, Google Drive folder, GitHub repo)
- **UX:** You can add a OneDrive folder, a Google Drive folder, and a GitHub repo as notebooks, browse their contents, open a `.md` file, edit it, save it, and confirm the change shows up in the native app (OneDrive web, Google Drive web, GitHub.com)
- **Feedback points:** Add-notebook flow, tree browsing speed, save feedback, source icon clarity

---

## Phase 4: Editor Polish & Advanced Features

**Goal:** Complete the editor feature set — slash commands, split view, drag-and-drop, media handling, find/replace. This is the UX refinement phase.

### 4.1 Slash Commands

- [x] Implement slash command palette (§4.5): type `/` to open overlay
- [x] Commands: change block type (heading, paragraph, quote, code), insert table, insert image, insert horizontal rule, insert task list, insert code block (with language selector), insert math block, insert callout
- [x] Filterable by typing after `/` (e.g., `/tab` → "Table")
- [x] Keyboard navigation (arrow keys + Enter to select)

### 4.2 Split View

- [x] Implement split pane within a single document tab: raw Markdown (left) ↔ WYSIWYG preview (right)
- [x] Synchronized scrolling between panes
- [x] Toggle split view via toolbar button or keyboard shortcut

### 4.3 Drag and Drop

- [x] Block reordering: drag paragraphs, headings, lists to rearrange content within the editor
- [x] Image drop: drag image files from desktop into the editor → upload to notebook `assets/` folder → insert Markdown reference
- [x] File linking: drag a file from the notebook tree into the editor → insert relative Markdown link
- [x] Fix: internal tree drags must not trigger app-level file import overlay
- [x] File/folder move within notebook: drag files between folders in the same notebook
- [x] File copy across notebooks: drag files between notebooks of the same source type (copy only)
- [x] Cross-source-type drag prevention: show "no drop" cursor for incompatible notebook types
- [x] Notebook reordering: drag notebooks to reorder in the pane; add `sortOrder` to NotebookMeta and persist
- [x] Visual feedback: drop target folder highlights on dragover; invalid targets show "no drop" cursor

### 4.4 Media Handling

- [x] Image/media insert via toolbar and slash command:
  - Option 1: provide a URL → insert Markdown image/link
  - Option 2: upload file → currently base64-encoded inline
- [ ] **DEFERRED:** Upload file → store in `assets/` subfolder with relative reference (instead of base64 inline)
- [x] 10 MB per-file upload limit with user-friendly error message
- [x] Inline preview: images rendered at natural size in WYSIWYG view; videos rendered as embedded player
- [x] Supported formats: `.jpg`, `.jpeg`, `.png`, `.svg`, `.gif`, `.webp`, `.mp4`, `.webm`
- [x] Auto-create `assets/` folder if it doesn't exist (utility created, not yet wired to upload flow)

### 4.5 Find and Replace — DEFERRED

- [ ] `Cmd/Ctrl+F` opens find bar within the active document
- [ ] Case-sensitive toggle, whole-word toggle
- [ ] Highlight all matches
- [ ] Replace one / Replace all

### 4.6 Toast Notifications

- [x] Create `useToast` hook + `ToastContainer` component
  - React context provider with `addToast(message, type, options?)` API
  - Types: `success`, `info`, `warning`, `error` — each with distinct color and icon
  - Auto-dismiss: success/info ~4s, warning ~6s, error persistent (manual dismiss)
  - Position: top-right under title bar, stacking newest on top, max 5 visible
  - Smooth enter/exit animations (slide-in from right, fade-out)
  - Each toast has an × dismiss button
- [x] Wire all existing `flash()` calls in `useNotebookManager` to use `addToast`
  - Success: notebook created/added/deleted, file/folder created, file imported, file deleted, changes published
  - Error: failed to load/add/create/open/publish/move/copy
  - Info: no pending changes to publish
  - Kept flash() only for save messages (Saved, Failed to save, Failed to auto-save) in status bar
- [x] Replace `alert()` calls (media upload size limit) with warning toasts
- [x] Wire auth events in `AccountModal`
  - Success: profile updated, password changed
- [ ] Wire remaining auth events in `useAuth` / `WelcomeScreen` (future)
  - Success: provider linked/unlinked, email verified, settings saved
  - Info: magic link sent, password reset email sent, signed out
  - Error: sign-in failed, sign-up failed, OAuth error, provider unlink blocked
- [ ] Wire silent catch blocks — surface errors that are currently swallowed (future)
  - `useAuth`: magic link request, password reset request, sign-out failure
  - `AddNotebookModal`: provider access check failures
- [x] Replace existing `console.warn` user events with warning toasts
  - File move not supported for remote notebooks
  - Cross-notebook copy only supported between local notebooks
- [x] Retire `flash()` for all non-save messages; status bar kept for save confirmations + persistent stats

### 4.7 Status Bar Enhancements — COMPLETE (covered by existing implementation)

- [x] Ephemeral messages in the status bar (save confirmations, sync status) — `flash()` already handles this
- [x] Auto-dismiss after 5 seconds — `flash()` auto-clears after 2s; all other messages moved to toasts in 4.6

### 4.7.5 Settings & Account Polish

#### Account Modal — Provider Management
- [x] Fetch linked providers via `GET /auth/oauth/linked` on modal open
- [x] Display list of linked providers with icons and unlink buttons
- [x] Unlink provider via `DELETE /auth/oauth/:provider` with confirmation
- [x] Block unlink if it's the last sign-in method (API returns 400)
- [x] Add "Link Provider" button to initiate OAuth flow from Account Settings
- [x] Server: delete provider's notebooks and GitHub installations on unlink
- [x] Client: close tabs, remove notebooks from IndexedDB and state on unlink
- [x] Client: clear working branch refs for GitHub notebooks on unlink
- [x] Server: revoke OAuth tokens with provider on unlink (best-effort)
  - [x] GitHub: `DELETE /applications/{client_id}/grant` (full authorization revocation)
  - [x] Google: `POST https://oauth2.googleapis.com/revoke`
  - [x] Microsoft: `POST /oauth2/v2.0/revoke` with refresh token
- [x] Error handling: show toast when linking a provider already linked to another account
- [x] UX: helpful note on GitHub install screen for re-authorization of existing installations

#### Settings — Editor Font & Size
- [x] Thread `settings` (fontFamily, fontSize) from App → DocumentPane → MarkdownEditor
- [x] Apply fontFamily and fontSize to the Tiptap editor via CSS variables
- [x] Font preview in dropdown: render each font option in its own typeface
- [x] Added Merriweather and Source Sans 3 to font options (6 total)
- [x] Google Fonts loaded via index.html for Inter, JetBrains Mono, Merriweather, Source Sans 3

#### Settings — Spell Check
- [x] Wire `settings.spellCheck` to the Tiptap editor's `spellcheck` attribute
- [x] Wire `settings.spellCheck` to the source textarea's `spellCheck` prop
- [x] Sync spellcheck on setting change via useEffect

#### Settings — Remaining Toggles
- [x] Wire `settings.margins` to editor padding via CSS variable `--editor-margin`
- [x] Wire `settings.lineNumbers` to source view — line number gutter alongside textarea
- [x] Fix line numbers with word wrap — mirror-measured div gutter for correct alignment and scroll sync
- [x] Remove `showWordCount` setting — word count always shows in status bar
- [ ] Wire `settings.tabSize` to code block indentation (future)

#### Password Management for OAuth-Only Accounts
- [x] API: `/auth/me` returns `hasPassword` boolean
- [x] API: `PUT /auth/password` allows setting password without current password for OAuth-only accounts
- [x] API: `PUT /auth/password` requires `confirmPassword` field with match validation
- [x] API: `DELETE /auth/account` uses typed "DELETE" confirmation for OAuth-only accounts
- [x] Frontend: Show "Add a password" vs "Change password" based on `hasPassword`
- [x] Frontend: Confirm password field always shown
- [x] Frontend: Delete account uses password or "type DELETE" based on account type
- [x] Frontend: Delete button disabled until valid confirmation provided
- [x] Tests: 6 new API tests (hasPassword flag, add password, confirm mismatch, OAuth delete)

#### UI Polish
- [x] Tree view: Heroicons for file types (md, txt, image, video) and folders (open/closed)
- [x] Tables: auto width, shaded headers, tighter cell margins
- [x] Code block language selector: larger font size

### 4.8 Tier 2: Web Unit Tests (§8.15)

**Infrastructure (already complete):**
- [x] Install Vitest + React Testing Library + jsdom + fake-indexeddb in `apps/web`
- [x] Configure Vitest for web (`vitest.config.ts`) with node environment
- [ ] Add `test` script to `apps/web/package.json`

**Existing test suites (67 tests across 4 files):**
- [x] `localNotebookStore.test.ts` (22 tests) — CRUD, scoping, folder ops, cascades, sync, provider unlink cleanup
- [x] `markdownConverter.test.ts` (30 tests) — HTML↔MD conversion, detection, round-trip
- [x] `appSettings.test.ts` (8 tests) — defaults, merging, margin mapping, font validation
- [x] `useToast.test.tsx` (8 tests) — create, auto-dismiss, manual dismiss, stacking, limits

**New test suites needed:**
- [x] Test suite: `useSettings` (8 tests)
  - [x] Default settings applied on first load (no localStorage)
  - [x] Settings persist to localStorage on update
  - [x] Settings merge with defaults (handles missing keys from older versions)
  - [x] resetSettings restores defaults
  - [x] No server calls when not signed in
  - [x] Server sync on update when signed in
  - [x] Corrupted localStorage handled gracefully
- [x] Test suite: `useAuth` (13 tests)
  - [x] Initial loading state, then resolved user from /auth/me
  - [x] Sign-up, sign-in set user state
  - [x] Sign-out clears user state
  - [x] Error handling (network failure, invalid credentials)
  - [x] changePassword sends confirmPassword
  - [x] deleteAccount sends password or confirmation
  - [x] devSkipAuth creates fake user with hasPassword
  - [x] clearError resets error state
- [x] Test suite: `useNotebookManager` tab logic (7 tests)
  - [x] Tab id format and name extraction
  - [x] Unsaved changes tracking
  - [x] Tab close selects adjacent tab / null when last
  - [x] Provider-to-sourceType mapping
  - [x] Filter tabs by source type on provider unlink
  - [x] Tab rename updates id and active reference
- [x] Test suite: `AccountModal` (10 tests)
  - [x] Shows "Add a password" when hasPassword is false
  - [x] Shows "Change password" when hasPassword is true
  - [x] Hides current password field when adding password
  - [x] Shows confirm password field
  - [x] Password validation (min length, mismatch)
  - [x] Delete account: password field for password accounts, "type DELETE" for OAuth-only
  - [x] Delete button disabled until valid confirmation

### 4.9 Phase 4 Validation ✅

**Completed:** 2026-02-19

- **Build:** ✅ Web builds successfully (Vite 6, TypeScript clean)
- **Tests:** ✅ 282 tests pass (105 web + 177 API, 21 test files, 0 failures)
- **Technical:** All core editor features verified in codebase:
  - ✅ Slash commands, toolbar, split/source/WYSIWYG views
  - ✅ Tables (insert, edit, floating toolbar, shaded headers)
  - ✅ Code blocks with language selector
  - ✅ Images (insert, drag-drop, copy-paste)
  - ✅ Drag-and-drop reorder (drag handle)
  - ✅ Line numbers with word wrap, word wrap toggle
  - ✅ Callout blocks, math/KaTeX
  - ✅ Print support with margin mapping
  - ✅ Auto-save with debounce
  - ✅ Tab management (open, close, switch, reorder, unsaved indicator)
  - ✅ Toast notifications (success, error, info, warning)
  - ✅ GitHub publish workflow (working branch → commit → PR/merge)
  - ✅ Settings: font, margins, line numbers, spell check, display mode
  - ✅ Account: provider link/unlink with token revocation, password management
  - ⏳ Find and Replace — DEFERRED to future phase
  - ⏳ tabSize wiring — DEFERRED
- **UX:** Editor supports full Markdown authoring: write, format, insert media, drag to reorder, toggle views. Settings and account management are polished.
- **Deferred items:** Find/Replace (4.5), tabSize wiring, video insert UX

---

## Phase 5: Admin Console, Security Hardening & Legal

**Goal:** Build the admin console, implement 2FA, harden security controls, and add legal pages. The app should be security-ready for production.

### 5.1 Two-Factor Authentication

- [x] 2FA setup flow (§7.2 Security):
  - Enable: choose TOTP (scan QR code) or emailed codes → verify first code → save recovery codes
  - Disable: require current 2FA verification
- [x] 2FA sign-in flow: after password verification, prompt for TOTP code or emailed code
- [x] Recovery codes: bcrypt-hashed, one-time use, 10 codes generated
- [x] TOTP secrets: encrypted with envelope encryption (same KMS scheme as OAuth tokens)
- [x] API endpoints (§9.1): `/auth/2fa/setup`, `/auth/2fa/enable`, `/auth/2fa/disable`, `/auth/2fa/verify`, `/auth/2fa/send-code`, `/auth/2fa/send-disable-code`, `/auth/2fa/status`
- [x] Frontend: TwoFactorSetup component in AccountModal (setup, QR scan, recovery codes, disable)
- [x] Frontend: WelcomeScreen 2FA verification view (TOTP, email, recovery code modes)
- [x] Frontend: useAuth hook with 2FA methods (verify2fa, send2faEmailCode, setup2fa, enable2fa, disable2fa)
- [x] Tests: 13 API tests (two-factor.test.ts)

### 5.2 Admin Console

- [x] Set up `apps/admin/` React SPA with Tailwind (shared component library from `packages/shared/`)
- [x] Admin route middleware: verify `is_admin = true` on every admin API request
- [x] Admin CLI script: `cli/promote-admin.js` — sets `is_admin = true` for a given email, run via `docker exec`
- [x] Admin pages:
  - User management: search, view details, toggle dev_mode/suspended flags (cannot set `is_admin` via API)
  - System health dashboard: API status, DB status, Redis status, container uptime
  - Metrics overview: active users, sign-ups, notebook counts by source type
  - Audit log viewer: paginated, filterable by action/user/date
  - Feature flags: list, create, toggle
  - Announcements: create, edit, delete; display to users in main app
- [x] Admin MFA enforcement (§8.9.2): V1 — require 2FA or OAuth link for admin access
- [ ] Admin action alerting: sensitive actions trigger email notifications to security distribution list
- [x] Admin actions logged to audit log with `admin_action` flag

### 5.3 Security Hardening

- [x] Content Security Policy (§11.2):
  - Nonce-based script/style loading
  - `img-src 'self' data: blob: *.sharepoint.com *.googleusercontent.com *.githubusercontent.com`
  - `connect-src 'self'`
  - `frame-src 'none'`, `object-src 'none'`
  - Verify KaTeX works without `unsafe-eval`
- [x] CORS policy: `Access-Control-Allow-Origin` restricted to `notebookmd.io` and `admin.notebookmd.io` (and `localhost:*` in dev)
- [x] CSRF protection on all state-changing endpoints
- [x] HSTS header configuration
- [x] Verify DOMPurify sanitization covers all Markdown XSS vectors (raw HTML, `javascript:` URIs, SVG scripts, `data:` URIs)
- [x] Audit: ensure no tokens, secrets, or sensitive data can leak through error responses, logs, or client-side state

### 5.3b Session Hardening (§2.6)

- [x] "Remember Me" checkbox on sign-in: default 24hr session, 30-day with "Remember Me"
  - Set `expires_at` on sessions table based on checkbox
  - Auth middleware checks `expires_at` and rejects expired sessions
- [x] Refresh token rotation: each use of a refresh token issues a new one and invalidates the old
  - Add `token_family` column to sessions for reuse detection
  - If a revoked refresh token is reused (theft indicator), invalidate all sessions in that token family
- [x] Idle timeout (optional, configurable in settings): after N minutes of inactivity, require re-authentication
  - Track `last_active_at` on session; middleware checks against idle threshold
  - Default: off (user can enable in Settings)

### 5.4 Cookie Consent Banner

- [x] Custom cookie consent banner (§13.3): "Accept All", "Reject All", "Manage Preferences"
- [x] Consent stored in first-party cookie (works pre-auth)
- [x] Respect "Do Not Track" header
- [x] PostHog initialization hook prepared (actual PostHog integration deferred to Phase 7)

### 5.5 Legal Pages

- [x] Terms of Service page at `/terms` — boilerplate for Van Vliet Ventures, LLC with liability limitation, indemnification, "as-is" warranty disclaimer
- [x] Privacy Policy page at `/privacy` — data collected, data not collected (no document content), third-party services list, GDPR rights, contact info
- [x] Link to Terms and Privacy from sign-up flow and app footer
- [x] React Router (`react-router-dom`) for SPA navigation — proper back/forward, direct URL access, bookmarking (§5.7)

### 5.6 Phase 5 Validation ✅

- **Technical:** 2FA works end-to-end; admin console fully functional; CSP doesn't break editor features; CORS correctly blocks unauthorized origins; session expiry and refresh token rotation work correctly; reuse detection invalidates token families
- **UX:** You can enable 2FA on your account, sign in with a TOTP code, access the admin console, view system health, and manage feature flags. Cookie consent banner appears for new visitors. Legal pages are readable. "Remember Me" extends session duration.
- **Feedback points:** 2FA setup flow, admin console usability, cookie banner positioning, legal page content, session duration behavior
- **Test results:** 339 tests across 27 files (207 API + 132 web), all passing. TypeScript clean across all 3 apps (web, api, admin).

> **Deferred:** Accessibility audit (WCAG 2.1 AA) is deferred to a future version. PostHog analytics integration is in Phase 7.

---

## Phase 6: Production Deployment

**Goal:** Deploy the app to Azure. Set up the full infrastructure, CI/CD pipeline, DNS, monitoring, and run the first production deployment.

> **Note on E2E tests:** The full Playwright E2E test suite (30+ test cases) has been moved to Phase 7. Phase 6 includes only Playwright setup and a minimal smoke test suite to validate the deployment pipeline. This keeps the deployment phase focused and avoids blocking production readiness on comprehensive E2E coverage.

### 6.1 Infrastructure as Code

- [x] Set up Terraform project for Azure resources:
  - Resource group (East US 2)
  - Azure Container Apps environment (with 3 container apps: web, api, admin)
  - Azure Container Registry (private)
  - Azure Database for PostgreSQL Flexible Server (Burstable B1ms, zone-redundant HA)
  - Azure Cache for Redis (Basic C0)
  - Azure Front Door (Standard tier) with CDN for SPA assets
  - Azure Key Vault for secrets (OAuth tokens encryption key, webhook secrets, etc.)
  - Azure Monitor / Application Insights workspace
- [x] Configure managed identity for Container Apps → Key Vault access
- [x] Migrate token encryption from local dev key to Azure Key Vault (envelope encryption with KMS-managed key)
- [x] Configure environment variables per container app (CORS_ORIGIN, ADMIN_ORIGIN, DATABASE_URL, REDIS_URL, etc.)

### 6.2 Container Images

- [x] Create production Dockerfiles (multi-stage builds) for:
  - `web` — Nginx serving the React SPA static build (with SPA fallback: all non-file routes → `index.html`)
  - `api` — Node.js production build (includes migrations runner)
  - `admin` — Nginx serving the Admin SPA static build (with SPA fallback)
- [x] Nginx configs with:
  - SPA history API fallback (`try_files $uri $uri/ /index.html`)
  - Gzip compression for static assets
  - Cache headers for hashed assets (long-lived) vs `index.html` (no-cache)
- [x] Image scanning with Trivy in CI (configured; runs in 6.3 CI pipeline)
- [x] Push to Azure Container Registry (configured; runs in 6.3 CI pipeline)
- [x] Create `docker-compose.prod.yml` for local production-like testing (uses production Dockerfiles instead of Vite dev servers)

### 6.3 CI/CD Pipeline

- [x] GitHub Actions workflows:
  - **Build & Test** (every push/PR): lint, type-check, run API integration tests (Tier 1, needs PostgreSQL + Redis service containers), run web unit tests (Tier 2), build Docker images
  - **E2E Smoke** (PR to `main`): Playwright smoke tests against Docker Compose stack (auth + basic notebook operations)
  - **Production Deploy** (`v*` tag + manual approval): push images to ACR, deploy new Container Apps revision
  - **Rollback** (manual trigger): shift traffic to previous revision
- [x] GitHub Environment `production` with protection rules (manual approval) — configured in deploy + rollback workflows
- [x] Environment-scoped secrets for Azure credentials (AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID)
- [x] Branch protection on `main`: deferred — requires GitHub Team plan for private repos; revisit when repo goes public
- [x] Dependabot configuration for npm, Docker base images, and GitHub Actions

### 6.4 E2E Smoke Tests (Playwright Setup)

- [x] Install Playwright in the repo root (shared across apps)
- [x] Configure `playwright.config.ts` with `webServer` pointing to Docker Compose stack
- [x] Smoke test suite (minimal set to validate deployment):
  - [x] Welcome screen loads, sign-up form visible
  - [x] Sign-up with email + password → lands in app
  - [x] Sign-in with existing account → sees app
  - [x] Sign-out → returns to welcome screen
  - [x] Legal pages accessible at `/terms` and `/privacy`
  - [x] Cookie consent banner appears for new visitors
- [x] Add `test:e2e` script to root `package.json`

> **Full E2E suite** (editor, notebook management, settings, data isolation, multi-browser) is deferred to Phase 7.4.

### 6.5 DNS & SSL

- [x] Configure GoDaddy DNS records:
  - `notebookmd.io` → Azure Front Door (web app)
  - `api.notebookmd.io` → Azure Container Apps (API)
  - `admin.notebookmd.io` → Azure Container Apps (Admin)
- [x] SPF, DKIM, DMARC records for `noreply@notebookmd.io` (transactional email)
- [x] Azure-managed TLS certificates via Front Door
- [x] Verify CORS config: API accepts origins `https://notebookmd.io` and `https://admin.notebookmd.io`

### 6.6 Monitoring & Alerting

- [x] Application Insights: request tracing, dependency tracking, exception logging
- [x] Azure Monitor availability tests (ping API health endpoint and web/admin URLs)
- [x] Alerts: error rate spikes, health check failures, high latency → email notification
- [x] Structured logs → Log Analytics workspace
- [x] Sentry integration for client-side error tracking (free tier) — captures React errors, network failures

### 6.7 Transactional Email

- [x] Set up SendGrid account (free tier: 100 emails/day)
- [x] Configure sender domain verification for `noreply@notebookmd.io`
- [x] Switch API email transport from Mailpit to SendGrid in production config (env-based: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`)

### 6.8 Database

- [x] Run production migrations (001–003)
- [x] Enable automated daily backups with 35-day PITR
- [x] Enable geo-redundant backup storage
- [x] Promote first admin account via CLI (`node cli/promote-admin.js <email>`)

### 6.9 First Deployment

- [x] Fix image naming: align `container_apps.tf` (`api`/`web`/`admin`) with `deploy.yml`
- [x] Fix Redis version: `7` → `6` (azurerm provider compatibility)
- [x] Fix OIDC: add `environment: production` to build job (no tag wildcards in federated creds)
- [x] Fix migration command: wrap in `/bin/sh -c` to avoid az CLI arg parsing
- [x] Create `infra/DEPLOY.md` deployment runbook (11 steps + troubleshooting)
- [x] Terraform validates ✅
- [x] Follow `infra/DEPLOY.md`: bootstrap state, fill tfvars, provision ACR, push images, full apply
- [x] Configure DNS at GoDaddy (validation TXT + CNAMEs from terraform output)
- [x] Set up GitHub OIDC (Azure AD app + federated credential + repo secrets)
- [x] Tag `v0.1.0`, trigger deploy workflow, approve production deployment
- [ ] Verify app at `notebookmd.io`, `api.notebookmd.io`, `admin.notebookmd.io`
- [ ] Smoke test: sign up, verify email, create notebook, edit doc, cookie consent, legal pages
- [ ] Promote admin account via `az containerapp exec`

### 6.10 Phase 6 Validation

- [ ] **Production OAuth apps** — create/update OAuth client registrations with production redirect URIs (`https://api.notebookmd.io/auth/oauth/*/callback`):
  - [ ] Microsoft (Entra ID): update app registration → add redirect URIs, set to multi-tenant (personal + work accounts)
  - [ ] Google Cloud: update OAuth consent screen → add production domain, add redirect URIs
  - [ ] GitHub: create production OAuth app → set callback URL, add client ID/secret to `terraform.tfvars`
  - [ ] GitHub App: create production GitHub App → set callback URL, webhook URL, permissions
  - [ ] Update `terraform.tfvars` with production OAuth credentials and re-run `terraform apply`
- **Technical:** Full app running in Azure; CI/CD pipeline works end-to-end (Tier 1 + Tier 2 on push, E2E smoke on PR to main); monitoring captures real traffic; auto-scaling responds to load; SPA fallback works for all client-side routes
- **UX:** The production app is indistinguishable from the local dev experience
- **Feedback points:** Page load speed, cold-start latency, OAuth redirect timing, email delivery speed

---

## Phase 7: Launch Readiness

**Goal:** Final polish, analytics, performance tuning, accessibility audit, and responsive design. The app is ready for public users.

### 7.1 Product Analytics

- [ ] Set up PostHog Cloud account (free tier, US region)
- [ ] Integrate PostHog SDK in the web app (initialized only after cookie consent)
- [ ] Instrument key events: sign-up, sign-in, notebook created, file opened, file saved, publish (GitHub), settings changed
- [ ] Create dashboards: sign-up funnel, DAU/WAU/MAU, feature usage, retention cohorts
- [ ] Anonymize IPs, use internal user IDs only, no PII in events

### 7.2 Performance Tuning

- [ ] Lighthouse audit: target 90+ on Performance, Accessibility, Best Practices, SEO
- [ ] Editor performance: verify 60fps during typing and scrolling with large documents (1MB+)
- [ ] File tree loading: verify < 2 seconds for trees up to 500 items
- [ ] File open latency: verify < 1 second for files up to 1 MB
- [ ] Code splitting: lazy-load editor, source system integrations, admin console
- [ ] Asset optimization: compress images, tree-shake unused code

### 7.3 Accessibility Audit

- [ ] WCAG 2.1 AA compliance review
- [ ] Keyboard navigation: all core workflows (sign-in, notebook tree, editor, modals, settings)
- [ ] Screen reader testing: editor, tree view, dialogs, toasts
- [ ] Focus management in modals and dialogs
- [ ] Color contrast verification in light and dark modes
- [ ] Reduced motion support (`prefers-reduced-motion`)

### 7.4 Full E2E Test Suite (Tier 3)

Expands the Playwright smoke tests from Phase 6.4 into comprehensive browser-level coverage:

- [ ] Configure multi-browser testing: Chromium, Firefox, WebKit
- [ ] Test suite: Authentication flows
  - [ ] Sign-up with email + password → lands in app with empty notebook state
  - [ ] Sign-in with existing account → sees previously created notebooks
  - [ ] Magic link flow (using Mailpit API to extract link)
  - [ ] OAuth flow with mock provider
  - [ ] 2FA sign-in flow (TOTP + email code)
- [ ] Test suite: Notebook & file management
  - [ ] Create notebook → appears in tree
  - [ ] Create file → opens in tab, file appears in tree
  - [ ] Create folder → appears in tree, can create files inside
  - [ ] Rename notebook/folder/file → tree and tab labels update
  - [ ] Delete notebook/file → removed from tree, tab closed
  - [ ] Import file from desktop → save location picker → file appears
  - [ ] Drag-and-drop file import
- [ ] Test suite: Editor
  - [ ] Type text → renders in WYSIWYG view
  - [ ] Toolbar actions: heading, bold, italic, list, code block, table
  - [ ] Slash commands: type `/` → command palette appears → select command
  - [ ] Toggle source view → shows Markdown → toggle back
  - [ ] Table editing: insert row/column, delete row/column, floating toolbar
  - [ ] Link insertion and editing via toolbar and context menu
- [ ] Test suite: Settings & preferences
  - [ ] Change display mode (light/dark/system) → UI updates
  - [ ] Change font size → editor text updates
  - [ ] Settings persist across sign-out and sign-in
- [ ] Test suite: Navigation
  - [ ] Legal pages accessible, back button preserves app state
  - [ ] Modal back-button integration (Settings, Account, Add Notebook)
  - [ ] Cookie consent banner interaction
- [ ] Test suite: Data isolation
  - [ ] User A's notebooks not visible to User B
  - [ ] Dev-skip user sees separate data from authenticated users
- [ ] Wire full E2E suite into CI (PR to `main`)

### 7.5 Responsive Design Polish

- [ ] Test on tablet (768px–1024px) and phone (< 768px) viewports
- [ ] Notebook pane: auto-collapse on narrow viewports, overlay when opened
- [ ] Touch-friendly tap targets (min 44px)
- [ ] Mobile-optimized toolbar (collapsible or scrollable)

### 7.6 Canary Deployment Process

- [ ] Document the canary deployment workflow: tag → deploy canary revision (0% traffic) → manual test via revision URL → traffic split (5%) → monitor → promote to 100%
- [ ] Test rollback procedure: shift traffic back to previous revision
- [ ] Run at least one canary deployment cycle before announcing public availability

### 7.7 Pre-Launch Checklist

- [ ] All OAuth provider apps configured for production redirect URIs
- [ ] GitHub App ("Notebook.md") published and accessible for installation
- [ ] Legal pages live at `/terms` and `/privacy`
- [ ] Cookie consent banner functional
- [ ] Monitoring and alerting active
- [ ] Error tracking (Sentry) capturing real errors
- [ ] Database backups verified (test a restore)
- [ ] Security review: re-run Opus/Codex reviews on the implemented codebase
- [ ] Load test: simulate 100 concurrent users
- [ ] README.md updated with final feature list

### 7.8 Phase 7 Validation

- **Technical:** App meets all performance, accessibility, and security benchmarks. Monitoring is live. Analytics are flowing. Canary process is validated.
- **UX:** The app is polished, responsive, and accessible. You're confident in the experience for public users.
- **Go/No-Go:** Final review of all requirements against the implementation. Any gaps are documented and triaged as V1 blockers or V1.1 fast-follows.

---

## Dependency Map

```
Phase 1 (Foundation)
  └──► Phase 2 (Auth)
         └──► Phase 3 (Source Integrations)
                └──► Phase 4 (Editor Polish)
                       └──► Phase 5 (Security & Admin)
                              └──► Phase 6 (Prod Deploy)
                                     └──► Phase 7 (Launch)
```

Phases are sequential — each builds on the previous. However, within each phase, many tasks can be parallelized (e.g., OneDrive/Google Drive/GitHub integrations in Phase 3 are independent of each other).

---

## Risk Register

| Risk | Impact | Mitigation | Phase |
|------|--------|------------|-------|
| Tiptap doesn't support a required Markdown feature | High | Evaluate Tiptap extensions early in Phase 1; have Milkdown as a fallback editor | 1 |
| Google `drive.file` scope is too restrictive (user can't browse existing files) | Medium | Test scope behavior in Phase 3; fall back to `drive.readonly` + `drive.file` if needed | 3 |
| GitHub App webhook reliability | Medium | Implement polling fallback (refresh tree on tab focus) alongside webhooks | 3 |
| KaTeX requires `unsafe-eval` in CSP | Medium | Verify in Phase 1; if needed, evaluate server-side rendering of math blocks | 1, 5 |
| IndexedDB storage limits in browsers | Low | 50MB+ available in most browsers; warn users of Local notebook storage limits | 1 |
| Azure Container Apps cold start latency | Medium | Configure minimum replica count ≥ 1; use health probes to keep warm | 6 |

---

## What's NOT in This Plan

These items are explicitly out of scope per requirements §12 and are not included in any phase:

- Native desktop apps (Tauri)
- Native mobile apps
- iCloud Drive / Apple Sign-In
- GitHub organization repos
- Real-time collaboration
- Offline-first mode
- Export (PDF/DOCX/HTML)
- Plugin system
- Public sharing
- Full-text search
- AI features
- Multiple language support (i18n framework is set up, but only English strings are written)

---

*This plan will be updated as we complete phases and incorporate feedback. Each phase boundary is a natural checkpoint for reviewing progress and adjusting course.*
