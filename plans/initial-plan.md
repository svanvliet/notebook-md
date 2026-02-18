# Notebook.md — Implementation Plan

**Version:** 1.0  
**Last Updated:** 2026-02-17  
**Requirements Reference:** `requirements/requirements.md` v1.4

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
- [ ] Footnotes extension
- [ ] KaTeX math extension (inline `$...$` and block `$$...$$`)
- [ ] Emoji shortcodes
- [ ] YAML front matter (collapsible metadata block)
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
- [ ] Image/video preview for media files in the tree
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

- [ ] Set up Express/Fastify API server with TypeScript
- [ ] Configure PostgreSQL connection with a migration tool (e.g., `node-pg-migrate` or Knex migrations)
- [ ] Create initial database migrations for all tables (§10.1): `users`, `identity_links`, `notebooks`, `user_settings`, `sessions`, `audit_log`, `feature_flags`, `announcements`
- [ ] Set up Redis connection for session storage and rate limiting
- [ ] Implement structured JSON logging (correlation IDs on every request)
- [ ] Configure error handling middleware: return correlation IDs to clients, never stack traces (even in dev — use Mailpit for secrets, Log Analytics for errors)
- [ ] Set up database seed script for local dev (default admin account `admin@localhost`)

### 2.2 Email Authentication

- [ ] Implement email sign-up flow:
  - Enter email → choose magic link or create password
  - Magic link: generate token, send via email (Mailpit in dev), verify on click
  - Password: validate strength, hash with bcrypt (cost 12+), store in `users.password_hash`
  - Email verification: send verification link, set `email_verified` flag
- [ ] Implement email sign-in flow:
  - Magic link: enter email → send link → verify
  - Password: enter email + password → validate → create session
- [ ] Implement password reset: enter email → send reset link → new password form
- [ ] Session management (§2.6):
  - Issue HttpOnly, Secure, SameSite session cookies
  - Refresh token rotation with family tracking (detect reuse → revoke all family tokens)
  - "Remember Me" checkbox: extends session to 30 days (refresh token)
  - Default session: 24 hours
- [ ] Rate limiting on auth endpoints (Redis-backed)
- [ ] Audit logging for auth events (sign-in, sign-up, password reset)

### 2.3 OAuth Provider Scaffolding

- [ ] Implement OAuth abstraction layer (provider-agnostic interface)
- [ ] Set up mock OAuth provider for local dev (simulates the OAuth redirect flow without real credentials)
- [ ] Wire up OAuth callback → account creation / linking logic
- [ ] Implement account merging rules (§2.3): OAuth↔OAuth auto-merge (verified email only); email+password ↔ OAuth requires manual link
- [ ] Configure Microsoft, Google, GitHub OAuth client registrations (real credentials can be added when ready; mock provider for dev)

### 2.4 Account Management UI

- [ ] Sign-in / sign-up page (§6.2, §6.3): provider buttons + email form
- [ ] Post-sign-in empty state (§6.4): "Add your first notebook" prompt
- [ ] Account dropdown (§7.1): display name, avatar, menu items
- [ ] Account Settings modal (§7.2): profile editing, linked accounts list (add/remove), danger zone (delete account)
- [ ] Settings modal (§7.3): display mode, font family, font size, margins, auto-save default, spell check, line numbers, tab size, word count toggle, GitHub delete-branch-on-publish
- [ ] Settings sync: persist to `user_settings` table via API, load on sign-in

### 2.5 Connect Auth to Local Notebooks

- [ ] Persist Local notebook configuration to the `notebooks` table (source_type: `local`) so the notebook list survives sign-out/sign-in
- [ ] Local notebook data remains in IndexedDB (browser-local); only the notebook metadata (name, config) is stored server-side

### 2.6 Phase 2 Validation

- **Technical:** Full auth flow works end-to-end locally; sessions persist; settings sync; Mailpit captures all emails
- **UX:** You can sign up with email, sign in, change settings (dark mode, font), sign out, sign back in, and see settings preserved. Local notebooks still work.
- **Feedback points:** Sign-in/sign-up flow, settings options, account modal UX

