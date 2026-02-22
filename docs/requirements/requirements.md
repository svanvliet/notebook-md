# Notebook.md — Product Requirements Document

**Version:** 1.9  
**Last Updated:** 2026-02-21  
**Status:** Draft  
**Domain:** notebookmd.io

---

## 1. Product Overview

Notebook.md is a web application (with future native desktop and mobile apps) that enables users to create, edit, and organize Markdown notebooks through an intuitive WYSIWYG canvas interface. Notebooks are stored in users' existing cloud storage and version control systems — the app itself stores only user account metadata and notebook configuration, not document content.

### 1.1 Design Principles

- **Simplicity first** — easy to use, easy to deploy, minimal friction
- **Leverage existing systems** — storage, sharing, and version control are delegated to source providers (OneDrive, Google Drive, GitHub)
- **Minimal data footprint** — the central system stores only account metadata and notebook linkages, never document content
- **Cross-platform** — single codebase targeting web first, with macOS and Windows desktop apps planned (deferred from V1), and future iOS/Android via Tauri Mobile
- **Internationalization-ready** — English only for V1, but all user-facing strings externalized for easy localization

---

## 2. User Accounts & Authentication

### 2.1 Identity Providers

Users can sign in or sign up using any of the following:

| Provider | Protocol | Account Types |
|----------|----------|---------------|
| Microsoft | OAuth 2.0 / OpenID Connect | Personal (MSA) and Enterprise (Microsoft Entra ID / M365) — individual user consent only (no tenant admin consent for V1) |
| GitHub | OAuth 2.0 | GitHub accounts (personal repos only; organization-owned repos deferred) |
| Google | OAuth 2.0 / OpenID Connect | Google accounts |
| Email | Magic link **and** email + password (user's choice) | Any email address |

### 2.2 Email Authentication

Email-based auth supports **both** options — the user chooses their preferred method:

- **Magic link:** User enters email → receives a one-time sign-in link → clicks to authenticate
- **Email + password:** User creates a password during sign-up; standard password-based login thereafter
  - Password reset via email link
  - Passwords hashed with bcrypt (cost factor 12+)

**Two-Factor Authentication (2FA):**
- 2FA is **optional for all email/password users** and can be enabled in Account Settings
- When enabled, after entering a correct password the user must complete a second factor:
  - **Option 1:** Emailed 6-digit code (sent to the account's verified email)
  - **Option 2:** TOTP authenticator app (e.g., Google Authenticator, Authy) — user scans a QR code during setup
- **Admin console access:** 2FA is **required** for email/password users accessing the admin console. OAuth-based logins (Microsoft, GitHub, Google) are considered sufficient for V1 and do not require an additional factor.

> **Future consideration:** Enforce that OAuth providers have MFA enabled (by checking the `amr` claim where available) before granting admin console access.
- Recovery codes: When 2FA is enabled, the user is given a set of one-time recovery codes to store securely

**Email delivery infrastructure:**
- Transactional email service required (e.g., SendGrid, AWS SES, or Azure Communication Services)
- Sender address: `noreply@notebookmd.io` (requires DNS records: SPF, DKIM, DMARC on the `notebookmd.io` domain)
- Used for: magic links, password reset links, account verification, 2FA codes

**Local development email testing:**
- Dev mode uses a local SMTP trap (e.g., Mailpit or MailHog) to capture all outgoing emails
- Magic links, reset URLs, and 2FA codes are **never logged to console output**, even in development — use the SMTP trap UI to retrieve them
- Dev mode is controlled by a **build-time flag** (`NODE_ENV=development`) compiled into the application, not a runtime environment variable. This ensures dev-mode behaviors cannot be accidentally enabled in production.

### 2.3 Account Linking & Merging

- A single Notebook.md account can be linked to multiple identity providers
- Users can add, edit, or remove linked providers from their account settings
- The first sign-in creates the account; subsequent providers are linked to the existing account

**Auto-merge rules (to prevent account takeover):**
- **OAuth ↔ OAuth:** If a user signs in with Provider A (e.g., Google) and later signs in with Provider B (e.g., Microsoft) using the same verified email address (`email_verified` claim is `true` from both providers), the accounts are automatically merged. The user is informed of the merge.
- **Email+Password ↔ OAuth:** Auto-merge is **never** performed. If an email+password account exists with the same email as an incoming OAuth sign-in (or vice versa), the user is prompted to sign in with their existing method first and then manually link the new provider from Account Settings. This prevents an attacker from pre-registering with a victim's email to hijack a future OAuth sign-in.
- **Manual linking:** Users can link additional providers from Account Settings at any time, even if email addresses differ. This requires the user to be authenticated on the current account first.

### 2.4 Central Account System

The backend account system stores **only**:

- Unique user ID (internal)
- Display name, avatar URL (sourced from providers where available)
- Linked identity provider references (provider type + provider-specific user ID)
- OAuth tokens / refresh tokens for each linked provider (encrypted at rest)
- Notebook configurations (see §3)
- User preferences / settings (see §7)
- Account flags (e.g., `is_dev_mode` for developer/admin accounts)

**No document content or file data is ever stored centrally.**

### 2.5 Security Best Practices

- All OAuth tokens encrypted at rest using envelope encryption (e.g., AES-256 with a KMS-managed key)
- Tokens are scoped to the minimum permissions required per provider:

| Provider | Scopes / Permissions | Rationale |
|----------|---------------------|-----------|
| **Microsoft (OneDrive)** | `Files.ReadWrite` (not `Files.ReadWrite.All`) + `User.Read` + `offline_access` | `Files.ReadWrite` limits to user's own files; `offline_access` for refresh tokens. Server-side path validation ensures only the configured folder is accessed. |
| **Google (Drive)** | `https://www.googleapis.com/auth/drive.file` + `profile` + `email` | `drive.file` limits access to files the app creates or the user explicitly opens — far safer than full `drive` scope |
| **GitHub** | GitHub App permissions: Contents (read/write), Metadata (read), Pull Requests (read/write) | Scoped by GitHub App installation — user selects which repos the app can access |

- **Server-side enforcement:** Regardless of OAuth scope granted, the backend validates that every file operation targets only resources within the user's configured notebook boundaries
- Short-lived access tokens with refresh token rotation
- HTTPS everywhere; HSTS enforced
- CSRF protection on all state-changing endpoints
- Rate limiting on auth endpoints
- **Rate limiting on file proxy endpoints:** Per-user rate limits on all `/api/notebooks/:id/files/*` and `/api/notebooks/:id/folders/*` endpoints to prevent abuse and protect source system API quotas
- **Source system backoff:** The proxy respects source system rate limit headers (`Retry-After`, `X-RateLimit-*`) and implements circuit breakers per source to prevent cascading failures
- Session management with secure, HttpOnly, SameSite cookies or short-lived JWTs
- Audit logging for account-level actions (link/unlink provider, notebook add/remove)

### 2.6 Session Management & "Remember Me"

- **Default session duration:** 24 hours (without "Remember Me")
- **"Remember Me" option:** Extends session to 30 days via a persistent refresh token
  - Refresh tokens are rotated on each use (one-time use)
  - If a refresh token is reused (indicating theft), all sessions for the user are invalidated
- **Native desktop apps:** "Remember Me" is enabled by default (users expect persistent sessions on native apps)
- **Token revocation:** The system honors token revocation immediately — if a user signs out on one device, or an admin revokes access, all active sessions using that refresh token family are invalidated
- **Idle timeout:** Optional idle timeout (configurable, default off) — after N minutes of inactivity, require re-authentication

---

## 3. Notebooks

A **Notebook** is a connection to a storage location on one of the supported source systems, tied to credentials from a linked identity provider. A user can have multiple Notebooks, including multiple Notebooks from the same source provider. The source system connection is shared between Notebooks linked to the same provider account.

### 3.1 Supported Source Systems

| Source | Backing Service | Notebook Root | Notes |
|--------|----------------|---------------|-------|
| **Local** | Browser IndexedDB / localStorage (web); local filesystem (native apps) | Virtual folder in browser storage | No account linkage required; available immediately; data lives on-device only |
| OneDrive | Microsoft Graph API | A OneDrive folder | Requires Microsoft account linkage |
| Google Drive | Google Drive API | A Google Drive folder | Requires Google account linkage |
| GitHub | GitHub App ("Notebook.md", installed by user) | A repository (or subfolder within a repo) owned by the user | Requires GitHub account linkage; user installs the Notebook.md GitHub App and selects specific repos to grant access; personal public and private repos only (org repos deferred) |

> **Local Notebooks:**
> - **Web app:** Files are stored in the browser's IndexedDB. Data is local to the browser/device and is not synced across devices or backed up centrally. Users should be warned that clearing browser data will delete Local notebook content.
> - **Native desktop apps (future):** Files are stored on the local filesystem. Default location is a `Notebook.md` folder in the user's Documents directory, configurable in Settings.
> - **Use cases:** Quick notes without configuring a source, offline drafting, testing/development, onboarding (new users can start writing immediately before connecting a cloud source).
> - **No backend interaction:** Local notebooks bypass the backend proxy entirely — all read/write operations happen client-side.

> **GitHub App Details:**
> - **App name:** "Notebook.md"
> - **Webhooks:** The app listens for `push` events on repos where it is installed. When an external push is detected (i.e., a commit not authored by Notebook.md), the app refreshes the file tree and notifies the user via a toast if an affected file is currently open. This ensures the Notebook stays in sync when repos have multiple contributors.
> - **Permissions:** Contents (read/write), Metadata (read), Pull Requests (read/write — for PR-based publish flow)

> **Deferred:** iCloud Drive support is deferred due to significant API limitations for third-party web apps. See §12.

### 3.2 Notebook Configuration (stored centrally)

- Notebook display name
- Source type (Local, OneDrive, Google Drive, GitHub)
- Source-specific location reference (folder path, repo + optional subfolder)
- Linked provider account reference
- Auto-save preference (on/off, per notebook)
- For GitHub: branch configuration, commit behavior preferences

### 3.3 Notebook Tree View

- Displayed in the **Notebook Pane** (left sidebar)
- Each Notebook shows a source-type icon:
  - **Local:** Device/folder icon
  - **GitHub:** Octocat icon
  - **OneDrive:** OneDrive cloud icon
  - **Google Drive:** Google Drive triangle icon
- Under each Notebook, the tree displays the file/folder hierarchy:
  - Nested sub-folders of any depth are supported
  - **Visible file types:** `.md`, `.mdx`, `.markdown`, `.txt`, and common media files (`.jpg`, `.jpeg`, `.png`, `.svg`, `.gif`, `.mp4`, `.webp`, `.webm`)
  - All other file types are hidden from the tree
- Tree supports expand/collapse, selection, and context menus (rename, delete, new file, new folder, move)

### 3.4 Notebook Operations

- **Add Notebook:** User selects a source type, authenticates if not already linked, then browses/selects a folder or repo
- **Remove Notebook:** Removes the Notebook configuration; does not delete remote files
- **Refresh:** Re-fetches the file tree from the source
- **Open file:** Opens a supported file in the document pane
- **New file:** Creates a new file at the selected location in the tree
- **New folder:** Creates a new folder at the selected location
- **Rename:** Renames a file or folder
- **Delete:** Deletes a file or folder (with confirmation)
- **Move:** Move files/folders within the Notebook via drag-and-drop or cut/paste
- **Drag-and-drop in Notebook Tree:**
  - Files and folders can be dragged within a Notebook to move them between folders
  - Files can be dragged between Notebooks of the **same source type** (copy operation)
  - Cross-source-type drag is not permitted (e.g., cannot drag from OneDrive to GitHub)
  - Dragging files within the tree must **not** trigger the app-level file import overlay
  - Visual feedback: drop target folder highlights; invalid targets show a "no drop" cursor
- **Notebook Reordering:** Notebooks can be dragged to reorder them in the Notebook pane; order is persisted

### 3.5 File Type Behavior

| File Extension | Editor Behavior |
|---------------|----------------|
| `.md`, `.mdx`, `.markdown` | Opens in WYSIWYG Markdown editor |
| `.txt` | Opens in editor, displayed as plaintext (no Markdown rendering) |
| `.jpg`, `.jpeg`, `.png`, `.svg`, `.gif`, `.webp` | Displayed as an image preview |
| `.mp4`, `.webm` | Displayed as a video player |

---

## 4. Document Editor (Canvas)

### 4.1 Editor Paradigm

The document pane is a **live WYSIWYG Markdown editor** — users see rendered Markdown as they type, not raw syntax. The editor operates on the Markdown source but presents a rich-text editing experience.

Users can toggle between WYSIWYG and **raw Markdown source view** via a keyboard shortcut (e.g., `Cmd/Ctrl+Shift+M`).

A **split view** mode is also available, showing raw Markdown on the left and the rendered WYSIWYG preview on the right, side by side within a single document tab.

### 4.2 Markdown Specification

The editor uses **GitHub Flavored Markdown (GFM)** as the base specification, extended with:
- Footnotes (reference and definition)
- Math (inline `$...$` and block `$$...$$` via KaTeX)

### 4.3 Supported Markdown Features

All "primary" Markdown elements must be supported:

| Category | Elements |
|----------|----------|
| **Headings** | H1 through H6 |
| **Inline formatting** | Bold, italic, strikethrough, inline code, highlight |
| **Links** | Inline links, reference links, auto-links |
| **Images** | Inline images with alt text (rendered inline in the editor) |
| **Lists** | Ordered lists, unordered (bullet) lists, nested lists, task/checkbox lists |
| **Blockquotes** | Single and nested blockquotes |
| **Code blocks** | Fenced code blocks with syntax highlighting (language hint) |
| **Tables** | GFM-style tables with alignment support |
| **Horizontal rules** | Thematic breaks (`---`, `***`, `___`) |
| **Footnotes** | Footnote references and definitions |
| **Math** | Inline and block LaTeX math (KaTeX / MathJax rendering) |
| **Emoji** | Shortcode emoji (`:smile:`) |
| **Front matter** | YAML front matter (displayed as a collapsible metadata block) |

### 4.4 Toolbar

When a document is open, the toolbar displays formatting controls:

- Heading level selector (H1–H6 + paragraph)
- Bold, Italic, Strikethrough, Inline Code
- Ordered list, Unordered list, Task list
- Blockquote
- Insert link, Insert image
- Insert table
- Insert code block
- Insert horizontal rule
- Undo / Redo

The toolbar is contextual — buttons reflect the formatting state at the cursor position.

### 4.5 Slash Commands

Typing `/` at the start of a line (or after a space) opens a command palette overlay with options to:

- Change block type (heading, paragraph, quote, code block, etc.)
- Insert a table
- Insert an image
- Insert a horizontal rule
- Insert a checkbox/task list
- Insert a code block (with language selector)
- Insert math block
- Insert callout/admonition

The palette is filterable by typing after `/` (e.g., `/tab` filters to "Table").

### 4.6 Keyboard Shortcuts

The editor supports comprehensive keyboard shortcuts for all common formatting and navigation actions, following platform conventions (Cmd on macOS, Ctrl on Windows/Linux):

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Bold | `Cmd+B` | `Ctrl+B` |
| Italic | `Cmd+I` | `Ctrl+I` |
| Strikethrough | `Cmd+Shift+S` | `Ctrl+Shift+S` |
| Inline code | `Cmd+E` | `Ctrl+E` |
| Insert link | `Cmd+K` | `Ctrl+K` |
| Undo | `Cmd+Z` | `Ctrl+Z` |
| Redo | `Cmd+Shift+Z` | `Ctrl+Shift+Z` |
| Save | `Cmd+S` | `Ctrl+S` |
| Find & Replace | `Cmd+F` | `Ctrl+F` |
| Toggle raw Markdown | `Cmd+Shift+M` | `Ctrl+Shift+M` |

Additional shortcuts for headings, lists, and block types. Shortcuts are **not user-configurable** in V1.

### 4.7 Find and Replace

- Standard find and replace (`Cmd/Ctrl+F`) within the active document
- Supports case-sensitive and whole-word matching
- Highlight all matches in the document
- Replace one or replace all

### 4.8 Drag and Drop

The editor supports drag-and-drop for:
- **Block reordering:** Drag paragraphs, headings, and other blocks to rearrange content
- **Image drop:** Drop image files from the desktop into the editor to insert them (uploaded to the Notebook's `assets` folder — see §4.11)
- **File linking:** Drag a file from the Notebook tree into the editor to insert a relative Markdown link

### 4.9 Tabbed Documents

- Multiple documents can be open simultaneously in the document pane
- Each open document appears as a tab at the top of the document pane
- Tab text shows the file name (e.g., `notes.md`)
- Tabs can be closed individually (with unsaved-changes warning if applicable)
- Active tab is visually distinguished
- Tab overflow behavior: scrollable tabs or a dropdown for excess tabs
- Unsaved changes indicated by a dot or icon on the tab

### 4.10 Saving

#### 4.10.1 Manual Save

- User explicitly saves via `Cmd/Ctrl+S` or a Save button in the toolbar
- The file is written back to the source system via the appropriate API

#### 4.10.2 Auto-Save

- Configurable per notebook (on/off)
- When enabled, the client captures changes and periodically saves to the source system
- **Debounce strategy by source type:**

| Source | Auto-Save Strategy |
|--------|--------------------|
| Local | Immediate: save to IndexedDB on every change (no debounce needed — local storage is fast) |
| OneDrive | Debounce: save after 3 seconds of inactivity, max interval 30 seconds |
| Google Drive | Debounce: save after 3 seconds of inactivity, max interval 30 seconds |
| GitHub | See §4.10.3 |

#### 4.10.3 GitHub Save Strategy — Working Branch Model

GitHub is version-controlled, so saving requires a more nuanced approach. **V1 implements the Working Branch Model:**

1. **On Notebook open:** The app fetches the relevant files from the configured base branch (e.g., `main`) into a local working state (in-memory or local cache — not a full git checkout).
2. **On save (manual or auto):** Changes are accumulated locally in the client. Each save writes to the local working state.
3. **Auto-save commits:** When auto-save is enabled, changes are committed to a **working branch** named `notebook-md/<random-uuid>` (cryptographically random, not containing username or session info to avoid leaking user identity on public repos). Commits are batched — accumulated changes are committed when the user pauses editing for a threshold period (e.g., 30 seconds of inactivity), reducing commit noise.
4. **Publish (squash merge):** The user explicitly "Publishes" changes, which **squashes all commits** from the working branch into a single commit on the base branch (or opens a PR, configurable). This keeps the base branch history clean.
5. **Conflict handling:** If the base branch has diverged, the app notifies the user and offers to rebase or merge.

**Future save strategy options (deferred):**
- Direct commit to main (for personal repos)
- Draft PR per session
- Fork-based workflow (for repos the user doesn't own)

> **Design note:** The save strategy is implemented behind an abstraction layer (`GitSaveStrategy` interface) so alternative strategies can be added in future versions without refactoring.

**User-configurable options for GitHub Notebooks:**
- Target base branch (default: repo default branch)
- Commit message template (default: `Update {filename} via Notebook.md`)
- Publish behavior: squash merge to base branch (default) or open PR
- **Delete branch on publish:** When enabled, the working branch is automatically deleted after a successful squash merge (default: on). Configurable per user in Settings.

### 4.11 Image & Media Handling

When a user inserts an image or media file into a document (via toolbar, slash command, paste, or drag-and-drop):

- **Option 1 — URL reference:** User provides a URL; a standard Markdown image/link is inserted
- **Option 2 — Upload to Notebook:** The file is uploaded to an `assets/` subfolder relative to the folder containing the `.md` file. A relative Markdown reference is inserted (e.g., `![alt](assets/photo.jpg)`)
- If the `assets/` folder doesn't exist, it is created automatically
- Supported upload formats: `.jpg`, `.jpeg`, `.png`, `.svg`, `.gif`, `.webp`, `.mp4`, `.webm`
- **Maximum upload size:** 10 MB per file
- **Inline preview:** When a media file is referenced in a Markdown document, the WYSIWYG editor renders it inline as a preview (images displayed at natural size within the content flow; videos rendered as an embedded player)

### 4.12 Print / Export PDF

Users should be able to print or export the current document as a clean PDF:

- **Trigger:** A "Print" button in the toolbar and standard keyboard shortcut (`Ctrl/Cmd + P`)
- **Approach:** CSS `@media print` stylesheet + browser-native `window.print()`
- **Print view removes all UI chrome:** toolbar, sidebar/notebook pane, tabs, status bar, and any modals or toasts are hidden; only the rendered document content is displayed
- **Document fills full page width** with appropriate print margins
- **Respects document margin settings:** the user's chosen margin preference (regular, wide, narrow) maps to corresponding print margins
- **Clean typography:** print styles ensure readable font sizes, proper heading hierarchy, and page-break rules (avoid widows/orphans, don't break inside code blocks or tables)
- **Links:** hyperlinks are preserved as clickable links in the PDF; optionally display the URL inline for reference
- **Images:** inline images are included in the print output at appropriate sizes
- **Code blocks:** syntax-highlighted code blocks render with a light background and monospace font suitable for print
- **No additional dependencies:** uses the browser's built-in print-to-PDF capability, which produces selectable text and small file sizes
- **Future enhancement:** if advanced features are needed (custom headers/footers, page numbers, watermarks), can upgrade to a client-side library without architectural changes

---

## 5. Application Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  [📓 Notebook.md]          Toolbar / Formatting Controls   [👤] │
├────────────────┬─────────────────────────────────────────────────┤
│                │  [Tab1.md] [Tab2.md] [Tab3.md]                 │
│   Notebook     │─────────────────────────────────────────────────│
│     Pane       │                                                │
│                │                                                │
│  ▼ Notebook1   │            Document Pane                       │
│    ▼ Folder    │         (WYSIWYG Markdown Editor)              │
│      file1.md  │                                                │
│      file2.md  │                                                │
│    ▶ Subfolder │                                                │
│  ▼ Notebook2   │                                                │
│    ...         │                                                │
│                │                                                │
├────────────────┴─────────────────────────────────────────────────┤
│  Status Bar: Word count: 1,234 | Last saved: 2 min ago          │
└──────────────────────────────────────────────────────────────────┘
```

### 5.1 Title / Toolbar

- **Left:** Notebook icon (logo placeholder) + "Notebook.md" app name
- **Center:** Formatting controls (visible when a document is open)
- **Right:** Account dropdown avatar/icon

### 5.2 Notebook Pane (Left Sidebar)

- **Collapsible** to a thin strip (toggle via button or keyboard shortcut)
- **Resizable** via drag handle
- Tree view of all Notebooks and their contents
- Source-type icons on each Notebook root node
- Context menus for file/folder operations (create, rename, delete, move)

### 5.3 Document Pane (Right / Main Area)

- Tab bar at top
- WYSIWYG editor fills remaining space
- Scrollable document with configurable margins

### 5.4 Status Bar (Bottom)

- Thin bar spanning full width
- Persistent stats: word count, character count, last saved timestamp
- Ephemeral messages: save confirmations, error notifications, sync status
- Messages auto-dismiss after a configurable duration (e.g., 5 seconds)

### 5.5 Toast Notifications

- System messages, errors, and sync conflicts displayed as toast notifications (top-right or bottom-right)
- Toasts auto-dismiss after a duration (e.g., 5 seconds for info/success, persistent for errors until dismissed)
- Toast types: info, success, warning, error — each with distinct color and icon
- Stacking behavior for multiple simultaneous toasts (newest on top, max ~5 visible)

#### 5.5.1 Notification Catalog

The following events should produce toast notifications:

**Success (auto-dismiss ~4s, green):**
- File saved / auto-saved
- Notebook created (local)
- Remote notebook added (OneDrive, Google Drive, GitHub)
- Notebook deleted
- File or folder created
- File imported
- File or folder deleted
- File moved
- File copied (cross-notebook)
- Changes published to main (GitHub)
- Profile updated
- Password changed
- Provider linked to account
- Provider unlinked from account
- Email verified
- Settings saved

**Info (auto-dismiss ~4s, blue):**
- No pending changes to publish (GitHub)
- Magic link sent — check your email
- Password reset email sent
- Signed out

**Warning (auto-dismiss ~6s, amber):**
- File too large (exceeds 10 MB upload limit)
- File move not supported for remote notebooks
- File copy not supported to remote notebooks
- Insufficient scope — re-authorize provider

**Error (persistent until dismissed, red):**
- Failed to load files
- Failed to add notebook
- Failed to create file or folder
- Failed to open file
- Failed to save / auto-save failed
- Failed to publish changes (GitHub)
- Failed to move file
- Failed to copy file
- Sign-in failed (invalid credentials)
- Sign-up failed (account already exists)
- OAuth error (provider conflict, account exists with password)
- Provider link failed
- Provider unlink failed (only sign-in method remaining)
- Password change failed
- Network or API error

### 5.6 Responsive Design & Mobile Web

The web app is fully responsive and optimized for mobile browsers (phones and tablets). The `md` breakpoint (768px) separates mobile and desktop layouts.

#### 5.6.1 Mobile Navigation
- Marketing pages use a **hamburger menu** below `md` breakpoint
- Tapping the hamburger icon (☰) opens a slide-down overlay with nav links, "Try Demo", and "Sign In"
- Menu closes on: link tap, backdrop tap, Escape key, or route change
- All touch targets are ≥ 44×44px

#### 5.6.2 Mobile App Layout
- **Notebook pane**: Hidden by default on mobile; accessible via a hamburger icon (☰) in the TitleBar
- Pane opens as a full-height **left drawer overlay** with semi-transparent backdrop and slide-in animation
- Selecting a file closes the drawer automatically
- The editor takes full viewport width when the drawer is closed

#### 5.6.3 Compact Editor Toolbar
- On mobile, only primary formatting actions are visible (Heading, Bold, Italic, Bullet List, Link)
- An overflow menu ("⋯ More") reveals remaining actions in a grid layout
- Desktop shows the full toolbar unchanged

#### 5.6.4 Scrollable Tab Bar
- When multiple files are open, the tab bar scrolls horizontally
- Left/right chevron buttons appear when tabs overflow
- The active tab auto-scrolls into view

#### 5.6.5 Responsive Modals
- All modal dialogs use responsive margins (`mx-2` on mobile, `mx-4` on desktop) and `max-h-[90vh]`
- Modals are usable on phone screens without horizontal overflow

#### 5.6.6 Condensed Status Bar
- Character count hidden on mobile
- Font size reduced; safe area insets applied for devices with home indicator

#### 5.6.7 iOS Compatibility
- `viewport-fit=cover` meta tag for full-screen edge-to-edge rendering
- Input font size set to 16px to prevent iOS auto-zoom on focus
- Safe area inset padding on StatusBar and CookieConsentBanner

#### 5.6.8 Split View
- Split view toggle (WYSIWYG/source) hidden on mobile — only relevant for desktop/tablet widths

#### 5.6.9 Internal Document Links
- Relative `.md` links (e.g., `[text](./Basics/file.md)`) open in a new editor tab within the app
- External links (`http://`, `https://`) open in a new browser tab
- Link behavior is determined by URL protocol detection in the TipTap Link extension

### 5.7 Client-Side Routing

The web app uses **React Router** (`react-router-dom`) with `BrowserRouter` for SPA navigation:

- All client-side routes are defined in a central `Router.tsx` component
- Routes: `/` (main app), `/terms` (Terms of Service), `/privacy` (Privacy Policy), `/features`, `/about`, `/contact`
- Unknown routes redirect to `/` via a catch-all route
- **Background location pattern:** When navigating to legal pages from within the app, the main App component stays mounted (preserving all state — open tabs, expanded notebooks, editor content). The legal page renders as a full-screen overlay. Direct URL access renders the legal page standalone.
- **Modal history integration:** Opening modals (Settings, Account, Add Notebook) pushes a browser history entry. Pressing the back button closes the modal naturally. Uses `useModalHistory` hook.
- Legal pages and other standalone pages support browser back/forward navigation, direct URL access, and bookmarking
- Auth callback routes (`/app/magic-link`, `/app/verify-email`, `/app/auth-error`) are handled by the main App component and cleaned up via `navigate(replace)`
- Production deployment requires the web server to serve `index.html` for all non-API routes (SPA fallback)

### 5.8 URL-Based Navigation & Deep Linking

Documents are addressable via URL, enabling deep linking, browser history navigation, and shareable links:

- **URL structure:** `/app/:notebookName/*` for signed-in users, `/demo/:notebookName/*` for demo mode
  - Notebook name is URL-encoded (e.g., `/app/Local%20Notebook/Folder/file.md`)
  - File path supports arbitrary nesting (catch-all `*` parameter)
- **Browser back/forward:** Switching between documents pushes history entries; back/forward navigates between previously viewed documents
- **Deep linking:** Pasting an app URL into a new browser window opens the specified file directly after authentication completes
  - If not signed in, the URL is stored in `sessionStorage` (`nb:returnTo`) and restored after login
  - Demo mode deep links (`/demo/...`) auto-enter demo mode and open the specified file
- **Tab close behavior:** Closing a tab uses `history.replace` (not push) to avoid polluting history with intermediate states
- **Close all tabs:** Navigates to `/app` or `/demo` base URL

### 5.9 Session Persistence

The app preserves workspace state across page refreshes using `sessionStorage` (per-tab, cleared on tab close):

- **Open tabs:** Persisted as `nb:tabs` — array of `{id, notebookId, path, name}`. Restored on refresh via a coordinated `restoreTabs` flow that also handles the URL file.
- **Tree expansion state:** `nb:tree:notebooks` and `nb:tree:folders` — sets of expanded notebook/folder IDs, restored in `NotebookTree` component initialization.
- **Active document:** Determined by the URL (not stored separately). On refresh, the URL file is included in tab restoration and set as active.
- **Remote notebook files:** When expanded remote notebooks are restored from sessionStorage, their file trees are re-fetched automatically.
- **Demo mode:** Persisted via `sessionStorage('notebookmd:demoMode')` flag, restored on mount.

### 5.10 In-Document Link Handling

Links within rendered Markdown documents are intercepted and handled in-app:

- **App URLs** (`/app/Notebook/file.md`, `/demo/Notebook/file.md`): Routed through React Router `navigate()` — opens the file in a new tab within the app without page reload
- **Relative .md links** (`file.md`, `../folder/file.md`): Resolved relative to the current document's directory, then navigated via the URL routing system
- **External URLs** (`https://...`): Opened in a new browser tab with `target="_blank"` and `rel="noopener noreferrer nofollow"`
- **Anchor links** (`#section`): Handled by the browser's default scroll behavior

### 5.11 Document Outline Pane

A collapsible panel between the notebook pane and the document pane that displays a navigable table of contents for the active document:

- **Heading extraction:** Parses the active document's TipTap editor state for all heading nodes (`h1`–`h6`), displayed in real-time as the user edits
- **Hierarchical tree view:** Headings are displayed as an indented tree reflecting their nesting depth (e.g., `##` nested under `#`, `###` nested under `##`)
- **Click-to-scroll:** Clicking a heading in the outline scrolls the document pane to that heading, positioning it at the top of the visible area
- **Active heading highlight:** The currently visible heading (based on scroll position) is highlighted in the outline to indicate reading position
- **Collapsible:** The outline pane can be expanded/collapsed independently of the notebook pane, via a toggle button or keyboard shortcut
- **Resizable:** Drag handle between the outline pane and the document pane to adjust width
- **Width persistence:** Collapsed state and width are persisted to `localStorage`
- **Empty state:** When the active document has no headings, the outline pane shows a brief message (e.g., "No headings found")
- **No active document:** When no document is open, the outline pane is hidden or shows a placeholder
- **Mobile:** The outline pane is hidden on mobile viewports; outline access can be provided via a toolbar button or sheet in a future iteration

---

## 6. Welcome Screen & Onboarding

### 6.1 Welcome Screen

Displayed when the user is not signed in:

- App logo (notebook icon placeholder) and "Notebook.md" branding
- Tagline (e.g., "Your Markdown notebooks, everywhere.")
- **Sign In** button → opens sign-in flow
- **Sign Up** button → opens sign-up flow
- Clean, centered layout; minimal distractions

### 6.2 Sign-In Flow

- User presented with identity provider buttons:
  - "Continue with Microsoft"
  - "Continue with GitHub"
  - "Continue with Google"
  - "Continue with Email"
- Selecting a provider initiates the OAuth flow (redirect or popup)
- Email option: enter email → choose magic link or create password
- On success: redirect to main app view

### 6.3 Sign-Up Flow

- Identical UI to sign-in (provider buttons + email)
- If the account doesn't exist, it is created automatically on first sign-in
- Optional: first-time onboarding wizard after account creation:
  1. Welcome message
  2. Prompt to connect a source ("Connect your first notebook source")
  3. Brief feature tour (optional, skippable)

### 6.4 Post-Sign-In (No Notebooks)

- If the user has no Notebooks configured, show an empty state with a prompt: "Add your first notebook" with buttons for each source type

### 6.5 Demo Mode (Try Without Account)

Users can explore the app without creating an account via a limited "demo mode":

#### 6.5.1 Entry Points
- **WelcomeScreen:** "Try it free — no account needed" button displayed prominently above the Sign In button
- **MarketingNav:** "Try Demo" button visible on all public pages (Home, Features, About, Contact)

#### 6.5.2 Demo Mode Behavior
- Demo mode activates without any server-side authentication; state stored in `sessionStorage` (clears on tab close)
- A synthetic demo user is created client-side (no API calls)
- Full editor functionality is available — users can create, edit, and manage local notebooks
- Local notebooks are stored in IndexedDB under the `anonymous` scope

#### 6.5.3 Feature Restrictions
- **Remote sources disabled:** GitHub, OneDrive, and Google Drive notebook sources are not available
- **Account settings hidden:** No account management or source linking options
- **Restricted UI elements** show "Sign up to connect" or "Create a free account" calls-to-action that link directly to the sign-up form

#### 6.5.4 Demo Banner
- A dismissible informational banner appears at the top of the main app view: "You're using Notebook.md in demo mode. Create a free account to connect cloud storage and sync across devices."
- The banner's "Create a free account" link navigates directly to the sign-up form

#### 6.5.5 TitleBar in Demo Mode
- Account dropdown shows: "Demo Mode" label, Settings (allowed), "Create Account" CTA, "Exit Demo"
- Account Settings, Admin Site, and Sign Out are hidden

#### 6.5.6 Demo-to-Account Migration
- When a demo user signs up, all notebooks and files created during the demo session are automatically migrated from the `anonymous` IndexedDB to the new user's scoped database
- The anonymous database is deleted after successful migration
- Migration preserves notebook structure, file content, and metadata

#### 6.5.7 Exit Demo
- "Exit Demo" returns the user to the welcome screen
- Demo session data remains in IndexedDB until the user signs up or the browser clears storage

#### 6.5.8 Demo Notebook (Tutorial Content)
- On first entry into demo mode, a **Demo Notebook** is automatically created with tutorial content:
  - `Getting Started.md` — Welcome overview of the UI, links to sub-pages
  - `Basics/Markdown Essentials.md` — Formatting reference (headings, lists, tables, code, etc.)
  - `Basics/Keyboard Shortcuts.md` — Editor keyboard shortcuts reference
  - `Features/Slash Commands.md` — Complete list of available `/` commands
  - `Features/Cloud Storage.md` — How to connect GitHub, OneDrive, Google Drive
- `Getting Started.md` auto-opens in the editor and the notebook tree expands to show its location
- The demo notebook uses a stable ID so it is not recreated on re-entry
- Tutorial files contain inter-document links that open in new editor tabs (see §6.5.9)

#### 6.5.9 Internal Deep Links
- Relative `.md` links within documents (e.g., `[Markdown Essentials](./Basics/Markdown%20Essentials.md)`) are intercepted on click
- Instead of opening a new browser tab, the linked file opens in a new **editor tab** within the app
- Paths are resolved relative to the current file's directory, with `..` and `.` segments normalized
- URL-encoded characters (e.g., `%20` for spaces) are decoded for file lookup
- The notebook tree auto-expands to show the opened file's location
- External links (http/https) continue to behave normally

---

## 7. Account & Settings

### 7.1 Account Dropdown

Located at the top-right of the toolbar. Clicking opens a dropdown menu:

- **User display name + avatar** (non-interactive, header)
- **Account Settings** → opens Account modal
- **Settings** → opens Settings modal
- **Sign Out**

### 7.2 Account Settings Modal

- **Profile:** Display name, avatar (pulled from linked provider or uploaded)
- **Linked Accounts:** List of linked identity providers with options to:
  - Add a new provider link
  - Remove an existing link (with confirmation; cannot remove last link)
  - Re-authenticate (if token expired)
- **Security:**
  - Enable/disable Two-Factor Authentication (2FA) for email/password login
  - When enabling: choose TOTP authenticator app or emailed codes; scan QR code for TOTP; save recovery codes
  - When disabling: require current 2FA verification before disabling
- **Danger Zone:** Delete account (with confirmation)

### 7.3 Settings Modal (Preferences)

Settings are **global** (not per-notebook) and **synced across devices** (stored server-side).

| Setting | Options | Default |
|---------|---------|---------|
| **Display Mode** | Light, Dark, System | System |
| **Editor Font Family** | Selectable from a curated list (e.g., Inter, SF Mono, JetBrains Mono, system default) | System default |
| **Editor Font Size** | Slider or input (12–24px) | 16px |
| **Document Margins** | Narrow, Regular, Wide | Regular |
| **Auto-save default** | On / Off (default for new notebooks) | Off |
| **Spell check** | On / Off | On |
| **Line numbers in code blocks** | On / Off | Off |
| **Tab size** | 2 / 4 spaces | 4 |
| **Show word count in status bar** | On / Off | On |
| **GitHub: Delete branch on publish** | On / Off | On |

---

## 8. Technology & Architecture

### 8.1 Recommended Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | React + TypeScript | Industry standard, massive ecosystem, strong typing |
| **Styling** | Tailwind CSS | Utility-first CSS framework; rapid prototyping, consistent design tokens, excellent dark mode support |
| **Editor Engine** | Tiptap (built on ProseMirror) | Best-in-class WYSIWYG Markdown editor; extensible, well-maintained, supports slash commands natively |
| **Desktop (Mac/Win)** | Tauri (deferred from V1) | Shares the React codebase; see §8.6 |
| **Backend API** | Node.js (Express or Fastify) + TypeScript | Same language as frontend; lightweight, fast |
| **Database** | PostgreSQL | Reliable, mature; only stores account metadata |
| **Cache / Sessions** | Redis | Fast session storage, rate limiting |
| **Auth** | Passport.js or Auth.js (NextAuth) | Multi-provider OAuth support out of the box |
| **Email** | SendGrid, AWS SES, or Azure Communication Services | Transactional email for magic links, password resets, and 2FA codes; sender: `noreply@notebookmd.io` |
| **i18n** | react-i18next | Industry standard; all user-facing strings externalized from day one |
| **Analytics** | PostHog (self-hosted or cloud) | Open-source, privacy-respecting product analytics; event tracking, funnels, feature flags |
| **Container Runtime** | Docker | Standard containerization |
| **Orchestration** | Docker Compose (dev), Azure Container Apps (prod) | See §8.4 |
| **CI/CD** | GitHub Actions | Native to the codebase hosting |
| **IaC** | Terraform or Pulumi | Cloud-agnostic infrastructure-as-code |

### 8.2 Application Architecture

```
┌─────────────┐      ┌─────────────────────────────────┐
│   Browser /  │      │       Notebook.md API            │
│   Desktop    │◄────►│    (Node.js + TypeScript)        │
│   Client     │      │                                  │
│  (React +    │      │  - Auth / Session mgmt           │
│   Tiptap)    │      │  - Notebook CRUD                 │
│              │      │  - User preferences              │
│              │      │  - Source system proxy            │
│              │      │    (all file ops routed here)     │
└──────────────┘      └──────────┬───────────────────────┘
                                 │
                      ┌──────────▼───────────┐
                      │     PostgreSQL       │
                      │   (metadata only)    │
                      └──────────────────────┘
                                 │
                      ┌──────────▼───────────────────┐
                      │  Source System APIs           │
                      │  - Microsoft Graph (OneDrive) │
                      │  - Google Drive API           │
                      │  - GitHub API                 │
                      └──────────────────────────────┘
```

**Key architectural decision — Backend Proxy Model:** All source system API calls are routed through the Notebook.md backend. OAuth tokens are **never** sent to or held in the browser/client. The user authenticates with their source provider via standard OAuth; the resulting tokens are stored encrypted on the backend. The client authenticates to the Notebook.md API using a session cookie (HttpOnly, Secure, SameSite). The API uses the user's own OAuth token to call source system APIs on their behalf.

This architecture:
- **Prevents token theft via XSS** — even if an XSS vulnerability exists, the attacker cannot access the user's OneDrive/Google Drive/GitHub tokens because they never reach the browser
- **Still uses the user's own token** — no app-specific token layer. The user authorizes Notebook.md via OAuth, and their token is what accesses their files
- **Simplifies the client** — the client only needs to call Notebook.md API endpoints, not handle multiple source system APIs directly

**Exception — Local notebooks:** Local notebooks (§3.1) operate entirely in the browser using IndexedDB/localStorage. No backend proxy is needed since no external APIs are involved.

> **Future optimization (§12):** For high-traffic read operations at scale, the backend can generate short-lived pre-signed/pre-authenticated URLs (supported by OneDrive and Google Drive) that allow the browser to download file content directly from the source without exposing the full OAuth token. This reduces backend bandwidth for reads while maintaining the security model.

### 8.3 Container Strategy

**Recommended: Multi-container with Docker Compose / Kubernetes**

| Container | Contents |
|-----------|----------|
| `web` | Nginx serving the React SPA static assets |
| `api` | Node.js backend API |
| `db` | PostgreSQL |
| `cache` | Redis |

**Why multi-container over single:**
- Independent scaling (API can scale separately from static serving)
- Independent deployments (update API without redeploying frontend)
- Follows 12-factor app principles
- Simpler health checks and monitoring per service
- Database and cache can be swapped for managed services in production

**For development:** Docker Compose with all four containers, plus hot-reload for frontend and API.

**For production:** Azure Container Apps for orchestration, auto-scaling, rolling deployments, and health management. Canary deployments supported (see §8.5).

### 8.4 Cloud Deployment — Provider Agnostic with Provider Benefits

**Cloud-agnostic approach:**
- Containerized deployment works on any cloud (or on-prem)
- Use Terraform or Pulumi for infrastructure-as-code (IaC) to abstract provider specifics
- Store secrets in a provider-agnostic vault (e.g., HashiCorp Vault) or use the cloud-native equivalent

**Azure-specific benefits:**
- **Azure Container Apps:** Simpler than full K8s; serverless scaling, built-in Dapr support, native revision-based canary deployments
- **Azure Key Vault:** Managed secret storage, integrates with Container Apps via managed identity
- **Azure Front Door / CDN:** Global edge caching for the SPA
- **Azure Database for PostgreSQL — Flexible Server:** Managed PostgreSQL with automated backups, HA, and geo-redundancy options
- **Azure Cache for Redis:** Managed Redis with built-in HA
- **Benefit of Azure:** Since Microsoft auth is a primary provider, using Azure's ecosystem (Entra ID, Graph API) may simplify token management and reduce latency for OneDrive operations

**AWS-specific benefits:**
- **AWS App Runner or ECS Fargate:** Simpler container deployment without managing K8s
- **AWS Secrets Manager:** Managed secrets
- **CloudFront:** CDN for SPA assets
- **RDS PostgreSQL:** Managed PostgreSQL
- **ElastiCache:** Managed Redis

**Recommendation:** Start with **Azure Container Apps** for production — it's simpler than full Kubernetes, supports canary deployments via traffic splitting between revisions, has built-in scaling, and the Azure ecosystem alignment with Microsoft auth is a natural fit. Use Docker Compose locally. If the app outgrows Container Apps, migrate to AKS with minimal changes since both use the same container images.

### 8.5 Environments & Dev Mode

**Environments:**

| Environment | Purpose | Infrastructure |
|-------------|---------|---------------|
| **Local** | Development and testing | Docker Compose on developer machine |
| **Production** | Live user traffic | Azure Container Apps with canary deployment |

**Canary deployments (instead of separate staging):**
- Azure Container Apps supports **revision-based traffic splitting** — deploy a new revision and route a small percentage of traffic (e.g., 5%) to it before promoting to 100%
- Canary revisions can be accessed directly via a revision-specific URL for manual testing before enabling traffic split
- Rollback is instant — shift traffic back to the previous revision

**Dev Mode:**
- Controlled by a **build-time flag** (`NODE_ENV=development`), not a runtime environment variable. Dev-mode code paths are compiled out of production builds, making it impossible to accidentally enable them in production.
- Dev mode enables:
  - Local email capture (Mailpit/MailHog) — secrets are **never** logged to console; use the SMTP trap UI
  - Mock OAuth providers for testing without real credentials
  - Verbose server-side logging (to local log files/console, never to client responses)
  - Debug panel in the client UI (completely absent from production builds)
- **Account-level dev mode (production):** Specific user accounts can be flagged as `is_dev_mode = true` in the database. This enables:
  - A lightweight diagnostic overlay showing request latency, cache hit/miss, and correlation IDs (non-sensitive info only)
  - Enhanced server-side logging for that user's requests (logged to the backend logging system, **never** returned in API responses)
  - **Never:** detailed error messages, stack traces, or token metadata are exposed to the client, even for dev-mode accounts. Errors return a correlation ID; developers look up details in Azure Monitor / Log Analytics.

### 8.6 Local Development

- `docker compose up` starts all services locally
- Frontend dev server with hot module replacement (Vite)
- API dev server with `nodemon` or `tsx --watch`
- PostgreSQL and Redis run in containers
- Mailpit runs in a container for email capture
- `.env` file for local configuration
- Mock/test OAuth providers for development without real credentials

### 8.7 Native Desktop Apps (macOS & Windows) — Deferred from V1

Desktop apps are deferred from V1 to focus on the web experience. The architecture decisions below ensure the web codebase is ready for desktop packaging when the time comes.

**Option A: Tauri (Recommended)**

| Pros | Cons |
|------|------|
| Uses the same React + TypeScript codebase | Relies on system WebView (WebKit on macOS, WebView2 on Windows) — minor rendering differences |
| Rust backend — tiny binary, low memory, fast startup | Smaller ecosystem than Electron |
| ~5–10 MB bundle vs. ~150 MB for Electron | Rust knowledge needed for native features |
| Native OS integration (menus, file dialogs, notifications) | |
| **Tauri Mobile (stable) supports iOS and Android** — same codebase extends to mobile | |

**Option B: Electron**

| Pros | Cons |
|------|------|
| Largest desktop web-app ecosystem | Ships Chromium — large bundles (~150 MB+) |
| Exact same rendering as web (bundled Chromium) | Higher memory usage |
| Extensive documentation and community | No native mobile path (need React Native or similar) |

**Option C: Separate native apps (Swift for macOS, C#/WinUI for Windows)**

| Pros | Cons |
|------|------|
| Best native feel and performance | Two separate codebases (three including web) |
| Deep OS integration | Higher development and maintenance cost |
| | Different UI framework for each platform |

**Recommendation:** **Tauri** — it shares the React codebase, produces small binaries, and its mobile support (Tauri Mobile for iOS/Android) provides a future path to mobile apps from the same codebase. This aligns with the goal of code reuse across web, desktop, and eventually mobile.

### 8.8 Future Mobile Apps (iOS & Android)

Considerations that influence desktop app choice:

| Desktop Choice | Mobile Path |
|----------------|-------------|
| Tauri | Tauri Mobile (same React codebase → iOS & Android) |
| Electron | React Native (shared business logic, different UI layer) or Capacitor |
| Native (Swift/C#) | Swift → iOS native; Kotlin/C# → Android native (most effort) |

Tauri provides the most unified path: one React codebase → web + macOS + Windows + iOS + Android.

### 8.9 Administration Console

A separate web application for system administration, deployed alongside the main app but accessible only to authorized admin accounts. **Not accessible from native desktop clients — web only.**

#### 8.9.1 Admin Console Features

| Feature | Description |
|---------|-------------|
| **User Management** | Search, view, and manage user accounts. View linked providers, Notebook configurations. Flag accounts as dev mode. Suspend or delete accounts. |
| **System Health Dashboard** | Real-time view of API health, database status, Redis status, container health, error rates |
| **Metrics Overview** | Active users, sign-ups, Notebook counts by source type, API request volume |
| **Audit Log Viewer** | Browse audit log entries (sign-ins, account changes, Notebook operations) |
| **Feature Flags** | Toggle feature flags for canary features, A/B tests, or kill switches |
| **Announcements** | Create system-wide announcements displayed to users (e.g., maintenance windows) |

**Admin action security:**
- All admin actions are logged to the audit log with a distinct `admin_action` flag for easy filtering
- Sensitive admin actions (user suspension, user deletion, feature flag changes) trigger real-time alerts (email to a configured security distribution list)
- Admin promotion (`is_admin = true`) can **only** be performed via the CLI (`promote-admin.js`) — the API endpoint explicitly rejects requests to set this flag

#### 8.9.2 Admin Console Architecture

- Separate React SPA (can share component library with main app via a shared package)
- Same API backend — admin endpoints protected by admin role middleware
- Deployed as an additional container in the fleet (`admin` container serving static assets)
- Accessed via a separate subdomain (e.g., `admin.notebookmd.io`)
- Authentication: same identity providers as the main app, but access restricted to accounts with `is_admin = true` flag
- **2FA required for all admin logins:**
  - Email/password admins: must have 2FA enabled on their Notebook.md account (TOTP or emailed code)
  - OAuth admins: the API checks for MFA verification where the provider supports it:
    - **Microsoft:** Check the `amr` claim in the OIDC token for `mfa`
    - **Google:** Check the `amr` claim for multi-factor methods
    - **GitHub:** Check the `two_factor_authentication` field via the GitHub User API
  - If MFA is not detected from the OAuth provider, the admin is required to also have Notebook.md 2FA enabled and must complete a 2FA challenge before accessing the admin console

#### 8.9.3 Admin Account Provisioning

- **Production:** Admin accounts are created via a CLI command bundled with the API container, run via `docker exec`:
  ```
  docker exec -it <api-container> node cli/promote-admin.js user@email.com
  ```
  This sets `is_admin = true` on the user record. No seed users or backdoor accounts in production. Requires SSH/container access to the API container.
- **Local development:** A database seed script creates a default admin account (e.g., `admin@localhost`) for convenience. This seed script is excluded from production migrations.

#### 8.9.4 Admin API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users` | List/search users (paginated) |
| GET | `/admin/users/:id` | Get user details |
| PATCH | `/admin/users/:id` | Update user flags (dev_mode, suspended). **Cannot** set `is_admin` — admin promotion is restricted to CLI only (see §8.9.3) |
| DELETE | `/admin/users/:id` | Delete user account |
| GET | `/admin/health` | System health status |
| GET | `/admin/metrics` | Usage metrics |
| GET | `/admin/audit-log` | Browse audit log |
| POST | `/admin/feature-flags` | Create/update feature flags |
| POST | `/admin/announcements` | Create announcement |

### 8.10 Domain & DNS

- Domain: `notebookmd.io` (registered via GoDaddy)
- **V1 approach:** DNS remains at GoDaddy; records updated manually as needed
- **Recommendation for future:** Migrate DNS to Azure DNS for automated certificate management (Azure-managed TLS via Front Door) and IaC-managed DNS records
- SSL/TLS: Managed certificates via Azure Front Door or Let's Encrypt
- **Email DNS records required:** SPF, DKIM, and DMARC records on `notebookmd.io` for transactional email delivery from `noreply@notebookmd.io`
- Subdomains:
  - `notebookmd.io` — main web app
  - `api.notebookmd.io` — API backend
  - `admin.notebookmd.io` — admin console

### 8.11 HA/DR & Backup Strategy

#### 8.11.1 High Availability (Production)

| Component | HA Approach |
|-----------|-------------|
| **API containers** | Azure Container Apps auto-scales replicas (min 2, max N based on load); health checks with automatic restart |
| **Web/Admin containers** | Azure Container Apps with multiple replicas behind a load balancer |
| **PostgreSQL** | Azure Database for PostgreSQL Flexible Server with zone-redundant HA (automatic failover to standby in a different availability zone) |
| **Redis** | Azure Cache for Redis with zone redundancy enabled |
| **CDN** | Azure Front Door provides global edge caching and DDoS protection |

#### 8.11.2 Backup Strategy

| Component | Backup Approach | Retention |
|-----------|----------------|-----------|
| **PostgreSQL** | Azure automated daily backups with point-in-time restore (PITR) | 35 days PITR window |
| **Redis** | No backup needed — cache is ephemeral; session loss = user re-authenticates |
| **Container images** | Stored in Azure Container Registry; tagged by version and git SHA | Indefinite for tagged releases |
| **IaC / Config** | All infrastructure defined in code (Terraform/Pulumi); stored in the git repo | Git history |

#### 8.11.3 Disaster Recovery

- **RPO (Recovery Point Objective):** < 1 hour (via PostgreSQL PITR)
- **RTO (Recovery Time Objective):** < 30 minutes (redeploy containers from images; database failover is automatic)
- **Geo-redundancy:** Deferred for V1. Single-region deployment in **East US 2**. Geo-redundant database backups enabled for cross-region restore if needed.
- **Runbook:** Documented recovery procedures for common failure scenarios (database failover, container crash, full region outage)

### 8.12 Monitoring, Observability & Analytics

#### 8.12.1 Operational Monitoring

| Concern | Tool | Cost |
|---------|------|------|
| **Health checks** | Azure Container Apps built-in health probes (liveness + readiness) | Included |
| **Uptime monitoring** | Azure Monitor availability tests (ping tests to API and web endpoints) | ~$1/month |
| **Application metrics** | Azure Monitor / Application Insights (request rates, latency, error rates, dependencies) | Free tier: 5 GB/month ingestion; ~$2.30/GB beyond |
| **Error tracking** | Sentry (free tier: 5K errors/month) or Application Insights exceptions | Free at low scale |
| **Logging** | Structured JSON logs → Azure Monitor Logs (Log Analytics workspace) | ~$2.76/GB ingestion |
| **Alerting** | Azure Monitor alerts (email/webhook on error rate spikes, health check failures) | Free for basic alerts |

**Recommendation:** Use Azure Monitor + Application Insights as the primary observability stack — it's natively integrated with Container Apps, provides APM traces, metrics, and logging in one place, and the free tier is generous for early-stage usage. Add Sentry for richer error context and source-map support.

#### 8.12.2 Product Analytics

| Concern | Tool | Rationale |
|---------|------|-----------|
| **Event tracking** | PostHog (self-hosted or cloud) | Open-source, privacy-respecting; GDPR-friendly; supports event tracking, funnels, retention, and feature flags |
| **Tracked events** | Sign-ups, sign-ins, notebook created, file opened, file saved, publish (GitHub), settings changed, feature usage | Provides insight into adoption, engagement, and feature value |
| **Dashboards** | PostHog built-in dashboards | Sign-up funnel, DAU/WAU/MAU, feature usage heatmap, retention cohorts |

**PostHog deployment options:**
- **Cloud (recommended for V1):** PostHog Cloud free tier (1M events/month), US region — zero infrastructure overhead. Privacy Policy discloses US-based data processing.
- **Self-hosted (future):** Deploy PostHog in a container alongside the app for full data ownership; useful if self-hosted aligns with privacy goals at scale

**Privacy considerations:**
- PostHog is configured to anonymize IPs and respect Do Not Track
- No PII in event properties — use internal user IDs only
- Cookie consent banner covers analytics cookies (see §13.3)

### 8.13 Cost Estimates (Azure, Single Region)

Estimates assume Azure Container Apps, managed PostgreSQL, managed Redis, and Azure Front Door. Prices are approximate and based on 2025/2026 Azure pricing for East US 2.

#### 8.13.1 Base Infrastructure (Fixed Costs)

| Resource | Tier / Config | Est. Monthly Cost |
|----------|--------------|-------------------|
| Azure Container Apps (API, 2 replicas) | Consumption plan, 0.5 vCPU / 1 GB each | $30–50 |
| Azure Container Apps (Web + Admin) | Consumption plan, 0.25 vCPU / 0.5 GB each | $10–20 |
| Azure Database for PostgreSQL Flexible | Burstable B1ms (1 vCPU, 2 GB), 32 GB storage | $25–35 |
| Azure Cache for Redis | Basic C0 (250 MB) | $16 |
| Azure Front Door | Standard tier | $35 |
| Azure Container Registry | Basic tier | $5 |
| Azure Monitor / App Insights | Free tier (5 GB/month) | $0 |
| Azure Key Vault | Standard (low usage) | $1 |
| PostHog Cloud | Free tier (1M events/month) | $0 |
| Transactional email (SendGrid) | Free tier (100 emails/day) | $0 |
| **Base total** | | **~$120–160/month** |

#### 8.13.2 Scaling by Weekly Active Users (WAU)

| WAU | API Replicas | DB Tier | Redis Tier | CDN | Est. Monthly Cost |
|-----|-------------|---------|------------|-----|-------------------|
| **100** | 2 × 0.5 vCPU | Burstable B1ms | Basic C0 | Standard | **~$130/month** |
| **1,000** | 2 × 0.5 vCPU | Burstable B2s (2 vCPU) | Basic C1 | Standard | **~$180/month** |
| **100,000** | 4–6 × 1 vCPU | GP D2s_v3 (2 vCPU, 8 GB) | Standard C2 (6 GB) | Premium | **~$500–700/month** |
| **1,000,000** | 10–20 × 2 vCPU | GP D4s_v3 (4 vCPU, 16 GB) + read replicas | Premium P3 (26 GB) | Premium | **~$2,000–4,000/month** |

> **Notes:**
> - These estimates do not include source system API costs (those APIs are free for authenticated users within their quotas).
> - Managed services (PostgreSQL, Redis) cost more than self-hosted containers but eliminate operational overhead. At 100–1,000 WAU, managed services are strongly recommended for reliability. At 100K+ WAU, evaluate whether self-managed K8s (AKS) with self-hosted PostgreSQL/Redis would reduce costs.
> - Email costs scale with sign-ups; SendGrid free tier (100/day = ~3,000/month) is sufficient until ~50K registered users.

### 8.14 Source Code & CI/CD

The Notebook.md codebase is hosted in a **private GitHub repository**. Branch protection and environment rules are maintained as best practices and to prepare for a potential future switch to a public repo.

#### 8.14.1 Repository & Deployment Security

- **Private repository:** The source code is not publicly accessible. GitHub Actions minutes are consumed from the account's included allotment for private repos.
- **GitHub Environments with protection rules:** Production deployment jobs reference a `production` GitHub Environment that requires:
  - Manual approval from a designated reviewer before deployment executes
  - Environment-scoped secrets (Azure credentials) that are only available to jobs targeting the `production` environment
- **Branch protection:** The `main` branch requires PR reviews before merge; direct pushes are blocked
- **No secrets in code:** All credentials, API keys, and tokens stored in GitHub Secrets (environment-scoped) and Azure Key Vault — never in source code
- **Signed commits:** Recommended for production-related branches
- **Dependency scanning:** Dependabot enabled for automated vulnerability alerts and PRs

#### 8.14.2 CI/CD Pipeline (GitHub Actions)

| Stage | Trigger | Actions |
|-------|---------|---------|
| **Build & Test** | Every push / PR | Lint, type-check, unit tests, build Docker images |
| **Preview** | PR to `main` | Build containers, run integration tests, deploy to canary revision (0% traffic) for manual verification |
| **Production Deploy** | Push of a `v*` tag (e.g., `v1.0.0`) + manual approval | Push images to Azure Container Registry, deploy new revision to Container Apps, traffic split (canary → 100%) |
| **Rollback** | Manual trigger | Shift traffic back to previous revision |

**Release workflow:**
1. Merge PRs to `main` as features/fixes are ready
2. When ready to release, create and push a version tag: `git tag v1.2.3 && git push origin v1.2.3`
3. The `v*` tag triggers the production deploy pipeline
4. Manual approval gate in the GitHub Environment before deployment proceeds
5. Canary deployment → verify → promote to 100% traffic

#### 8.14.3 Container Image Security

- Images built in CI/CD, pushed to **Azure Container Registry** (private)
- Images scanned for vulnerabilities (Azure Defender for Container Registry or Trivy in CI)
- Images tagged with git SHA and semantic version from the tag; `latest` tag points to current production

### 8.15 Testing Strategy

The project uses a tiered testing approach, with each tier introduced at the phase where it provides the most value. All tests run locally and in CI.

#### 8.15.1 Frameworks & Tools

| Layer | Framework | Purpose |
|-------|-----------|---------|
| **API integration tests** | Vitest + Supertest | Test API endpoints against real PostgreSQL/Redis (Docker Compose) |
| **Web unit tests** | Vitest + React Testing Library | Test hooks, stores, and pure-logic modules |
| **E2E browser tests** | Playwright | Full user-flow testing across Chromium, Firefox, and WebKit |

**Why these choices:**
- **Vitest** — native ESM support (avoids CJS conflicts with `"type": "module"` in package.json), shares Vite's transform pipeline, faster than Jest
- **Supertest** — lightweight HTTP assertion library; tests Express routes without starting a real server
- **React Testing Library** — tests components the way users interact with them (by role/label, not implementation details)
- **Playwright** — faster than Selenium/Cypress, multi-browser (Chromium/Firefox/WebKit), native auto-waiting, first-class TypeScript support, excellent GitHub Actions integration
- **fake-indexeddb** — in-memory IndexedDB implementation for testing `localNotebookStore` without a browser

#### 8.15.2 Test Tiers & Phasing

| Tier | Scope | Introduced | Runs In CI |
|------|-------|------------|------------|
| **Tier 1: API integration tests** | Auth flows, session management, notebooks CRUD, settings, OAuth callbacks, rate limiting | Phase 2 (retroactive) | Every push/PR |
| **Tier 2: Web unit tests** | Hooks (`useAuth`, `useSettings`, `useNotebookManager`), stores (`localNotebookStore`), pure logic (`markdownConverter`) | Phase 3–4 | Every push/PR |
| **Tier 3: E2E browser tests** | Sign-up/sign-in flow, notebook CRUD, file editing + save, tab management, context menus, table editing, import/drag-drop, dark mode, source system flows | Phase 6–7 (pre-production) | PR to `main` |

#### 8.15.3 Test Infrastructure

- **API tests** run against real PostgreSQL and Redis via Docker Compose. Each test suite uses a transaction that rolls back, or a dedicated test database, to ensure isolation.
- **Web unit tests** run in a jsdom environment with mocked API calls (`msw` or manual fetch mocks) and `fake-indexeddb` for storage tests.
- **E2E tests** run against the full app stack (Docker Compose + API + Web) with Playwright's built-in `webServer` config.
- **Test data**: factory functions generate test users, notebooks, and files. No shared mutable test state between test cases.

#### 8.15.4 Coverage & Quality Gates

- **No hard coverage target** — focus on testing critical paths and regressions rather than chasing a number
- **CI gates** (enforced in GitHub Actions):
  - TypeScript type-check (`tsc --noEmit`) — must pass
  - Lint — must pass
  - Unit + integration tests — must pass
  - E2E tests — must pass on PR to `main`
- **Test naming convention**: `describe('module/feature')` → `it('should <expected behavior>')` or `test('<scenario>')`

#### 8.15.5 What We Don't Test (and Why)

- **Snapshot tests** — UI is changing rapidly; snapshots create maintenance burden without catching real bugs
- **Storybook** — useful for component libraries, overkill for app-level components
- **Visual regression tests** — deferred until UI is stable (could add Percy or Playwright screenshots in a later phase)
- **Load/stress tests** — deferred to Phase 7 pre-launch checklist (simulate 100 concurrent users)

---

## 9. API Design (High Level)

### 9.1 Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/:provider` | Initiate OAuth flow (Microsoft, GitHub, Google) |
| GET | `/auth/:provider/callback` | OAuth callback |
| GET | `/auth/github/install` | Redirect to GitHub App installation flow |
| GET | `/auth/github/install/callback` | GitHub App installation callback |
| POST | `/auth/email/signin` | Email sign-in (magic link or password) |
| POST | `/auth/email/signup` | Email sign-up |
| POST | `/auth/2fa/verify` | Verify 2FA code (TOTP or emailed code) during sign-in |
| POST | `/auth/2fa/setup` | Begin 2FA setup (returns TOTP QR code URI) |
| POST | `/auth/2fa/enable` | Confirm 2FA setup with verification code |
| POST | `/auth/2fa/disable` | Disable 2FA (requires verification) |
| POST | `/auth/2fa/recovery` | Use a recovery code to sign in |
| POST | `/auth/signout` | Sign out, clear session |
| GET | `/auth/session` | Get current session / user info |

### 9.2 Account Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/account` | Get account details |
| PATCH | `/api/account` | Update profile (display name, etc.) |
| DELETE | `/api/account` | Delete account |
| GET | `/api/account/links` | List linked providers |
| POST | `/api/account/links` | Link a new provider |
| DELETE | `/api/account/links/:id` | Unlink a provider |

### 9.3 Notebook Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notebooks` | List user's notebooks |
| POST | `/api/notebooks` | Add a notebook |
| PATCH | `/api/notebooks/:id` | Update notebook config |
| DELETE | `/api/notebooks/:id` | Remove a notebook |
| GET | `/api/notebooks/:id/tree` | Get file tree (proxied from source if needed) |
| GET | `/api/notebooks/:id/files/*path` | Read file content (proxy) |
| PUT | `/api/notebooks/:id/files/*path` | Write file content (proxy) |
| POST | `/api/notebooks/:id/files/*path` | Create new file (proxy) |
| DELETE | `/api/notebooks/:id/files/*path` | Delete file (proxy) |
| PATCH | `/api/notebooks/:id/files/*path` | Rename/move file (proxy) |
| POST | `/api/notebooks/:id/folders/*path` | Create new folder (proxy) |
| DELETE | `/api/notebooks/:id/folders/*path` | Delete folder (proxy) |
| POST | `/api/notebooks/:id/publish` | Publish changes (GitHub: squash merge working branch) |

**File proxy security requirements:**
- All `*path` parameters must be **canonicalized** (resolve `..`, `.`, double slashes, URL-encoded sequences) and validated to ensure the resolved path stays within the notebook's configured root directory
- Reject any path containing `..` segments after URL decoding
- For GitHub notebooks, validate that the target repository matches the notebook's configured repository
- For OneDrive/Google Drive, validate that the resolved path is a descendant of the configured folder ID

### 9.4 Webhook Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/github` | GitHub App webhook receiver (push events, installation events); verified via webhook secret HMAC-SHA256 signature |

**Webhook security requirements:**
- Verify `X-Hub-Signature-256` header (HMAC-SHA256 of the payload with the webhook secret)
- **Replay protection:** Reject deliveries older than 5 minutes (check timestamp in payload)
- **Deduplication:** Track `X-GitHub-Delivery` header (UUID) in Redis with a 10-minute TTL; reject duplicate delivery IDs
- Log all webhook deliveries (accepted and rejected) to the audit log

### 9.5 Settings Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings` | Get user settings |
| PATCH | `/api/settings` | Update user settings |

### 9.6 Admin Endpoints (Admin Console Only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users` | List/search users (paginated) |
| GET | `/admin/users/:id` | Get user details with linked accounts and notebooks |
| PATCH | `/admin/users/:id` | Update user flags (dev_mode, suspended). **Cannot** set `is_admin` — admin promotion restricted to CLI only |
| DELETE | `/admin/users/:id` | Delete user account |
| GET | `/admin/health` | System health status (DB, Redis, containers) |
| GET | `/admin/metrics` | Usage metrics (users, notebooks, API volume) |
| GET | `/admin/audit-log` | Browse audit log entries (paginated, filterable) |
| GET | `/admin/feature-flags` | List feature flags |
| POST | `/admin/feature-flags` | Create/update a feature flag |
| GET | `/admin/announcements` | List announcements |
| POST | `/admin/announcements` | Create an announcement |
| DELETE | `/admin/announcements/:id` | Delete an announcement |

---

## 10. Data Model (PostgreSQL)

### 10.1 Core Tables

```
users
├── id (UUID, PK)
├── display_name (VARCHAR)
├── avatar_url (VARCHAR, nullable)
├── email (VARCHAR, unique, nullable)
├── password_hash (VARCHAR, nullable) -- bcrypt, only for email+password users
├── totp_secret_enc (BYTEA, nullable) -- encrypted TOTP secret, uses same KMS-based envelope encryption as OAuth tokens
├── totp_enabled (BOOLEAN, default false)
├── recovery_codes_hash (JSONB, nullable) -- JSON array of bcrypt-hashed recovery codes (one-way hash, not encrypted)
├── is_admin (BOOLEAN, default false)
├── is_dev_mode (BOOLEAN, default false)
├── is_suspended (BOOLEAN, default false)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

identity_links
├── id (UUID, PK)
├── user_id (UUID, FK → users)
├── provider (ENUM: microsoft, github, google, email)
├── provider_user_id (VARCHAR)
├── access_token_enc (BYTEA)  -- encrypted
├── refresh_token_enc (BYTEA) -- encrypted
├── token_expires_at (TIMESTAMPTZ)
├── scopes (TEXT)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

notebooks
├── id (UUID, PK)
├── user_id (UUID, FK → users)
├── name (VARCHAR)
├── source_type (ENUM: local, onedrive, google_drive, github)
├── source_config (JSONB) -- provider-specific: folder path, repo, branch, etc.
├── identity_link_id (UUID, FK → identity_links)
├── auto_save (BOOLEAN, default false)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

user_settings
├── user_id (UUID, PK, FK → users)
├── settings (JSONB) -- all preferences as a JSON object
└── updated_at (TIMESTAMPTZ)

sessions
├── id (UUID, PK)
├── user_id (UUID, FK → users)
├── refresh_token_hash (VARCHAR) -- hashed refresh token
├── refresh_token_family (UUID) -- for rotation detection
├── remember_me (BOOLEAN)
├── expires_at (TIMESTAMPTZ)
├── created_at (TIMESTAMPTZ)
└── revoked_at (TIMESTAMPTZ, nullable)

audit_log
├── id (UUID, PK)
├── user_id (UUID, FK → users, nullable)
├── action (VARCHAR) -- e.g., 'sign_in', 'link_provider', 'add_notebook'
├── details (JSONB) -- action-specific metadata
├── ip_address (INET)
├── user_agent (TEXT)
├── created_at (TIMESTAMPTZ)
└── (no updated_at — audit logs are immutable)

feature_flags
├── id (UUID, PK)
├── key (VARCHAR, unique) -- e.g., 'enable_split_view'
├── enabled (BOOLEAN, default false)
├── description (TEXT)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

announcements
├── id (UUID, PK)
├── title (VARCHAR)
├── body (TEXT)
├── type (ENUM: info, warning, maintenance)
├── active (BOOLEAN, default true)
├── starts_at (TIMESTAMPTZ)
├── ends_at (TIMESTAMPTZ, nullable)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

---

## 11. Non-Functional Requirements

### 11.1 Performance

- Editor must maintain 60fps during typing and scrolling
- File tree loading: < 2 seconds for trees up to 500 items
- File open: < 1 second for files up to 1 MB
- Auto-save operations should be non-blocking to the editor

### 11.2 Security

- See §2.5 for auth-specific security
- **Content Security Policy (CSP):**
  - Strict base policy with **nonce-based** script loading (no `unsafe-inline`, no `unsafe-eval`)
  - `script-src 'self' 'nonce-{random}'` — only scripts with a server-generated nonce are executed
  - `style-src 'self' 'nonce-{random}'` — inline styles via nonce only
  - `img-src 'self' data: blob:` — allow inline images (data URIs for pasted images, blob for local preview) plus specific CDN origins as needed; **not** `img-src *`
  - `connect-src 'self'` — API calls only to `api.notebookmd.io`
  - `frame-src 'none'` — no iframes
  - `object-src 'none'` — no plugins/embeds
  - Math rendering: KaTeX is preferred over MathJax for CSP compatibility (KaTeX does not require `unsafe-eval`)
  - External images referenced in Markdown documents: loaded via `img-src` with the source system's CDN domain (e.g., `*.sharepoint.com`, `*.googleusercontent.com`, `*.githubusercontent.com`) — not a wildcard
- No document content stored server-side
- OAuth tokens encrypted at rest
- Regular dependency audits (Dependabot / npm audit)
- **Markdown rendering sanitization:**
  - All rendered Markdown output is sanitized using **DOMPurify** (or equivalent proven HTML sanitizer)
  - Raw HTML in Markdown is sanitized aggressively: strip all event handlers (`onerror`, `onload`, etc.), `javascript:` URIs, `data:` URIs for non-image content, `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`, SVG scripts
  - Tiptap/ProseMirror's schema-based rendering provides a first layer of protection (only known node types are rendered), but DOMPurify is applied as defense-in-depth
  - `javascript:` and `data:text/html` URIs are blocked in all link `href` attributes
- **CORS policy:**
  - API at `api.notebookmd.io` sets `Access-Control-Allow-Origin` to only the exact origins: `notebookmd.io` and `admin.notebookmd.io`
  - Never use `*` or reflect the `Origin` header
  - `Access-Control-Allow-Credentials: true` only with explicit origin matching

### 11.3 Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation for all core workflows
- Screen reader support for the editor, tree view, and dialogs
- Focus management in modals and dialogs
- Sufficient color contrast in both light and dark modes

### 11.4 Reliability

- Graceful handling of source system API failures (offline indicators, retry with backoff)
- Local change buffering — if the source is unreachable, changes are retained client-side and synced when connectivity resumes
- No data loss on browser/app crash — periodic local snapshot of unsaved changes (localStorage or IndexedDB)

### 11.5 Scalability

- Stateless API servers (horizontal scaling)
- Database connection pooling
- CDN for static assets
- Target: support 10,000+ concurrent users with standard container scaling

---

## 12. Future Considerations (Out of Scope for V1)

### 12.1 Deferred Features

- **iCloud Drive and Apple Sign-In** — both deferred together; Apple Sign-In will be added as an identity provider when iCloud Drive support is implemented, providing a cohesive Apple ecosystem experience. Revisit when Apple improves CloudKit web API access or when native iOS app is built.
- **Native desktop apps** (macOS via Tauri, Windows via Tauri) — architecture is ready; deferred to focus on web-first launch
- **Native mobile apps** (iOS, Android via Tauri Mobile) — architecture choices in §8.7 and §8.8 lay the groundwork
- **GitHub organization repos** — deferred due to additional permissions complexity and org admin consent flows
- **Alternative GitHub save strategies** — direct commit to main, draft PR per session, fork-based workflow (abstraction layer in place via `GitSaveStrategy` interface)
- **Per-notebook settings** — settings overrides scoped to individual notebooks
- **Customizable keyboard shortcuts**
- **Split-editor view** (two different documents side by side)
- **RTL language support** (Arabic, Hebrew)
- **Pre-signed URL optimization** — for high-traffic read operations at scale, the backend can generate short-lived pre-authenticated URLs (supported natively by OneDrive and Google Drive) allowing the browser to download file content directly from the source without exposing the full OAuth token. This reduces backend proxy bandwidth while maintaining the security model. Recommended when scaling beyond 100K WAU.
- **Public source code repository** — currently private; may switch to public in the future (CI/CD security controls are already in place to support this transition)

### 12.2 Future Feature Ideas

- Real-time collaboration (multiplayer editing via CRDTs or OT)
- Offline-first mode for desktop/mobile apps
- Markdown extensions (Mermaid diagrams, embedded media, etc.)
- Export to PDF, DOCX, HTML
- Plugin/extension system
- Public sharing via link (read-only published notebooks)
- Full-text search across all notebooks
- Version history viewer (especially for GitHub-backed notebooks)
- Template system for new notebooks/documents
- AI-assisted writing features
- Notebook sharing between Notebook.md users (deferred due to security concerns around third-party access to source system content)

### 12.3 Monetization Considerations (V2+)

V1 is **free** with no usage limits. Future monetization options to consider:

| Model | Description | Pros | Cons |
|-------|-------------|------|------|
| **Freemium** | Free tier (e.g., 3 notebooks, 1 source type) + paid Pro tier (unlimited notebooks, all sources, priority support) | Low barrier to entry; natural upgrade path | Need to define tier boundaries carefully |
| **Pro subscription** | $5–10/month for premium features (e.g., advanced GitHub workflows, priority sync, larger file support, team features) | Predictable revenue; aligns with SaaS model | Users may resist paying for a tool that stores nothing |
| **One-time purchase (desktop)** | Free web app; paid native desktop apps ($19–29) | Common pattern (e.g., iA Writer); no recurring cost concern | Revenue is lumpy; need continuous new users |
| **Sponsorware / Open Core** | Open-source core with premium closed-source features | Community goodwill; contributions | Harder to monetize at scale |

**Architectural considerations for monetization:**
- Add a `subscription_tier` field to the `users` table (default: `free`)
- Feature flag system (§8.9) can gate premium features
- Usage counters (notebook count, API calls) should be tracked from V1 to inform tier definitions later

---

## 13. Legal

### 13.1 Terms of Service

A Terms of Service document is required at launch. Published by **Van Vliet Ventures, LLC**. Key provisions:

- Service provided "as-is" with no warranty
- User is responsible for their content and source system credentials
- Notebook.md does not store document content; the service is a pass-through to user's own storage
- Right to suspend or terminate accounts for abuse
- Limitation of liability (capped at fees paid, which is $0 for V1)
- Dispute resolution (arbitration clause or jurisdiction selection)
- Modification of terms with notice
- Indemnification clause — user indemnifies Van Vliet Ventures, LLC against claims arising from user's content or use of third-party services

### 13.2 Privacy Policy

A Privacy Policy is required at launch, especially for GDPR compliance (EU users). Published by **Van Vliet Ventures, LLC**. Key provisions:

- What data is collected: account metadata, identity provider tokens (encrypted), usage analytics
- What data is NOT collected: document content, file contents, source system data
- How data is used: solely for providing the service
- Data retention: account data retained while active; deleted within 30 days of account deletion
- Third-party services: identity providers, cloud hosting (Azure), email (SendGrid), error tracking (Sentry), analytics (PostHog)
- User rights: access, correction, deletion, data portability (GDPR Articles 15–20)
- Contact information for privacy inquiries

### 13.3 Cookie Consent

- **Custom cookie consent banner** (built in-house, not a third-party library)
- Simple, minimal UI: banner at bottom of page with **"Accept All"**, **"Reject All"**, and **"Manage Preferences"** options — rejecting must be as easy as accepting (GDPR/CNIL requirement)
- Categories: Essential (session cookies — no consent needed), Analytics (PostHog — consent required)
- **Consent storage:** Stored in a first-party cookie (not tied to user authentication) so it works for unauthenticated visitors before sign-in
- Respects "Do Not Track" browser setting
- PostHog tracking initialized only after analytics consent is granted
- OAuth provider cookies (set during redirect flows) disclosed in cookie policy

> **Note:** Boilerplate legal documents will be generated and should be reviewed by a qualified attorney before launch. The documents will be published at `notebookmd.io/terms` and `notebookmd.io/privacy`.

---

## 14. Internationalization (i18n)

### 14.1 V1 Approach

- English only for V1
- All user-facing strings externalized using `react-i18next` (or equivalent)
- String keys organized by feature area (e.g., `auth.signIn`, `editor.bold`, `settings.darkMode`)
- Date, time, and number formatting uses `Intl` APIs with locale-aware formatting
- No hardcoded strings in components — all text comes from translation files

### 14.2 Future Language Support

- Translation files stored as JSON in a `/locales` directory
- Community contributions via a translation platform (e.g., Crowdin, Weblate)
- RTL layout support deferred (see §12.1)

---

## 15. Glossary

| Term | Definition |
|------|-----------|
| **Notebook** | A connection to a storage location (folder, repo, or local browser storage) on a source system; the top-level organizational unit in the app |
| **Local notebook** | A notebook stored in browser IndexedDB (web) or local filesystem (native apps); no cloud connection required |
| **Source system** | A storage provider (Local, OneDrive, Google Drive, GitHub) |
| **Identity provider** | An OAuth provider used for authentication (Microsoft, GitHub, Google, email) |
| **Working branch** | A Git branch created by Notebook.md for staging changes (GitHub notebooks) |
| **Canvas** | The document editing area (WYSIWYG Markdown editor) |
| **Publish** | The act of merging changes from a working branch to the base branch (GitHub notebooks) |
| **Dev mode** | A flag on user accounts or environments that enables debug features |

---

*This document will be maintained as the living source of truth for all Notebook.md requirements. It will be updated as decisions are made and the product evolves.*

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.1 | 2026-02-22 | Added §5.11 Document Outline Pane — navigable table of contents with heading hierarchy, click-to-scroll, active heading highlight |
| 2.0 | 2026-02-22 | Added §5.8 URL-Based Navigation & Deep Linking, §5.9 Session Persistence, §5.10 In-Document Link Handling — URL-addressable documents, browser history, deep links, tab/tree restoration, link interception |
| 1.9 | 2026-02-21 | Expanded §5.6 Responsive Design into full mobile web section (§5.6.1–5.6.9): hamburger nav, drawer pane, compact toolbar, scrollable tabs, responsive modals, condensed status bar, iOS compatibility, split view, internal links |
| 1.8 | 2026-02-21 | Security hardening (CASA), OG tags, demo mode phase 2 |
| 1.6 | 2026-02-19 | Added §5.7 Client-Side Routing — React Router for SPA navigation |
| 1.5 | 2026-02-18 | Session hardening, idle timeout, security headers |
