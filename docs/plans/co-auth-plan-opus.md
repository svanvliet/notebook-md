# Co-Authoring Implementation Plan (Opus)

**Requirements Source:** `docs/requirements/co-auth-requirements-opus.md` (v3.0)  
**Cross-Reference:** `docs/plans/co-auth-plan-codex.md`  
**Date:** 2026-02-23  
**Status:** Phases 0–5 complete (local dev only)

---

## Overview

This plan implements real-time co-authoring for Notebook.md via Cloud notebooks. It is organized into 6 phases with explicit dependencies, file-level task breakdowns, and testing gates between phases.

**Technology choices (locked):**
- Editor: TipTap + Yjs (`@tiptap/extension-collaboration`, `y-prosemirror`)
- Sync server: Self-hosted HocusPocus (MIT, WebSocket, Yjs-native)
- WebSocket routing: path-based at `wss://api.notebookmd.io/collab` (D21)
- Storage: PostgreSQL for V1 (blob storage deferred per D22)
- CRDT: Yjs with Redis pub/sub for multi-instance scaling

**Key constraints (from requirements D1–D31):**
- Free tier: 3 Cloud notebooks, 500 MB total storage (uncompressed, incl. versions)
- Roles: Owner / Editor / Viewer only
- Soft quota warnings only (no write-blocking in V1)
- BYO notebooks remain single-author
- Mobile: read-only for co-authored docs
- Anonymous public link viewing (non-indexable)
- Email notifications + copy-link only (no in-app notifications)
- Account deletion: hard delete with warning

---

## Local Development Strategy

**All work through Phase 5 is local-dev only.** No production infrastructure, CI/CD, Terraform, or Azure changes are made until Phase 6. The entire feature is built and validated locally using two browser windows with two different user accounts before anything touches production.

### Dev environment additions

The existing `dev.sh` script starts Docker (postgres, redis, mailpit), the API, web, and admin servers. We add the collab (HocusPocus) server as a new step:

| Service | Port | How it starts |
|---------|------|---------------|
| PostgreSQL | 5432 | Docker (existing) |
| Redis | 6379 | Docker (existing) |
| Mailpit | 1025/8025 | Docker (existing) |
| API | 3001 | `tsx watch` (existing) |
| **Collab (HocusPocus)** | **3002** | **`tsx watch` (new)** |
| Web | 5173 | Vite (existing) |
| Admin | 5174 | Vite (existing) |

The Vite dev server already proxies `/api` and `/auth` to `localhost:3001`. We add a WebSocket proxy for `/collab` → `ws://localhost:3002` so the browser connects to the same origin.

### Two-browser testing workflow

To validate real-time co-authoring locally:

1. **Create two user accounts** — sign up with two different email addresses via `localhost:5173`. Mailpit captures verification emails at `localhost:8025`.
2. **Enable feature flags** — use the admin console (`localhost:5174`) or run SQL directly:
   ```sql
   UPDATE feature_flags SET enabled = true WHERE key IN ('cloud_notebooks', 'cloud_collab', 'cloud_sharing', 'cloud_public_links', 'soft_quota_banners');
   ```
3. **User A creates a Cloud notebook** → adds a document → shares with User B's email
4. **User B accepts the invite** (via Mailpit email link) → opens the shared notebook
5. **Open both browsers side-by-side** → both users edit the same document → verify live cursors, real-time sync, conflict-free editing
6. **Test edge cases:** disconnect/reconnect (toggle network in DevTools), viewer permissions, revoking access, quota warnings, public link viewing in an incognito window

### Feature flags in dev

Feature flags default to `false` in the migration seed, but the Phase 0 migration includes a dev-mode override:

```sql
-- In dev, enable all cloud flags by default (controlled by NODE_ENV check in app code)
-- Or manually enable via admin console at localhost:5174
```

The feature flag service (§0.3) will auto-enable flags when `NODE_ENV=development` if not explicitly set, making local development frictionless while keeping production gated.

### Phase ↔ Environment mapping

| Phase | Environment | What gets validated |
|-------|-------------|-------------------|
| 0 | Local only | Workspace setup, flag service, Cloud source in UI |
| 1 | Local only | Migrations, Cloud CRUD via REST, entitlements |
| 2 | Local only | Real-time co-editing in two browsers, cursors, presence |
| 3 | Local only | Sharing flow (invite email via Mailpit), public links, permissions |
| 4 | Local only | Cross-source drag-to-copy, export |
| 5 | Local only | Quota banners, version history, polish |
| 6 | **Production** | Terraform, CI/CD, marketing, rollout — only after local sign-off |

---

## Phase 0 — Foundation Wiring

**Goal:** Add the `cloud` source type to the app, feature flags, and the new `apps/collab` workspace — without any new database tables yet. This phase ensures the plumbing is in place before building features on top.

### 0.1 Add `cloud` to shared source types

**File:** `packages/shared/src/index.ts`

- Add `'cloud'` to the `SourceType` union type
- Add any shared constants (e.g., `CLOUD_SOURCE_TYPE = 'cloud'`)

### 0.2 Register feature flags

Seed the `feature_flags` table (via a migration or a seed script) with:

| Key | Default | Description |
|-----|---------|-------------|
| `cloud_notebooks` | `false` | Enable Cloud as a notebook source type |
| `cloud_collab` | `false` | Enable real-time collaboration features |
| `cloud_sharing` | `false` | Enable sharing (invites + links) |
| `cloud_public_links` | `false` | Enable anonymous public link viewing |
| `soft_quota_banners` | `false` | Show quota warning/exceeded banners |
| `hard_quota_enforcement` | `false` | Block writes at quota limits (future) |

**File:** New migration `apps/api/migrations/004_feature-flags-cloud.sql`

### 0.3 Feature flag service

Currently flags are queried ad-hoc in admin routes. Create a reusable service:

**File:** `apps/api/src/services/featureFlags.ts`

```typescript
export async function isFeatureEnabled(key: string): Promise<boolean>;
export async function requireFeature(key: string): express.RequestHandler;
// Middleware: returns 404 if flag is disabled (feature doesn't exist yet)
```

### 0.4 Create `apps/collab` workspace

**New directory:** `apps/collab/`

```
apps/collab/
├── package.json          # @notebook-md/collab workspace
├── tsconfig.json
├── src/
│   └── server.ts         # HocusPocus entry point (stub — Phase 2)
└── Dockerfile            # docker/Dockerfile.collab
```

