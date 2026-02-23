# Co-Authoring Implementation Plan (Codex)

**Requirements Source:** `docs/requirements/co-auth-requirements-codex.md`  
**Date:** 2026-02-23  
**Status:** Ready for implementation

---

## 1) Objective

Implement **Cloud** notebooks with real-time co-authoring while keeping existing BYO sources (`local`, `github`, `onedrive`, `google-drive`) as single-author.

This plan is implementation-ready and includes:
- architecture and rollout phases,
- migration/table design,
- API contracts (REST + collaboration socket),
- entitlement/usage scaffolding (free tier defaults),
- testing and operational gates.

---

## 2) Locked Product Decisions (from approved requirements)

1. Cloud collaboration is available on free tier initially.
2. BYO notebooks remain single-author in v1.
3. Roles at launch: `owner`, `editor`, `viewer`.
4. Anonymous public links are allowed as view-only.
5. Share links default to `private`; users can switch to `public`.
6. Public links are secret URL style and non-indexable.
7. Free-tier limits:
   - max 3 Cloud notebooks per user,
   - max 500 MB Cloud usage per user (uncompressed bytes),
   - quota includes current data + snapshots.
8. v1 quota behavior is soft-warning only:
   - warning banner at >= 90%,
   - exceeded banner at >= 100%,
   - no write blocking yet.
9. Keep future hard-enforcement path feature-flagged in backend.

---

## 3) High-Level Architecture

```
Web App (React + TipTap)
  ├─ REST API (Express)
  │   ├─ Cloud notebook/doc metadata (Postgres)
  │   ├─ Memberships/invites/share links (Postgres)
  │   ├─ Entitlements + usage counters (Postgres + Redis cache)
  │   └─ Snapshot/blob pointers (Postgres)
  ├─ Realtime Collaboration Gateway (Hocuspocus/Yjs)
  │   ├─ Auth + ACL check via API/session
  │   ├─ Awareness/presence via Redis backplane
  │   └─ CRDT update stream + snapshot triggers
  └─ Object Storage (document snapshot and asset payloads)
```

### 3.1 Core implementation choices
- Keep TipTap editor; add Yjs collaboration extension.
- Add a dedicated Cloud API surface (`/api/cloud/*`).
- Keep existing `/api/sources/*` unchanged for BYO providers.
- Use Postgres as policy and metadata source of truth.
- Use Redis for transient collab state and scaling.

---

## 4) Delivery Phases

## Phase 0 — Foundation wiring
- Add new source type: `cloud` across:
  - `packages/shared/src/index.ts` (`SourceType`),
  - web `SourceTypes` and add-notebook flow,
  - API validation for notebook creation/update.
- Add feature flags:
  - `cloud_notebooks_enabled`
  - `cloud_sharing_enabled`
  - `cloud_public_links_enabled`
  - `cloud_collab_enabled`
  - `soft_quota_banners_enabled`
  - `hard_quota_enforcement_enabled` (off by default)

## Phase 1 — Data model and migrations
- Add migration set for Cloud docs/sharing and entitlement scaffolding (sections 5.1–5.3).

## Phase 2 — Cloud notebook/document REST APIs
- CRUD tree for Cloud docs.
- Membership + invite flows.
- Share link create/list/revoke flows.
- Account-level sharing management endpoints.

## Phase 3 — Realtime collaboration
- Add collaboration gateway service and auth handshake.
- Add Yjs provider integration in web editor for Cloud docs.
- Add autosnapshot worker/trigger strategy.

## Phase 4 — Entitlements, usage, and banners
- Implement free-tier defaults.
- Usage accounting pipeline + reconciler.
- Expose usage/entitlements endpoint for banner state.

## Phase 5 — Public share read path
- Anonymous view-only token flow.
- Non-indexing controls.
- Public-reader UX with call-to-action to sign in for edit.

## Phase 6 — Hardening and rollout
- Security review, load tests, failover drills.
- Progressive flag rollout to internal, beta, then GA cohorts.

---

## 5) Database Migration Plan

## 5.1 Migration `004_cloud_collab_core.sql`

### A) Extend notebooks model (existing table)
- Reuse `notebooks.user_id` as owner.
- Accept `source_type = 'cloud'`.
- Add check/index support:

```sql
-- Optional check (if existing app flow allows)
-- ALTER TABLE notebooks ADD CONSTRAINT notebooks_source_type_check
-- CHECK (source_type IN ('local','github','onedrive','google-drive','icloud','cloud'));

CREATE INDEX IF NOT EXISTS idx_notebooks_source_type ON notebooks(source_type);
```