---

## Phase 3: Source System Integrations

**Goal:** Connect real cloud storage (OneDrive, Google Drive, GitHub) as notebook sources. You should be able to authenticate with each provider, browse files, and open/edit/save Markdown documents to your real cloud storage.

### 3.1 Source System Proxy Architecture

- [ ] Implement backend proxy layer (§8.2): all source system API calls routed through the API server
- [ ] OAuth token storage: encrypt tokens at rest with envelope encryption (AES-256 + a local dev key; KMS integration deferred to Phase 6)
- [ ] Token refresh logic: auto-refresh expired access tokens using stored refresh tokens
- [ ] Path validation middleware (§9.3 security): canonicalize paths, reject `..` traversal, validate paths are within notebook root
- [ ] Per-user rate limiting on file proxy endpoints (Redis-backed)
- [ ] Circuit breaker per source system (prevent cascading failures)

### 3.2 Microsoft OneDrive Integration

- [ ] Register Microsoft Entra ID app (dev tenant or personal)
- [ ] Implement OAuth flow for Microsoft (§2.1): personal + enterprise accounts
- [ ] Request scope: `Files.ReadWrite` + `User.Read` + `offline_access`
- [ ] Implement Microsoft Graph API proxy endpoints:
  - List folder contents (tree view)
  - Read file content
  - Write file content
  - Create file/folder
  - Delete file/folder
  - Rename/move file
- [ ] OneDrive icon in notebook tree
- [ ] Manual save to OneDrive (`Cmd/Ctrl+S`)
- [ ] Auto-save with debounce (3s inactivity, 30s max)

### 3.3 Google Drive Integration

- [ ] Register Google Cloud project + OAuth consent screen
- [ ] Implement OAuth flow for Google (§2.1)
- [ ] Request scope: `drive.file` + `profile` + `email`
- [ ] Implement Google Drive API proxy endpoints (same operations as OneDrive)
- [ ] Google Drive icon in notebook tree
- [ ] Manual and auto-save (same debounce as OneDrive)

### 3.4 GitHub Integration

- [ ] Register GitHub App ("Notebook.md") on GitHub
- [ ] Implement GitHub App installation flow (§9.1): redirect to install → callback → store installation ID
- [ ] Implement GitHub API proxy endpoints:
  - List repository contents (tree view — filtered to supported file types only)
  - Read file content (via Contents API)
  - Create/update files (via Contents API to working branch)
  - Create working branch (`notebook-md/<random-uuid>`) from base branch
  - List branches, get branch status
- [ ] GitHub Octocat icon in notebook tree
- [ ] Manual save: commit to working branch
- [ ] Auto-save: batch commits (30s inactivity threshold), squash on publish
- [ ] Publish flow: squash merge working branch → base branch (or open PR)
- [ ] "Delete branch on publish" setting integration
- [ ] Webhook endpoint (`/webhooks/github`):
  - HMAC-SHA256 signature verification
  - Timestamp validation (reject > 5 min old)
  - Delivery ID deduplication (Redis, 10-min TTL)
  - On external `push`: notify connected clients to refresh file tree

### 3.5 Add Notebook Flow

- [ ] "Add Notebook" UI: select source type → authenticate (if not linked) → browse/select folder or repo → name the notebook
- [ ] Notebook tree: show all notebooks with source-type icons, expandable file trees
- [ ] File type filtering in tree: only show `.md`, `.mdx`, `.markdown`, `.txt`, and supported media files
- [ ] Context menus on tree items: new file, new folder, rename, delete, move, refresh

### 3.6 Phase 3 Validation