**File:** `apps/collab/package.json`
```json
{
  "name": "@notebook-md/collab",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@hocuspocus/server": "^2.x",
    "@hocuspocus/extension-database": "^2.x",
    "@hocuspocus/extension-redis": "^2.x",
    "yjs": "^13.x",
    "pg": "^8.18.0",
    "ioredis": "^5.9.3",
    "dotenv": "^16.x"
  },
  "devDependencies": {
    "tsx": "^4.x",
    "typescript": "^5.x"
  }
}
```

The root `package.json` already has `"workspaces": ["apps/*", "packages/*"]` so this will be auto-discovered.

**File:** `docker/Dockerfile.collab` — Similar multi-stage pattern to `docker/Dockerfile.api`

### 0.5 Update `dev.sh` to start collab server

**File:** `dev.sh`

Add a new step between API and Web startup (becomes step [4/7]):

```bash
# ── 4. Start collab server ────────────────────────────────────────────
echo -e "${BOLD}[4/7] Starting collab server...${NC}"
npx --workspace=apps/collab tsx watch src/server.ts > "$LOG_DIR/collab.log" 2>&1 &
echo $! > "$COLLAB_PID_FILE"
echo "  Collab server starting (PID $(cat "$COLLAB_PID_FILE"))..."

wait_for_service "Collab" "http://localhost:3002" 10  # HocusPocus health
```

Also update `do_stop()` and `do_status()` to manage the collab PID, and add the collab URL to `print_urls()`:

```
    Collab Server    ws://localhost:3002
```

### 0.6 Add Vite WebSocket proxy for collab

**File:** `apps/web/vite.config.ts`

Add to the existing `proxy` config:

```typescript
'/collab': {
  target: 'ws://localhost:3002',
  ws: true,
  changeOrigin: true,
},
```

This ensures the browser's HocusPocus provider connects to `ws://localhost:5173/collab` which Vite proxies to the local HocusPocus server — same-origin, no CORS issues.

### 0.7 Add `.env` variables for collab

**File:** `.env.example` — Add:

```
# Collab server
COLLAB_PORT=3002
```

**File:** `.env` — Add the same with default value.

### 0.8 Add Cloud option to notebook creation UI (gated)

**File:** `apps/web/src/components/notebook/AddNotebookModal.tsx`

- Add `'cloud'` to the source type picker (alongside github, onedrive, google-drive)
- Gate visibility behind `cloud_notebooks` feature flag (fetched from API)
- Cloud source requires no external account linking — user enters only a notebook name
- Skip the provider configuration step; go straight to naming

**File:** `apps/web/src/components/notebook/SourceTypes.tsx`

- Add Cloud source type definition with icon and label

### Phase 0 — Exit Criteria

- [x] `packages/shared` exports `'cloud'` as a valid source type
- [x] Feature flag service works and all 6 flags are seeded (disabled by default; auto-enabled in dev)
- [x] `apps/collab` workspace exists, `npm install` succeeds at root
- [x] `./dev.sh` starts collab server on port 3002 alongside all other services
- [x] `./dev.sh status` shows collab server status
- [x] Vite proxies `/collab` WebSocket connections to `localhost:3002`
- [x] Cloud source appears in notebook creation modal (behind flag)
- [x] All existing tests pass (no regressions)

---

## Phase 1 — Database Schema & Entitlements

**Goal:** Create all new database tables, the entitlements service, and the Cloud document storage adapter. After this phase, Cloud notebooks can be created and documents CRUD'd via REST (no real-time yet).

### 1.1 Database migration: Cloud collab tables

**File:** `apps/api/migrations/005_cloud-collab.sql`

Creates the following tables (exact schema in requirements §7.2):

| Table | Purpose |
|-------|---------|
| `cloud_documents` | Document content (encrypted), Yjs state, size tracking |
| `notebook_shares` | User-to-user sharing with roles |
| `notebook_public_links` | Anonymous public share links |
| `collab_sessions` | Active editing session tracking |
| `document_versions` | Version history snapshots |

Also adds `CREATE INDEX` for all foreign keys and lookup columns.

### 1.2 Database migration: Plans & entitlements

**File:** `apps/api/migrations/006_plans-entitlements.sql`

Creates:

| Table | Purpose |
|-------|---------|
| `plans` | Plan definitions (free, pro, team, enterprise) |
| `plan_entitlements` | Per-plan limit definitions |
| `user_plan_subscriptions` | User → plan mapping |
| `user_usage_counters` | Per-user usage tracking |

**Seed data (in same migration):**

```sql
INSERT INTO plans (id, name, is_default) VALUES ('free', 'Free', true);

INSERT INTO plan_entitlements (plan_id, entitlement_key, entitlement_value) VALUES
  ('free', 'max_cloud_notebooks', '3'),
  ('free', 'max_storage_bytes', '524288000'),     -- 500 MB
  ('free', 'max_doc_size_bytes', '5242880');       -- 5 MB

-- Backfill: assign free plan to all existing users
INSERT INTO user_plan_subscriptions (user_id, plan_id, is_active)
SELECT id, 'free', true FROM users
ON CONFLICT DO NOTHING;
```

### 1.3 Entitlements service

**File:** `apps/api/src/services/entitlements.ts`

```typescript
interface EntitlementsService {
  getUserPlan(userId: string): Promise<Plan>;
  getEntitlements(userId: string): Promise<PlanEntitlements>;
  getUsage(userId: string): Promise<UsageCounters>;
  getBannerState(userId: string): Promise<'none' | 'warn_90' | 'exceeded_100'>;

  // Check operations (return {allowed, reason, current, limit})
  canCreateCloudNotebook(userId: string): Promise<LimitCheck>;
  canWriteDocument(userId: string, additionalBytes: number): Promise<LimitCheck>;
  checkDocumentSize(sizeBytes: number): Promise<LimitCheck>;
}
```

- All limit checks query `plan_entitlements` joined with `user_usage_counters`
- V1: `canWriteDocument` and `checkDocumentSize` always return `allowed: true` (soft quota)
- Hard enforcement gated behind `hard_quota_enforcement` feature flag
- Notebook count limit is always enforced (even in V1)

**File:** `apps/api/src/services/usageAccounting.ts`

```typescript
// Increment/decrement counters transactionally
export async function incrementNotebookCount(userId: string): Promise<void>;
export async function decrementNotebookCount(userId: string): Promise<void>;
export async function updateStorageUsage(userId: string, deltaBytes: number): Promise<void>;
export async function reconcileUsage(userId: string): Promise<void>;
  // Recompute from cloud_documents + document_versions tables
```

### 1.4 Cloud document storage adapter

**File:** `apps/api/src/services/sources/cloud.ts`

Implements the `SourceAdapter` interface (from `types.ts`):