### B) Cloud documents
```sql
CREATE TABLE cloud_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES cloud_documents(id) ON DELETE CASCADE,
  path TEXT NOT NULL,                          -- canonical unique path within notebook
  name VARCHAR(255) NOT NULL,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('file','folder')),
  current_blob_key TEXT,                       -- object storage key (for file only)
  current_uncompressed_bytes BIGINT NOT NULL DEFAULT 0,
  latest_snapshot_id UUID,                     -- set after snapshots table creation
  version BIGINT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notebook_id, path)
);

CREATE INDEX idx_cloud_documents_notebook ON cloud_documents(notebook_id);
CREATE INDEX idx_cloud_documents_parent ON cloud_documents(parent_id);
CREATE INDEX idx_cloud_documents_kind ON cloud_documents(kind);
```

### C) Memberships
```sql
CREATE TABLE cloud_notebook_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('owner','editor','viewer')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notebook_id, user_id)
);

CREATE INDEX idx_cloud_memberships_user ON cloud_notebook_memberships(user_id);
CREATE INDEX idx_cloud_memberships_notebook ON cloud_notebook_memberships(notebook_id);
```

### D) Invites
```sql
CREATE TABLE cloud_notebook_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  email VARCHAR(320) NOT NULL,
  role VARCHAR(16) NOT NULL CHECK (role IN ('editor','viewer')),
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cloud_invites_notebook ON cloud_notebook_invites(notebook_id);
CREATE INDEX idx_cloud_invites_email ON cloud_notebook_invites(email);
```

### E) Share links
```sql
CREATE TABLE cloud_share_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  visibility VARCHAR(16) NOT NULL CHECK (visibility IN ('private','public')),
  role VARCHAR(16) NOT NULL CHECK (role IN ('viewer')), -- v1: view-only
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cloud_share_links_notebook ON cloud_share_links(notebook_id);
CREATE INDEX idx_cloud_share_links_active ON cloud_share_links(is_active);
```

### F) Snapshots
```sql
CREATE TABLE cloud_document_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES cloud_documents(id) ON DELETE CASCADE,
  blob_key TEXT NOT NULL,
  uncompressed_bytes BIGINT NOT NULL,
  compressed_bytes BIGINT,
  format VARCHAR(16) NOT NULL DEFAULT 'markdown',  -- markdown snapshot for export/restore
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cloud_snapshots_document ON cloud_document_snapshots(document_id);
CREATE INDEX idx_cloud_snapshots_created_at ON cloud_document_snapshots(created_at);
```

### G) Document events/audit
```sql
CREATE TABLE cloud_document_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES cloud_documents(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(64) NOT NULL,             -- e.g. snapshot_created, share_revoked
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cloud_doc_events_document ON cloud_document_events(document_id);
CREATE INDEX idx_cloud_doc_events_type ON cloud_document_events(event_type);
```

## 5.2 Migration `005_entitlements_and_usage.sql`