- **Technical:** All three source systems work end-to-end: auth → browse → open → edit → save → verify file changed in the real source (OneDrive folder, Google Drive folder, GitHub repo)
- **UX:** You can add a OneDrive folder, a Google Drive folder, and a GitHub repo as notebooks, browse their contents, open a `.md` file, edit it, save it, and confirm the change shows up in the native app (OneDrive web, Google Drive web, GitHub.com)
- **Feedback points:** Add-notebook flow, tree browsing speed, save feedback, source icon clarity

---

## Phase 4: Editor Polish & Advanced Features

**Goal:** Complete the editor feature set — slash commands, split view, drag-and-drop, media handling, find/replace. This is the UX refinement phase.

### 4.1 Slash Commands

- [ ] Implement slash command palette (§4.5): type `/` to open overlay
- [ ] Commands: change block type (heading, paragraph, quote, code), insert table, insert image, insert horizontal rule, insert task list, insert code block (with language selector), insert math block, insert callout
- [ ] Filterable by typing after `/` (e.g., `/tab` → "Table")
- [ ] Keyboard navigation (arrow keys + Enter to select)

### 4.2 Split View

- [ ] Implement split pane within a single document tab: raw Markdown (left) ↔ WYSIWYG preview (right)
- [ ] Synchronized scrolling between panes
- [ ] Toggle split view via toolbar button or keyboard shortcut

### 4.3 Drag and Drop

- [ ] Block reordering: drag paragraphs, headings, lists to rearrange content within the editor
- [ ] Image drop: drag image files from desktop into the editor → upload to notebook `assets/` folder → insert Markdown reference
- [ ] File linking: drag a file from the notebook tree into the editor → insert relative Markdown link

### 4.4 Media Handling