```typescript
class CloudAdapter implements SourceAdapter {
  readonly provider = 'cloud';

  async listFiles(accessToken, rootPath, dirPath, branch?): Promise<FileEntry[]>
    // Query cloud_documents WHERE notebook_id = resolved_notebook_id AND path LIKE dirPath%
    // accessToken is unused for cloud — auth is via session/userId

  async readFile(accessToken, rootPath, filePath, branch?): Promise<FileContent>
    // SELECT content_enc FROM cloud_documents WHERE notebook_id AND path
    // Decrypt content_enc → return plaintext Markdown

  async writeFile(accessToken, rootPath, filePath, content, sha?, branch?): Promise<WriteResult>
    // Encrypt content → UPDATE cloud_documents SET content_enc, size_bytes, updated_at
    // Update user_usage_counters (delta of old vs new size_bytes)

  async createFile(accessToken, rootPath, filePath, content, branch?): Promise<WriteResult>
    // Check entitlements (doc size limit)
    // Encrypt content → INSERT INTO cloud_documents
    // Increment usage counter

  async deleteFile(accessToken, rootPath, filePath, sha?, branch?): Promise<void>
    // DELETE FROM cloud_documents WHERE notebook_id AND path
    // Decrement usage counter

  async renameFile(accessToken, rootPath, oldPath, newPath, sha?, branch?): Promise<WriteResult>
    // UPDATE cloud_documents SET path = newPath WHERE path = oldPath
}
```

**Registration:** Add to `apps/api/src/app.ts` alongside existing adapter imports:

```typescript
import './services/sources/cloud.js';
// cloud.ts calls registerSourceAdapter(new CloudAdapter()) at module load
```

### 1.5 Encryption utilities for Cloud content

**File:** `apps/api/src/lib/cloudEncryption.ts`

```typescript
export function encryptContent(plaintext: string): Buffer;
  // AES-256-GCM using ENCRYPTION_KEY from env (same Key Vault key used for OAuth tokens)
  // Returns: IV (12 bytes) + ciphertext + auth tag (16 bytes)

export function decryptContent(encrypted: Buffer): string;

export function hashContent(plaintext: string): string;
  // SHA-256 hex digest for change detection
```

### 1.6 Cloud notebook API routes

**File:** `apps/api/src/routes/cloud.ts`

REST endpoints for Cloud-specific operations (the generic `/api/sources/:provider/*` routes handle file CRUD via the adapter, but Cloud needs additional endpoints for notebook-level operations):

```
POST   /api/cloud/notebooks                  → Create Cloud notebook (checks entitlements)
GET    /api/cloud/notebooks                  → List user's Cloud notebooks + notebooks shared with user
GET    /api/cloud/notebooks/:id              → Get notebook details + caller's role + usage summary
DELETE /api/cloud/notebooks/:id              → Delete Cloud notebook (owner only, hard delete)

GET    /api/entitlements/me                  → Current plan + entitlement values
GET    /api/usage/me                         → Usage counters + banner state
```

**Mount in:** `apps/api/src/app.ts` — add `app.use('/api/cloud', requireAuth, cloudRouter)`

### 1.7 Extend notebook creation to support Cloud

**File:** `apps/api/src/routes/notebooks.ts`

- Update `POST /api/notebooks` validation to accept `source_type: 'cloud'`
- When `source_type === 'cloud'`:
  - Check `canCreateCloudNotebook(userId)`
  - `source_config` can be empty (no external provider config needed)
  - Auto-create owner membership in `notebook_shares`
  - Increment `cloud_notebook_count` usage counter
- Audit log: `add_cloud_notebook`

### 1.8 Update notebook deletion for Cloud

**File:** `apps/api/src/routes/notebooks.ts`

- When deleting a Cloud notebook:
  - CASCADE deletes `cloud_documents`, `notebook_shares`, `document_versions`
  - Decrement usage counters (notebook count + storage bytes)
  - If notebook is shared, this deletes content for all collaborators (D27)
  - Audit log: `delete_cloud_notebook`

### 1.9 Entitlements + usage API routes

**File:** `apps/api/src/routes/entitlements.ts`

```
GET /api/entitlements/me   → { plan: 'free', entitlements: { max_cloud_notebooks: 3, ... } }
GET /api/usage/me          → { cloudNotebooks: 2, storageBytesUsed: 420000000, storageLimit: 524288000, bannerState: 'none' }
```

### 1.10 Assign free plan on user creation

**File:** `apps/api/src/routes/auth.ts`

- After creating a new user (signup), INSERT into `user_plan_subscriptions` with `plan_id = 'free'`
- Initialize `user_usage_counters` with zeros

### Phase 1 — Exit Criteria

- [x] Migrations run cleanly (`npm run migrate:up`)
- [x] Cloud notebooks can be created via POST `/api/notebooks` with `source_type: 'cloud'`
- [x] Cloud documents can be CRUD'd via existing `/api/sources/cloud/files/*` routes
- [x] Content is encrypted at rest in `cloud_documents.content_enc`
- [x] Entitlements service returns correct limits for free plan
- [x] Usage counters increment/decrement on document create/update/delete
- [x] Notebook creation is blocked at 3 Cloud notebooks
- [x] `GET /api/usage/me` returns correct banner state
- [x] New users auto-assigned to free plan
- [x] All existing tests pass + new integration tests for Cloud CRUD and entitlements

---

## Phase 2 — Real-Time Collaboration

**Goal:** Add Yjs + HocusPocus for real-time co-editing on Cloud documents. After this phase, multiple users opening the same Cloud document see live cursor/selection updates and conflict-free concurrent editing.

### 2.1 Install collaboration dependencies (web)

**File:** `apps/web/package.json` — Add:

```
@tiptap/extension-collaboration
@tiptap/extension-collaboration-cursor
@hocuspocus/provider
yjs
y-prosemirror
```

### 2.2 Configure HocusPocus server

**File:** `apps/collab/src/server.ts`

```typescript
import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { Redis } from '@hocuspocus/extension-redis';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(__dirname, '../../../.env') });

const getDbUrl = () => process.env.DATABASE_URL;
const getRedisUrl = () => process.env.REDIS_URL;

const server = new Server({
  port: Number(process.env.COLLAB_PORT || 3002),
  debounce: 5000,
  maxDebounce: 30000,

  async onAuthenticate({ token, documentName, connection }) {
    // 1. Validate session token (reuse session validation from API)
    // 2. Parse documentName: "notebook:{notebookId}:file:{encodedPath}"
    // 3. Query notebook_shares for user's permission on this notebook
    // 4. Return { user: { id, name, color, permission } }
    // 5. If viewer: mark connection as readOnly
    // Throws on auth failure → connection rejected
  },

  async onConnect({ documentName, connection }) {
    // Insert into collab_sessions table
  },

  async onDisconnect({ documentName, connection }) {
    // Update collab_sessions.disconnected_at
  },

  extensions: [
    new Database({
      async fetch({ documentName }) {
        // Parse notebookId + filePath from documentName
        // SELECT ydoc_state FROM cloud_documents WHERE notebook_id AND path
        // Return Uint8Array or null
      },
      async store({ documentName, state }) {
        // Parse notebookId + filePath from documentName
        // Encode Yjs state → update cloud_documents:
        //   - ydoc_state = state (binary)
        //   - content_enc = encrypt(markdownFromYdoc(state))
        //   - content_hash = hash(markdown)
        //   - size_bytes = markdown.length
        //   - updated_at = now()
        // Update usage counters (delta)
        // Conditionally create version snapshot (see §2.5)
      },
    }),
    new Redis({
      // Parse from REDIS_URL
      // Enables multi-instance sync
    }),
  ],
});

server.listen();
```