```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(64) NOT NULL UNIQUE,             -- free, pro, team, enterprise
  display_name VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plan_entitlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  entitlement_key VARCHAR(128) NOT NULL,       -- cloud.notebooks.max, cloud.storage.max_bytes, cloud.doc.max_bytes
  value_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id, entitlement_key)
);

CREATE TABLE user_plan_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE user_usage_counters (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cloud_notebooks_count INT NOT NULL DEFAULT 0,
  cloud_storage_uncompressed_bytes BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Seed defaults in migration:
- `plans.key = 'free'`
- `plan_entitlements`:
  - `cloud.notebooks.max = 3`
  - `cloud.storage.max_bytes = 524288000`
  - `cloud.doc.max_bytes = 5242880`
- create active free subscription for existing users.

## 5.3 Migration `006_indexes_constraints_backfill.sql`
- Backfill `user_usage_counters` from existing cloud artifacts.
- Add guard indexes for common queries:
  - memberships by `(user_id, role)`,
  - share link lookup by token hash,
  - documents by `(notebook_id, deleted_at)`.

---

## 6) API Contract (REST)

All authenticated endpoints use existing session auth (cookie-based) and return JSON.

## 6.1 Cloud notebooks

### `POST /api/cloud/notebooks`
Create a Cloud notebook.

Request:
```json
{ "name": "Team Docs" }
```

Response `201`:
```json
{
  "notebook": {
    "id": "uuid",
    "name": "Team Docs",
    "sourceType": "cloud",
    "role": "owner",
    "createdAt": "ISO8601"
  }
}
```

Errors:
- `403 LIMIT_EXCEEDED_NOTEBOOKS` (future hard mode only; in v1 still allow but emit warnings endpoint state)

### `GET /api/cloud/notebooks`
List cloud notebooks visible to caller (owner + member), with role summary.

### `GET /api/cloud/notebooks/:notebookId`
Notebook metadata + caller permissions + quota summary.

## 6.2 Cloud documents

### `GET /api/cloud/notebooks/:notebookId/tree`
Return full file/folder tree.

### `POST /api/cloud/notebooks/:notebookId/documents`
Create file/folder.

Request:
```json
{
  "parentPath": "docs",
  "name": "README.md",
  "kind": "file",
  "content": "# Hello"
}
```

Response `201`:
```json
{
  "document": {
    "id": "uuid",
    "path": "docs/README.md",
    "kind": "file",
    "version": 1,
    "uncompressedBytes": 8
  }
}
```

### `GET /api/cloud/notebooks/:notebookId/documents/{*docPath}`
Read canonical markdown snapshot.

### `PUT /api/cloud/notebooks/:notebookId/documents/{*docPath}`
Non-realtime save fallback endpoint (manual save/export pipeline).

Request:
```json
{
  "content": "# Updated",
  "expectedVersion": 10
}
```

Response:
```json
{
  "document": {
    "version": 11,
    "uncompressedBytes": 9,
    "updatedAt": "ISO8601"
  }
}
```

### `DELETE /api/cloud/notebooks/:notebookId/documents/{*docPath}`
Soft-delete doc/folder.

## 6.3 Memberships and invites

### `GET /api/cloud/notebooks/:notebookId/members`
List members with role.

### `POST /api/cloud/notebooks/:notebookId/invites`
Send invite.

Request:
```json
{ "email": "user@example.com", "role": "editor" }
```

### `POST /api/cloud/invites/:token/accept`
Accept invite and create membership.

### `PATCH /api/cloud/notebooks/:notebookId/members/:userId`
Update role (`editor|viewer`), owner transfer deferred.

### `DELETE /api/cloud/notebooks/:notebookId/members/:userId`
Remove member.

## 6.4 Share links and account sharing management

### `POST /api/cloud/notebooks/:notebookId/share-links`
Create link (default private).

Request:
```json
{ "visibility": "private" }
```

Response:
```json
{
  "shareLink": {
    "id": "uuid",
    "url": "https://www.notebookmd.io/s/<token>",
    "visibility": "private",
    "isActive": true
  }
}
```

### `GET /api/cloud/notebooks/:notebookId/share-links`
List links for notebook.

### `PATCH /api/cloud/share-links/:shareLinkId`
Change visibility or active state.

### `POST /api/cloud/share-links/:shareLinkId/revoke`
Revoke/unshare link.

### `GET /api/account/sharing`
Account-level sharing inventory for “Sharing” settings page.

Response includes notebooks/links created by or owned by caller.

## 6.5 Public share endpoints (anonymous)

### `GET /api/public/shares/:token/resolve`
Resolve token to notebook/document metadata if active and public.

### `GET /api/public/shares/:token/documents/{*docPath}`
Read-only document fetch.

Public response headers/pages must include non-indexing controls:
- `X-Robots-Tag: noindex, nofollow, noarchive`
- page-level `<meta name="robots" content="noindex,nofollow,noarchive">`

## 6.6 Entitlements and usage

### `GET /api/entitlements/me`
Resolved plan + entitlement values for current user.

### `GET /api/usage/me`
Current usage counters + banner state.

Response:
```json
{
  "cloud": {
    "notebooksCount": 2,
    "notebooksMax": 3,
    "storageBytes": 420000000,
    "storageMaxBytes": 524288000,
    "storageUsagePct": 80.1,
    "bannerState": "none"
  }
}
```

`bannerState` values: `none | warn_90 | exceeded_100`.

---

## 7) Collaboration Socket Contract

Endpoint: `wss://api.notebookmd.io/api/collab/ws`

Auth modes:
1. Session cookie (owner/editor/viewer authenticated user).
2. Share token (viewer-only for public links).

Connection init payload:
```json
{
  "documentId": "uuid",
  "clientVersion": "web-<sha>",
  "shareToken": "optional"
}
```

Server behavior:
- Validate ACL before joining room.
- Role gates:
  - `owner/editor`: read/write updates
  - `viewer`: awareness + read-only updates
- Broadcast awareness state through Redis backplane.
- Trigger snapshot policy (e.g., periodic interval + operation threshold).

Error frames:
- `AUTH_REQUIRED`
- `FORBIDDEN_ROLE`
- `DOCUMENT_NOT_FOUND`
- `FEATURE_DISABLED`

---

## 8) Entitlements + Quota Logic

### 8.1 v1 soft-quota policy
- Always compute usage and entitlement state.
- Never block writes due to quota in v1.
- Return banner state in `/api/usage/me`.

