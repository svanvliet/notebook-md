# Notebook.md — Plan Status & Session Context

**Purpose:** This document is the running register of implementation progress, decisions made, and context needed for any agent session to continue the work. If a session ends, a new agent should read this file first to understand where we left off.

**Last Updated:** 2026-02-17

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

---

## Iteration Notes

*(Record any feedback from the user, design pivots, or technical discoveries here)*

---

## Open Questions

*(Any unresolved questions that need user input)*