### 2.3 Yjs ↔ Markdown conversion utility

**File:** `apps/collab/src/lib/ydocMarkdown.ts`

```typescript
export function markdownFromYdoc(ydocState: Uint8Array): string;
  // 1. Create Y.Doc, apply state
  // 2. Create ProseMirror document from Yjs XML fragment
  // 3. Serialize to HTML via ProseMirror DOMSerializer
  // 4. Convert HTML to Markdown via Turndown (reuse markdownConverter logic)

export function ydocFromMarkdown(markdown: string): Uint8Array;
  // 1. Convert Markdown to HTML via marked
  // 2. Parse HTML into ProseMirror document
  // 3. Create Y.Doc, initialize XML fragment from ProseMirror doc
  // 4. Return Y.encodeStateAsUpdate(ydoc)
```

This is needed for initial document load (Markdown → Yjs) and persistence (Yjs → Markdown snapshot).

### 2.4 Add collaboration extensions to editor

**File:** `apps/web/src/components/editor/extensions.ts`

When a Cloud document is being edited collaboratively, modify the extension set:

```typescript
export function getExtensions(options: { collaborative?: boolean; provider?: HocuspocusProvider; user?: CollabUser }) {
  const baseExtensions = [/* existing StarterKit, etc. */];

  if (options.collaborative && options.provider) {
    // Replace StarterKit's built-in history with Yjs-aware undo
    baseExtensions.push(
      Collaboration.configure({ document: options.provider.document }),
      CollaborationCursor.configure({
        provider: options.provider,
        user: { name: options.user.name, color: options.user.color },
      }),
    );
    // Remove History extension from StarterKit (Yjs has its own undo manager)
  }

  return baseExtensions;
}
```

### 2.5 Collaboration provider hook

**File:** `apps/web/src/hooks/useCollaboration.ts` (new)

```typescript
export function useCollaboration(documentId: string | null, notebookId: string | null) {
  // State: provider, isConnected, isSynced, connectedUsers, error
  // On mount (when documentId is set and notebook is cloud type):
  //   1. Create HocuspocusProvider with url: `${API_BASE}/collab`
  //   2. Set token from current session
  //   3. Set name: `notebook:${notebookId}:file:${encodedPath}`
  //   4. Listen for status changes, sync events, awareness updates
  // On unmount: destroy provider
  // Returns: { provider, ydoc, isConnected, isSynced, connectedUsers, error }
}
```

### 2.6 Integrate collaboration into editor component

**File:** `apps/web/src/components/editor/MarkdownEditor.tsx`

- Accept new props: `collaborative?: boolean`, `provider?: HocuspocusProvider`, `collabUser?: CollabUser`
- When `collaborative` is true:
  - Pass provider and user to `getExtensions()`
  - Disable the `onChange` callback (content changes are synced via Yjs, not via prop callbacks)
  - The debounced auto-save in `useNotebookManager` is bypassed for Cloud docs (HocusPocus handles persistence)
- When `collaborative` is false: existing behavior unchanged

### 2.7 Wire collaboration into document pane

**File:** `apps/web/src/components/layout/DocumentPane.tsx`

- When opening a tab for a Cloud notebook document:
  - Initialize `useCollaboration(documentId, notebookId)`
  - Pass `provider` and `collaborative=true` to `MarkdownEditor`
  - Show connection status indicator (connected / reconnecting / disconnected)

**File:** `apps/web/src/hooks/useNotebookManager.ts`

- When `source_type === 'cloud'`:
  - Skip debounced auto-save (HocusPocus handles it)
  - Skip `handleContentChange` → `saveTab()` flow for cloud docs
  - `handleSave()` (Cmd+S) for cloud docs can trigger a manual snapshot via REST API

### 2.8 Presence / awareness UI

**File:** `apps/web/src/components/editor/CollaboratorAvatars.tsx` (new)

- Render connected users as avatar circles in the top bar (name, color, tooltip)
- Source data from `useCollaboration().connectedUsers`
- Show count badge if > 4 users ("+3 more")

**File:** `apps/web/src/components/editor/CollaboratorCursors.css` (new)

- Style live cursors and selections using TipTap's `CollaborationCursor` extension CSS
- Each user gets a unique color (assigned by server in `onAuthenticate`)

### 2.9 View mode restrictions for collaborative editing

**File:** `apps/web/src/components/editor/MarkdownEditor.tsx`

- When `collaborative` is true:
  - Lock view mode to **WYSIWYG only**
  - If user tries to switch to Source or Split view, show banner: "Switch to visual editing mode to collaborate in real-time" with a button to switch back
  - The view mode toggle buttons are disabled / show tooltip explaining why

### 2.10 Version snapshot strategy

**File:** `apps/collab/src/lib/snapshotPolicy.ts`

HocusPocus `store` hook determines when to create a version snapshot:

- **Time-based:** Create a snapshot every 15 minutes of active editing
- **Disconnect-based:** Create a snapshot when the last user disconnects
- **Manual:** User triggers via Cmd+S → REST endpoint creates snapshot

```typescript
export function shouldCreateSnapshot(lastSnapshotAt: Date, isLastUser: boolean): boolean;
```

Version snapshots:
- INSERT into `document_versions` with encrypted content + Yjs state
- Track `size_bytes` (counts toward quota per D18)
- Retention: 90 days or 100 versions per document (whichever comes first)

### 2.11 Mobile read-only enforcement

**File:** `apps/web/src/components/editor/MarkdownEditor.tsx`

- Detect mobile via existing Tailwind responsive approach or `window.matchMedia('(max-width: 768px)')`
- When mobile AND collaborative:
  - Set editor to `readOnly: true`
  - Show banner: "Co-editing is available on desktop. You're viewing a read-only version."
  - Presence indicators still visible

### 2.12 WebSocket proxy configuration

