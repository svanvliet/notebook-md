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

---

## Open Questions

*(Any unresolved questions that need user input)*