### 8.2 hard-quota readiness (flagged)
When `hard_quota_enforcement_enabled=true`:
- deny creates/writes that exceed limits with structured errors:
  - `LIMIT_EXCEEDED_NOTEBOOKS`
  - `LIMIT_EXCEEDED_STORAGE`
  - `LIMIT_EXCEEDED_DOC_SIZE`

Error contract:
```json
{
  "error": "LIMIT_EXCEEDED_STORAGE",
  "message": "Cloud storage limit reached.",
  "usage": { "current": 530000000, "limit": 524288000, "unit": "bytes_uncompressed" }
}
```

### 8.3 usage accounting source
- Authoritative in Postgres (`user_usage_counters`).
- Update counters in same transaction where possible.
- Nightly reconciliation recomputes from cloud document + snapshot tables.

---

## 9) Frontend Implementation Plan

## 9.1 Source + notebook flows
- Add `cloud` option to source picker in `AddNotebookModal`.
- Mark as available and gated by `cloud_notebooks_enabled`.
- Notebook tree integration for cloud document APIs.

## 9.2 Editor collaboration integration
- For Cloud docs, initialize Yjs provider and collaboration extension.
- Keep existing autosave path for BYO sources unchanged.
- Fallback to REST save endpoint if realtime unavailable.

## 9.3 Sharing UX
- Notebook share modal:
  - invite by email + role selection,
  - links list with private/public toggle + revoke.
- Account settings “Sharing” page:
  - list all active shares,
  - quick revoke/unshare.

## 9.4 Quota banners
- Banner system:
  - show warning at >= 90%,
  - show exceeded at >= 100%,
  - no disable/edit lock in v1.

---

## 10) Security and Compliance Checklist

1. Enforce ACL server-side on every cloud read/write/collab endpoint.
2. Hash share/invite tokens at rest.
3. Audit events for invite/send/accept, role changes, share create/revoke.
4. Ensure public-share responses are non-indexable.
5. Keep BYO notebook access semantics unchanged.
6. Document platform-managed keys now; BYOK as future design extension.

---

## 11) Testing Plan

## 11.1 API integration tests (apps/api)
- Cloud notebook create/list with memberships.
- Invite accept and role transitions.
- Share link create/toggle/revoke/public resolve.
- Entitlements defaulting to free plan.
- Usage counter updates and banner states.
- Access control matrix:
  - owner/editor/viewer/anonymous/public-token.

## 11.2 Web tests (apps/web + e2e)
- Create Cloud notebook from source picker.
- Open same Cloud doc in two sessions and validate live sync.
- Viewer read-only behavior via public link.
- Sharing page revoke flow.
- Banner rendering at 90% and 100% usage.

## 11.3 Realtime/load tests
- Per-document targets:
  - 20 active editors (baseline), 50 stretch.
- Validate p95 update propagation and reconnect behavior.
- Multi-node gateway with Redis backplane verification.

---

## 12) Rollout and Flags

1. **Internal alpha**
   - enable `cloud_notebooks_enabled`, `cloud_collab_enabled` for internal accounts.
2. **Private beta**
   - enable sharing/public links for allowlist users.
3. **GA**
   - enable all Cloud features broadly,
   - keep `hard_quota_enforcement_enabled=false`.
4. **Post-GA**
   - evaluate metrics, then pilot hard quota enforcement on internal cohort.

Rollback rule:
- If collab instability occurs, disable `cloud_collab_enabled` while keeping Cloud docs readable/exportable.

---

## 13) Implementation Work Breakdown by File Area

- `apps/api/migrations/*` — new schema migrations (004+).
- `apps/api/src/routes/cloud/*` — notebooks/docs/members/invites/shares/public/usage routes.
- `apps/api/src/services/cloud/*` — ACL, usage accounting, share token, snapshot service.
- `apps/api/src/services/entitlements/*` — plan resolution and limit evaluation.
- `apps/api/src/app.ts` — mount cloud/public/entitlements routes.
- `packages/shared/src/index.ts` — add `cloud` source type and related contracts.
- `apps/web/src/components/notebook/*` — add Cloud source selection and flows.
- `apps/web/src/components/account/*` — sharing management UI.
- `apps/web/src/hooks/useNotebookManager.ts` — Cloud notebook branch + realtime wiring.
- `apps/web/src/components/editor/*` — Yjs collaboration provider integration for Cloud docs.

---

## 14) Out of Scope for This Plan

1. BYO notebook real-time collaboration.
2. Paid checkout/subscription UI.
3. Link expiration controls.
4. BYOK key management implementation.
5. Data residency multi-region deployment changes.