**File:** `apps/web/vite.config.ts` (dev proxy)

Add proxy rule for local development:
```typescript
'/collab': {
  target: 'ws://localhost:3002',
  ws: true,
}
```

**Production:** Azure Front Door / Application Gateway needs a routing rule for `/collab` path to the collab Container App with WebSocket upgrade support.

### Phase 2 — Exit Criteria

- [x] HocusPocus server starts and accepts WebSocket connections
- [x] Opening a Cloud document in two browser tabs shows live cursor sync
- [x] Content changes propagate in real-time between tabs (< 250ms p95)
- [x] Yjs state persists to `cloud_documents.ydoc_state` on debounced save
- [ ] Markdown snapshot is generated and stored alongside Yjs state *(deferred — requires Yjs→Markdown conversion which needs full ProseMirror schema in collab server)*
- [ ] Disconnecting and reconnecting resumes the document state correctly *(infra done, needs manual two-browser verification)*
- [ ] Source/Split view modes are locked during collaborative editing *(UI wiring deferred to integration phase)*
- [ ] Mobile shows read-only view with banner *(UI wiring deferred to integration phase)*
- [x] Collaborator avatars appear in the top bar
- [x] Live cursors render with user names and colors
- [x] Undo/redo works correctly in collaborative mode (Yjs-aware)
- [x] BYO notebook editing is completely unaffected
- [x] All existing tests pass + new tests for collaboration flow

---

## Phase 3 — Sharing & Permissions

**Goal:** Implement the invite flow, link sharing, public link viewing, and sharing management. After this phase, users can share Cloud notebooks with others and manage access.

### 3.1 Sharing API routes

**File:** `apps/api/src/routes/sharing.ts` (new)

```
# Invites
POST   /api/cloud/notebooks/:id/invites          → Send invite (email + role)
GET    /api/cloud/notebooks/:id/invites           → List pending invites
DELETE /api/cloud/notebooks/:id/invites/:inviteId → Revoke pending invite
POST   /api/cloud/invites/:token/accept           → Accept invite (creates membership)

# Members
GET    /api/cloud/notebooks/:id/members           → List members with roles
PATCH  /api/cloud/notebooks/:id/members/:userId   → Change role (editor ↔ viewer)
DELETE /api/cloud/notebooks/:id/members/:userId   → Remove member (disconnect active sessions)

# Share links
POST   /api/cloud/notebooks/:id/share-links       → Create link (default: private)
GET    /api/cloud/notebooks/:id/share-links        → List links
PATCH  /api/cloud/share-links/:linkId              → Toggle visibility (private ↔ public)
POST   /api/cloud/share-links/:linkId/revoke       → Revoke link

# Account-level sharing management
GET    /api/account/sharing                        → All notebooks user owns/shares + link status

# Public link resolution (no auth required)
GET    /api/public/shares/:token/resolve           → Resolve token → notebook metadata
GET    /api/public/shares/:token/documents/*path   → Read document content (view-only)
```

### 3.2 Invite service

**File:** `apps/api/src/services/sharing.ts` (new)

```typescript
export async function sendInvite(notebookId, ownerUserId, email, role): Promise<Invite>;
  // 1. Verify caller is owner
  // 2. Check if user already has access
  // 3. Generate cryptographically random invite token (256-bit)
  // 4. INSERT into notebook_shares (invite_token, shared_with_email, permission)
  // 5. Send invite email with accept link
  //    - If recipient has a Notebook.md account: link goes to app
  //    - If not: link goes to signup flow that auto-accepts after account creation
  // 6. Audit log: 'share_invite_sent'

export async function acceptInvite(token, userId): Promise<void>;
  // 1. Look up notebook_shares by invite_token
  // 2. Verify not expired, not already accepted
  // 3. UPDATE shared_with_user_id = userId, accepted_at = now()
  // 4. Audit log: 'share_invite_accepted'

export async function revokeAccess(notebookId, ownerUserId, targetUserId): Promise<void>;
  // 1. Verify caller is owner
  // 2. UPDATE notebook_shares SET revoked_at = now()
  // 3. Disconnect any active collab sessions for this user on this notebook
  //    (send disconnect signal to HocusPocus via Redis pub/sub)
  // 4. Audit log: 'share_access_revoked'
```

### 3.3 Share link service

**File:** `apps/api/src/services/shareLinks.ts` (new)

```typescript
export async function createShareLink(notebookId, userId, visibility): Promise<ShareLink>;
  // 1. Verify caller is owner
  // 2. Generate cryptographically random link token
  // 3. INSERT into notebook_public_links (link_token, visibility, permission='viewer')
  // 4. Return { url: `${WEB_URL}/s/${token}`, visibility, isActive: true }
  // 5. Audit log: 'share_link_created'

export async function revokeShareLink(linkId, userId): Promise<void>;
  // 1. Verify caller is owner
  // 2. UPDATE notebook_public_links SET is_active = false, revoked_at = now()
  // 3. Audit log: 'share_link_revoked'

export async function resolvePublicLink(token): Promise<NotebookMetadata | null>;
  // 1. SELECT FROM notebook_public_links WHERE link_token AND is_active AND visibility='public'
  // 2. Return notebook metadata (name, file list) or null
```

### 3.4 Invite email template

**File:** `apps/api/src/lib/emailTemplates.ts` (extend existing)

Add invite email template using existing transactional email infrastructure (Nodemailer):

```
Subject: "[Owner Name] invited you to collaborate on [Notebook Name]"
Body: CTA button → accept link
```

### 3.5 HocusPocus authorization update

**File:** `apps/collab/src/server.ts`

Update `onAuthenticate` to check `notebook_shares`:

```typescript
async onAuthenticate({ token, documentName }) {
  const user = await validateSession(token);
  const { notebookId } = parseDocumentName(documentName);

  // Check: is user the owner?
  const notebook = await getNotebook(notebookId);
  if (notebook.user_id === user.id) return { user: { ...user, permission: 'owner' } };

  // Check: does user have a share?
  const share = await getShare(notebookId, user.id);
  if (!share || share.revoked_at) throw new Error('Forbidden');

  return {
    user: { id: user.id, name: user.displayName, color: assignColor(user.id), permission: share.permission }
  };
}
```

### 3.6 Sharing modal UI

**File:** `apps/web/src/components/notebook/ShareNotebookModal.tsx` (new)

- **Invite tab:**
  - Email input + role dropdown (Editor / Viewer) + "Send Invite" button
  - List of pending invites with revoke button
- **Link tab:**
  - "Copy link" button (copies to clipboard) — per D23
  - Private/Public toggle (default: private per D12)
  - "Unshare" button to revoke the link
  - Visual indicator: lock icon for private, globe icon for public