- [ ] Image/media insert via toolbar and slash command:
  - Option 1: provide a URL → insert Markdown image/link
  - Option 2: upload file → store in `assets/` subfolder (relative to the `.md` file's folder) → insert relative reference
- [ ] 10 MB per-file upload limit with user-friendly error message
- [ ] Inline preview: images rendered at natural size in WYSIWYG view; videos rendered as embedded player
- [ ] Supported formats: `.jpg`, `.jpeg`, `.png`, `.svg`, `.gif`, `.webp`, `.mp4`, `.webm`
- [ ] Auto-create `assets/` folder if it doesn't exist

### 4.5 Find and Replace

- [ ] `Cmd/Ctrl+F` opens find bar within the active document
- [ ] Case-sensitive toggle, whole-word toggle
- [ ] Highlight all matches
- [ ] Replace one / Replace all

### 4.6 Toast Notifications

- [ ] Toast notification system (§5.5): top-right or bottom-right
- [ ] Types: info, success, warning, error
- [ ] Auto-dismiss (5s for info/success, persistent for errors until dismissed)
- [ ] Stacking behavior for multiple toasts

### 4.7 Status Bar Enhancements

- [ ] Ephemeral messages in the status bar (save confirmations, sync status)
- [ ] Auto-dismiss after 5 seconds

### 4.8 Phase 4 Validation

- **Technical:** All editor features work reliably across all notebook source types; media uploads work; drag-and-drop is smooth
- **UX:** Full editing experience — you can write a complex Markdown document using slash commands, format with the toolbar, insert images, drag to reorder, find/replace, and toggle between views. The editor should feel polished and responsive.
- **Feedback points:** Slash command discoverability, split view usefulness, drag-and-drop feel, toast positioning

---

## Phase 5: Admin Console, Security Hardening & Legal

**Goal:** Build the admin console, implement 2FA, harden security controls, and add legal pages. The app should be security-ready for production.

### 5.1 Two-Factor Authentication

- [ ] 2FA setup flow (§7.2 Security):
  - Enable: choose TOTP (scan QR code) or emailed codes → verify first code → save recovery codes
  - Disable: require current 2FA verification
- [ ] 2FA sign-in flow: after password verification, prompt for TOTP code or emailed code
- [ ] Recovery codes: bcrypt-hashed, one-time use, 10 codes generated
- [ ] TOTP secrets: encrypted with envelope encryption (same KMS scheme as OAuth tokens)
- [ ] API endpoints (§9.1): `/auth/2fa/setup`, `/auth/2fa/enable`, `/auth/2fa/disable`, `/auth/2fa/verify`, `/auth/2fa/recovery`

### 5.2 Admin Console

- [ ] Set up `apps/admin/` React SPA with Tailwind (shared component library from `packages/shared/`)
- [ ] Admin route middleware: verify `is_admin = true` on every admin API request
- [ ] Admin CLI script: `cli/promote-admin.js` — sets `is_admin = true` for a given email, run via `docker exec`
- [ ] Admin pages:
  - User management: search, view details, toggle dev_mode/suspended flags (cannot set `is_admin` via API)
  - System health dashboard: API status, DB status, Redis status, container uptime
  - Metrics overview: active users, sign-ups, notebook counts by source type
  - Audit log viewer: paginated, filterable by action/user/date
  - Feature flags: list, create, toggle
  - Announcements: create, edit, delete; display to users in main app
- [ ] Admin MFA enforcement (§8.9.2): verify `amr` claim (Microsoft/Google), `two_factor_authentication` (GitHub); require Notebook.md 2FA as fallback
- [ ] Admin action alerting: sensitive actions trigger email notifications to security distribution list
- [ ] Admin actions logged to audit log with `admin_action` flag

### 5.3 Security Hardening

- [ ] Content Security Policy (§11.2):
  - Nonce-based script/style loading
  - `img-src 'self' data: blob: *.sharepoint.com *.googleusercontent.com *.githubusercontent.com`
  - `connect-src 'self'`
  - `frame-src 'none'`, `object-src 'none'`
  - Verify KaTeX works without `unsafe-eval`
- [ ] CORS policy: `Access-Control-Allow-Origin` restricted to `notebookmd.io` and `admin.notebookmd.io` (and `localhost:*` in dev)
- [ ] CSRF protection on all state-changing endpoints
- [ ] HSTS header configuration
- [ ] Verify DOMPurify sanitization covers all Markdown XSS vectors (raw HTML, `javascript:` URIs, SVG scripts, `data:` URIs)
- [ ] Audit: ensure no tokens, secrets, or sensitive data can leak through error responses, logs, or client-side state

### 5.4 Cookie Consent Banner

- [ ] Custom cookie consent banner (§13.3): "Accept All", "Reject All", "Manage Preferences"
- [ ] Consent stored in first-party cookie (works pre-auth)
- [ ] PostHog initialized only after analytics consent
- [ ] Respect "Do Not Track" header

### 5.5 Legal Pages

- [ ] Terms of Service page at `/terms` — boilerplate for Van Vliet Ventures, LLC with liability limitation, indemnification, "as-is" warranty disclaimer
- [ ] Privacy Policy page at `/privacy` — data collected, data not collected (no document content), third-party services list, GDPR rights, contact info
- [ ] Link to Terms and Privacy from sign-up flow and app footer

### 5.6 Phase 5 Validation

- **Technical:** 2FA works end-to-end; admin console fully functional; CSP doesn't break editor features; CORS correctly blocks unauthorized origins
- **UX:** You can enable 2FA on your account, sign in with a TOTP code, access the admin console, view system health, and manage feature flags. Cookie consent banner appears for new visitors. Legal pages are readable.
- **Feedback points:** 2FA setup flow, admin console usability, cookie banner positioning, legal page content

---

## Phase 6: Production Deployment

**Goal:** Deploy the app to Azure. Set up the full infrastructure, CI/CD pipeline, DNS, monitoring, and run the first production deployment.

### 6.1 Infrastructure as Code

- [ ] Set up Terraform (or Pulumi) project for Azure resources:
  - Resource group (East US 2)
  - Azure Container Apps environment
  - Azure Container Registry (private)
  - Azure Database for PostgreSQL Flexible Server (Burstable B1ms, zone-redundant HA)
  - Azure Cache for Redis (Basic C0)
  - Azure Front Door (Standard tier) with CDN for SPA assets
  - Azure Key Vault for secrets (OAuth tokens encryption key, webhook secrets, etc.)
  - Azure Monitor / Application Insights workspace
- [ ] Configure managed identity for Container Apps → Key Vault access
- [ ] Migrate token encryption from local dev key to Azure Key Vault (envelope encryption with KMS-managed key)

### 6.2 Container Images

- [ ] Create production Dockerfiles (multi-stage builds) for:
  - `web` — Nginx serving the React SPA static build
  - `api` — Node.js production build
  - `admin` — Nginx serving the Admin SPA static build
- [ ] Image scanning with Trivy in CI
- [ ] Push to Azure Container Registry

### 6.3 CI/CD Pipeline

- [ ] GitHub Actions workflows:
  - **Build & Test** (every push/PR): lint, type-check, unit tests, build Docker images
  - **Production Deploy** (`v*` tag + manual approval): push images to ACR, deploy new Container Apps revision
  - **Rollback** (manual trigger): shift traffic to previous revision
- [ ] GitHub Environment `production` with protection rules (manual approval)
- [ ] Environment-scoped secrets for Azure credentials
- [ ] Branch protection on `main`: require PR reviews, no direct pushes
- [ ] Dependabot configuration

### 6.4 DNS & SSL

- [ ] Configure GoDaddy DNS records:
  - `notebookmd.io` → Azure Front Door
  - `api.notebookmd.io` → Azure Container Apps (API)
  - `admin.notebookmd.io` → Azure Container Apps (Admin)
- [ ] SPF, DKIM, DMARC records for `noreply@notebookmd.io` (transactional email)
- [ ] Azure-managed TLS certificates via Front Door

### 6.5 Monitoring & Alerting

- [ ] Application Insights: request tracing, dependency tracking, exception logging
- [ ] Azure Monitor availability tests (ping API and web endpoints)
- [ ] Alerts: error rate spikes, health check failures, high latency → email notification
- [ ] Structured logs → Log Analytics workspace
- [ ] Sentry integration for client-side error tracking (free tier)

### 6.6 Transactional Email

- [ ] Set up SendGrid account (free tier: 100 emails/day)
- [ ] Configure sender domain verification for `noreply@notebookmd.io`
- [ ] Switch API email transport from Mailpit to SendGrid in production config

### 6.7 Database

- [ ] Run production migrations
- [ ] Enable automated daily backups with 35-day PITR
- [ ] Enable geo-redundant backup storage
- [ ] Promote first admin account via CLI

### 6.8 First Deployment

- [ ] Tag `v0.1.0`, trigger CI/CD pipeline
- [ ] Approve production deployment
- [ ] Verify app is accessible at `notebookmd.io`
- [ ] Smoke test: sign up, create notebook, edit document, save
- [ ] Verify admin console at `admin.notebookmd.io`

### 6.9 Phase 6 Validation

- **Technical:** Full app running in Azure; CI/CD pipeline works end-to-end; monitoring captures real traffic; auto-scaling responds to load
- **UX:** The production app is indistinguishable from the local dev experience
- **Feedback points:** Page load speed, cold-start latency, OAuth redirect timing

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

### 7.4 Responsive Design Polish

- [ ] Test on tablet (768px–1024px) and phone (< 768px) viewports
- [ ] Notebook pane: auto-collapse on narrow viewports, overlay when opened
- [ ] Touch-friendly tap targets (min 44px)
- [ ] Mobile-optimized toolbar (collapsible or scrollable)

### 7.5 Canary Deployment Process

- [ ] Document the canary deployment workflow: tag → deploy canary revision (0% traffic) → manual test via revision URL → traffic split (5%) → monitor → promote to 100%
- [ ] Test rollback procedure: shift traffic back to previous revision
- [ ] Run at least one canary deployment cycle before announcing public availability

### 7.6 Pre-Launch Checklist

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

### 7.7 Phase 7 Validation

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