- **Members tab:**
  - List of current collaborators with role, avatar, name
  - Dropdown to change role (owner can change editor ↔ viewer)
  - "Remove" button to revoke access

Triggered from: notebook context menu → "Share" option, or share button in the editor top bar.

### 3.7 "Shared with me" sidebar section

**File:** `apps/web/src/components/notebook/NotebookTree.tsx`

- Add a "Shared with me" section in the sidebar below the user's own notebooks
- Fetched from `GET /api/cloud/notebooks` which returns both owned and shared notebooks
- Shared notebooks display the owner's name and a "shared" badge
- Shared notebooks are read-only in the tree (can't rename, delete, or reorganize — only the owner can)

**File:** `apps/web/src/hooks/useNotebookManager.ts`

- Extend notebook fetching to include shared Cloud notebooks
- Shared notebooks have `role` attached (editor/viewer)
- Viewer role: editing is disabled (editor is readOnly)

### 3.8 Public link viewer page

**File:** `apps/web/src/components/public/PublicDocumentViewer.tsx` (new)

- New route: `/s/:token` (add to `Router.tsx`)
- Resolves token via `GET /api/public/shares/:token/resolve`
- Renders document in read-only editor (no auth required)
- Page includes `<meta name="robots" content="noindex, nofollow">` (D19)
- CTA banner at top: "Sign up to create and collaborate on your own notebooks"
- Styled with the same editor chrome but without toolbar/editing controls
- Responsive headers: `X-Robots-Tag: noindex, nofollow, noarchive`

### 3.9 Account-level sharing management page

**File:** `apps/web/src/components/account/SharingPage.tsx` (new)

Per D13, accessible from account settings menu → "Sharing":

- **Notebooks I've shared:** List with collaborator count, link status (private/public/none), quick revoke button
- **Notebooks shared with me:** List with owner name, my role, "Leave" button
- **Active links:** List with visibility, creation date, revoke button

### 3.10 Access revocation with live disconnect

When an owner revokes a collaborator's access or revokes a share link:

**File:** `apps/api/src/services/sharing.ts`

- Publish a message to Redis channel: `collab:disconnect:{notebookId}:{userId}`

**File:** `apps/collab/src/server.ts`

- Subscribe to `collab:disconnect:*` Redis channel
- On message: find matching connections and close them with an authorization error
- Client-side: HocusPocus provider handles disconnect gracefully, shows "Access revoked" message

### Phase 3 — Exit Criteria

- [x] Owner can send invite by email; recipient receives email with accept link
- [x] Accepting an invite grants access; notebook appears in "Shared with me"
- [x] Owner can generate private and public share links
- [x] Copy link button copies URL to clipboard
- [x] Public links resolve to read-only document view (no auth required)
- [x] Public link pages include noindex meta tags
- [x] Owner can revoke access; collaborator is disconnected immediately
- [ ] Account sharing management page lists all shares and links
- [ ] Viewer role enforces read-only editing
- [ ] Editor role allows full editing via collaboration
- [x] All permission checks are enforced server-side (API + HocusPocus)
- [x] Audit log entries for all sharing actions
- [x] All existing tests pass + new integration tests for sharing flows

---

## Phase 4 — Cross-Source Drag-to-Copy & Export

**Goal:** Enable dragging files from any notebook source into a Cloud notebook, and exporting Cloud notebooks to external providers or as a download.

### 4.1 Cross-source drag-to-copy

**File:** `apps/web/src/components/notebook/NotebookTree.tsx`

Per D26, extend the existing drag-and-drop logic:

- When a file is dragged from a BYO notebook (GitHub/OneDrive/Google Drive) onto a Cloud notebook folder:
  1. Read the file content via existing source adapter (`GET /api/sources/:provider/files/*`)
  2. Create the file in the Cloud notebook via `POST /api/sources/cloud/files/*`
  3. Show success toast: "File copied to Cloud notebook"
- Handle errors: quota exceeded, file too large, network failure

**File:** `apps/web/src/hooks/useNotebookManager.ts`

- Add `handleCrossSourceCopy(sourceNotebookId, sourceFilePath, targetNotebookId, targetFolderPath)` function
- Determine source adapter from notebook's `source_type`
- Fetch content → create in target → update tree

### 4.2 Export Cloud notebook

**File:** `apps/api/src/routes/cloud.ts`

```
GET /api/cloud/notebooks/:id/export    → Download as .zip of Markdown files
```

- Queries all `cloud_documents` for the notebook
- Decrypts content
- Generates a .zip file with correct directory structure
- Streams to client as `application/zip`

### 4.3 Export to external provider

**File:** `apps/web/src/components/notebook/ExportNotebookModal.tsx` (new)

- UI to select target provider (GitHub, OneDrive, Google Drive) and configure destination
- Iterates over Cloud notebook files, creates each in the target via existing source adapters
- Shows progress bar and handles errors

### Phase 4 — Exit Criteria

- [x] Dragging a file from a GitHub notebook to a Cloud notebook copies the file
- [x] Dragging works from OneDrive and Google Drive notebooks too
- [x] File content is correctly preserved in the copy
- [x] Exporting a Cloud notebook downloads a .zip with all Markdown files
- [x] Quota is updated when files are copied into Cloud

---

## Phase 5 — Quota Banners, Version History & Polish

**Goal:** Implement the quota warning UX, version history UI, and final polish before launch.

### 5.1 Quota warning banners

**File:** `apps/web/src/components/layout/QuotaBanner.tsx` (new)

Per D20:

- Fetch `GET /api/usage/me` on app load (and periodically)
- **≥ 90% usage:** Yellow warning banner (similar to demo mode banner): "You're approaching your Cloud storage limit. [X MB] of [500 MB] used."
- **≥ 100% usage:** Red exceeded banner: "You've exceeded your Cloud storage limit. You can continue editing for now, but please free up space by deleting files or notebooks."
- Banners are dismissible per session but reappear on next load
- Gated behind `soft_quota_banners` feature flag

### 5.2 Version history UI

**File:** `apps/web/src/components/notebook/VersionHistoryPanel.tsx` (new)

- Slide-out panel showing version history for a Cloud document
- List of versions with: timestamp, author name, size, optional change summary
- Click a version to preview it in the editor (read-only diff view)
- "Restore this version" button creates a new version with the old content

**API endpoints:**

**File:** `apps/api/src/routes/cloud.ts` — Add:

```
GET  /api/cloud/documents/:docId/versions          → List versions (paginated)
GET  /api/cloud/documents/:docId/versions/:versionId → Get version content
POST /api/cloud/documents/:docId/versions/:versionId/restore → Restore version
```

### 5.3 Version retention cleanup

**File:** `apps/api/src/jobs/versionCleanup.ts` (new)

- Scheduled job (daily): delete versions older than 90 days or beyond 100 per document
- Reclaim storage and update usage counters
- Can run as a simple cron-style function called from the API server on startup, or via a lightweight scheduler

### 5.4 Usage reconciliation job

**File:** `apps/api/src/jobs/usageReconciliation.ts` (new)

- Scheduled job (nightly): recompute `user_usage_counters` from actual `cloud_documents` + `document_versions` tables
- Fixes any counter drift from edge cases (crashes, partial transactions)

### 5.5 Account deletion warning for Cloud notebooks

**File:** `apps/web/src/components/account/AccountModal.tsx`

Per D27, when a user initiates account deletion:

- If user has Cloud notebooks (especially shared ones):
  - Show additional warning: "Deleting your account will permanently delete [N] Cloud notebooks shared with [M] collaborators. This cannot be undone."
  - Require explicit confirmation checkbox

**File:** `apps/api/src/routes/auth.ts`

- Account deletion CASCADE already handles `cloud_documents` and `notebook_shares` via foreign keys
- Ensure usage counters are cleaned up

### 5.6 Markdown serialization tests

Per risk mitigation (§14 of requirements):

**File:** `apps/collab/src/tests/markdownFidelity.test.ts` (new)

- Test suite that round-trips Markdown → Yjs → Markdown and asserts fidelity
- Cover: headings, lists, tables, code blocks, images, links, callouts, math, task lists
- Run as part of CI to catch regressions in the conversion pipeline

### Phase 5 — Exit Criteria

- [x] Warning banner appears at 90% storage usage
- [x] Exceeded banner appears at 100% storage usage
- [x] Banners are dismissible per session
- [x] Version history panel shows versions for Cloud documents
- [x] Users can preview and restore previous versions
- [x] Version cleanup job removes old versions correctly
- [x] Usage reconciliation job corrects counter drift
- [x] Account deletion warns about shared Cloud notebook impact
- [ ] Markdown round-trip fidelity tests pass in CI
- [x] All existing tests pass

---

## Phase 6 — Hardening, Marketing & Launch

**Goal:** Security review, load testing, marketing updates, and progressive rollout.

### 6.1 Security review

- Threat model review for multi-tenant document storage
- Penetration testing of:
  - WebSocket authentication and authorization
  - Share token generation and validation
  - Public link access controls
  - Encryption at rest implementation
  - ACL bypass attempts (e.g., modifying notebook_id in document name)
- Review all new API endpoints for:
  - Input validation
  - Authorization checks (owner-only operations)
  - Rate limiting
  - SQL injection (parameterized queries)

### 6.2 Load testing

**Target (from D9):**
- 25 concurrent editors per document (stretch to 50)
- 100+ concurrent viewers
- p95 edit propagation < 250ms

**Test scenarios:**
1. Single document, 25 editors typing simultaneously → measure propagation latency
2. Single document, 50 editors → find degradation point
3. 100 viewers observing live edits → measure server load
4. 50 concurrent documents with 5 editors each → measure cluster capacity
5. Reconnection under load → measure reconnect success rate

**Tools:** k6, Artillery, or custom WebSocket load test scripts

### 6.3 Infrastructure updates

**File:** `infra/terraform/container_apps.tf`

Add collab Container App:

```hcl
resource "azurerm_container_app" "collab" {
  name                         = "collab"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"

  template {
    container {
      name   = "collab"
      image  = "${azurerm_container_registry.main.login_server}/collab:${var.image_tag}"
      cpu    = 0.5
      memory = "1Gi"

      env { name = "DATABASE_URL" secret_name = "database-url" }
      env { name = "REDIS_URL"    secret_name = "redis-url" }
      env { name = "COLLAB_PORT"  value = "3002" }
    }
    min_replicas = 1
    max_replicas = 5
  }

  ingress {
    external_enabled = true
    target_port      = 3002
    transport        = "auto"  # supports WebSocket upgrade
  }
}
```

**File:** Azure Front Door / Application Gateway routing:

- Add rule: `api.notebookmd.io/collab/*` → collab Container App (with WebSocket upgrade)

### 6.4 CI/CD updates

**File:** `.github/workflows/ci.yml`

- Add collab to change detection (path filter)
- Add `build-collab` job: typecheck + build `apps/collab`
- Add `test-collab` job: run Markdown fidelity tests and any HocusPocus integration tests

**File:** `.github/workflows/deploy.yml`

- Add collab image build + push to ACR (`crnotebookmdprod.azurecr.io/collab`)
- Add collab container deploy step
- Health check: collab WebSocket endpoint accepts connections

### 6.5 Marketing & legal updates

Update all surfaces identified in requirements §12.5:

| File | Change |
|------|--------|
| `README.md` | Add Cloud notebooks and co-authoring to feature list |
| `apps/web/src/components/marketing/FeaturesPage.tsx` | Add co-authoring feature card; update "Your Storage, Your Data" copy |
| `apps/web/src/components/marketing/AboutPage.tsx` | Update philosophy section per requirements §12.1 |
| `apps/web/src/components/marketing/MarketingLayout.tsx` | Add comparison table (BYO vs Cloud) |
| `apps/web/src/components/legal/PrivacyPage.tsx` | Update §3 with Cloud notebook data processing |
| `apps/web/src/components/legal/TermsPage.tsx` | Add Cloud notebook terms, account deletion behavior |
| i18n `translation.json` | Update any "we never store" strings |

### 6.6 Progressive rollout

| Stage | Feature Flags Enabled | Audience |
|-------|----------------------|----------|
| **Internal alpha** | `cloud_notebooks`, `cloud_collab` | Team accounts only |
| **Private beta** | + `cloud_sharing`, `soft_quota_banners` | Invite-only beta users |
| **Public beta** | + `cloud_public_links` | All users (beta label) |
| **GA** | All flags on, remove beta label | All users |

**Rollback rule:** If collab instability occurs, disable `cloud_collab` while keeping Cloud documents readable/editable via REST (fallback to debounced save like BYO notebooks).

### 6.7 Monitoring & alerting

- **HocusPocus metrics:** active connections, documents loaded, WebSocket errors, persistence latency
- **Application metrics:** Cloud notebooks created, invites sent/accepted, public link views
- **Quota metrics:** users near limits, exceeded users
- **Alerts:** WebSocket error rate > 5%, persistence latency p95 > 5s, collab container restarts

### Phase 6 — Exit Criteria

- [ ] Security review completed with all findings addressed
- [ ] Load test validates p95 < 250ms with 25 concurrent editors
- [ ] Terraform applied; collab Container App running in production
- [ ] CI/CD pipeline builds and deploys collab alongside api/web
- [ ] All marketing pages updated with new copy
- [ ] Privacy policy and terms updated
- [ ] Internal alpha tested for 1+ weeks
- [ ] Private beta tested with external users
- [ ] GA launch with all flags enabled

---

## Appendix A — New File Inventory

| Phase | File | Type |
|-------|------|------|
| 0 | `apps/api/migrations/004_feature-flags-cloud.sql` | Migration |
| 0 | `apps/api/src/services/featureFlags.ts` | Service |
| 0 | `apps/collab/package.json` | Config |
| 0 | `apps/collab/tsconfig.json` | Config |
| 0 | `apps/collab/src/server.ts` | Entry point |
| 0 | `docker/Dockerfile.collab` | Docker |
| 1 | `apps/api/migrations/005_cloud-collab.sql` | Migration |
| 1 | `apps/api/migrations/006_plans-entitlements.sql` | Migration |
| 1 | `apps/api/src/services/entitlements.ts` | Service |
| 1 | `apps/api/src/services/usageAccounting.ts` | Service |
| 1 | `apps/api/src/services/sources/cloud.ts` | Adapter |
| 1 | `apps/api/src/lib/cloudEncryption.ts` | Utility |
| 1 | `apps/api/src/routes/cloud.ts` | Routes |
| 1 | `apps/api/src/routes/entitlements.ts` | Routes |
| 2 | `apps/collab/src/lib/ydocMarkdown.ts` | Utility |
| 2 | `apps/web/src/hooks/useCollaboration.ts` | Hook |
| 2 | `apps/web/src/components/editor/CollaboratorAvatars.tsx` | Component |
| 2 | `apps/web/src/components/editor/CollaboratorCursors.css` | Styles |
| 3 | `apps/api/src/routes/sharing.ts` | Routes |
| 3 | `apps/api/src/services/sharing.ts` | Service |
| 3 | `apps/api/src/services/shareLinks.ts` | Service |
| 3 | `apps/web/src/components/notebook/ShareNotebookModal.tsx` | Component |
| 3 | `apps/web/src/components/public/PublicDocumentViewer.tsx` | Component |
| 3 | `apps/web/src/components/account/SharingPage.tsx` | Component |
| 4 | `apps/web/src/components/notebook/ExportNotebookModal.tsx` | Component |
| 5 | `apps/web/src/components/layout/QuotaBanner.tsx` | Component |
| 5 | `apps/web/src/components/notebook/VersionHistoryPanel.tsx` | Component |
| 5 | `apps/api/src/jobs/versionCleanup.ts` | Job |
| 5 | `apps/api/src/jobs/usageReconciliation.ts` | Job |
| 5 | `apps/collab/src/tests/markdownFidelity.test.ts` | Test |

## Appendix B — Modified File Inventory

| Phase | File | Change |
|-------|------|--------|
| 0 | `packages/shared/src/index.ts` | Add `'cloud'` to SourceType |
| 0 | `dev.sh` | Add collab server startup/stop/status (step [4/7]) |
| 0 | `apps/web/vite.config.ts` | Add `/collab` WebSocket proxy to `localhost:3002` |
| 0 | `.env.example` | Add `COLLAB_PORT=3002` |
| 0 | `apps/web/src/components/notebook/AddNotebookModal.tsx` | Add Cloud source option |
| 0 | `apps/web/src/components/notebook/SourceTypes.tsx` | Add Cloud type definition |
| 1 | `apps/api/src/app.ts` | Register CloudAdapter; mount cloud/entitlements routes |
| 1 | `apps/api/src/routes/notebooks.ts` | Support `source_type: 'cloud'` in create/delete |
| 1 | `apps/api/src/routes/auth.ts` | Assign free plan on signup |
| 2 | `apps/web/package.json` | Add collaboration dependencies |
| 2 | `apps/web/src/components/editor/extensions.ts` | Add collaboration extensions (conditional) |
| 2 | `apps/web/src/components/editor/MarkdownEditor.tsx` | Collaborative mode, view mode lock, mobile read-only |
| 2 | `apps/web/src/components/layout/DocumentPane.tsx` | Wire useCollaboration hook |
| 2 | `apps/web/src/hooks/useNotebookManager.ts` | Skip auto-save for Cloud docs |
| 3 | `apps/web/src/Router.tsx` | Add `/s/:token` public link route |
| 3 | `apps/web/src/components/notebook/NotebookTree.tsx` | "Shared with me" section |
| 3 | `apps/api/src/lib/emailTemplates.ts` | Add invite email template |
| 3 | `apps/collab/src/server.ts` | Check notebook_shares in onAuthenticate |
| 4 | `apps/web/src/components/notebook/NotebookTree.tsx` | Cross-source drag-to-copy |
| 4 | `apps/web/src/hooks/useNotebookManager.ts` | handleCrossSourceCopy function |
| 5 | `apps/web/src/components/account/AccountModal.tsx` | Cloud notebook deletion warning |
| 6 | `infra/terraform/container_apps.tf` | Add collab Container App |
| 6 | `.github/workflows/ci.yml` | Add collab build/test jobs |
| 6 | `.github/workflows/deploy.yml` | Add collab deploy step |
| 6 | `README.md` | Update feature list |
| 6 | Multiple marketing/legal pages | Copy updates per requirements §12 |

## Appendix C — npm Packages to Add

| Workspace | Package | Version | Purpose |
|-----------|---------|---------|---------|
| `apps/web` | `@tiptap/extension-collaboration` | `^2.x` | TipTap Yjs integration |
| `apps/web` | `@tiptap/extension-collaboration-cursor` | `^2.x` | Live cursors/selections |
| `apps/web` | `@hocuspocus/provider` | `^2.x` | WebSocket client for HocusPocus |
| `apps/web` | `yjs` | `^13.x` | CRDT library |
| `apps/web` | `y-prosemirror` | `^1.x` | Yjs ↔ ProseMirror binding |
| `apps/collab` | `@hocuspocus/server` | `^2.x` | WebSocket collaboration server |
| `apps/collab` | `@hocuspocus/extension-database` | `^2.x` | Persistence hooks |
| `apps/collab` | `@hocuspocus/extension-redis` | `^2.x` | Multi-instance scaling |
| `apps/collab` | `yjs` | `^13.x` | CRDT library (server-side) |
| `apps/collab` | `y-prosemirror` | `^1.x` | Yjs ↔ ProseMirror (for Markdown conversion) |
| `apps/collab` | `pg` | `^8.18.0` | PostgreSQL client |
| `apps/collab` | `ioredis` | `^5.9.3` | Redis client |
