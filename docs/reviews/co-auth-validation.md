# Co-Authoring Feature — Validation Guide

**Date:** 2026-02-23  
**Branch:** `feature/co-auth`  
**Commits:** 7 (from `a1bc75c` to `5dcf10a`)  
**Scope:** Phases 0–5 (local dev only — no infra, CI/CD, or marketing changes)

---

## What Was Built

The co-authoring feature adds **Cloud notebooks** to Notebook.md — real-time collaborative Markdown editing with sharing, version history, and quota management. Here's a phase-by-phase summary:

### Phase 0 — Foundation Wiring
- **Feature flags** system (`feature_flags` DB table + `GET /api/feature-flags/:key` endpoint + `useFeatureFlag` hook)
- **Cloud source type** added to shared types and UI (gated behind `cloud_notebooks` flag)
- **HocusPocus collab server** stub at `apps/collab` on port 3002
- **Dev infrastructure** updated: `dev.sh` starts 7 services, Vite proxies `/collab` WebSocket

### Phase 1 — Database Schema & Entitlements
- **5 new tables:** `cloud_documents`, `notebook_shares`, `notebook_public_links`, `collab_sessions`, `document_versions`
- **Plans & entitlements:** `plans`, `plan_entitlements`, `user_plan_subscriptions`, `user_usage_counters` + free plan seed
- **Cloud source adapter** with AES-256-GCM encryption at rest
- **Entitlement enforcement:** 3 notebook limit (hard), 500 MB storage (soft warnings only)
- **Usage accounting:** counter increment/decrement/reconciliation
- Free plan auto-assigned on signup

### Phase 2 — Real-Time Collaboration
- **Full HocusPocus server** with session auth, permission checks, Yjs state persistence
- **`useCollaboration` hook** for provider lifecycle management
- **CollaboratorAvatars** component + cursor CSS
- **TipTap extensions** updated for collaborative mode (Collaboration + CollaborationCursor)

### Phase 3 — Sharing & Permissions
- **Sharing service:** sendInvite (hashed tokens), acceptInvite, revokeAccess, getMembers, updateMemberRole
- **Share links service:** create, revoke, toggle visibility, resolve public links
- **API routes** at `/api/cloud/notebooks/:id/invites|members|share-links`
- **Public link resolution** at `/api/public/shares/:token` (no auth)
- **Invite emails** with accept link
- **ShareNotebookModal** UI (invite/members/links tabs)
- **PublicDocumentViewer** at `/s/:token`

### Phase 4 — Cross-Source & Export
- **Export endpoint:** `GET /api/cloud/notebooks/:id/export` → `.zip` of decrypted Markdown
- **Cross-source drag-and-drop:** Any notebook → Cloud (GitHub, OneDrive, Google Drive all supported)

### Phase 5 — Quota, Versions & Polish
- **QuotaBanner** component (yellow at 90%, red at 100%, dismissible)
- **Version history API:** list, view content, restore (saves pre-restore snapshot)
- **VersionHistoryPanel** slide-out UI
- **Cleanup jobs:** version retention (90 days / 100 per doc), usage counter reconciliation
- **Account deletion warning** for Cloud notebooks with explicit checkbox

### By the Numbers

| Metric | Value |
|--------|-------|
| New files | 30 |
| Modified files | 23 |
| Lines added | ~3,650 |
| New test files | 5 |
| New tests | 42 |
| Total tests passing | 266 |
| Commits | 7 |

---

## Validation Steps

### Prerequisites

1. You're on the `feature/co-auth` branch
2. Docker is running (PostgreSQL + Redis + Mailpit)
3. Dev services are available (or can be started)

### Step 1 — Run All Tests

This is the fastest way to verify correctness:

```bash
npm run test:api
```

**Expected:** 266 tests pass across 22 test files, including:
- `feature-flags.test.ts` (3 tests)
- `cloud-notebooks.test.ts` (15 tests)
- `sharing.test.ts` (14 tests)
- `cloud-export.test.ts` (2 tests)
- `version-history.test.ts` (8 tests)

### Step 2 — Verify Database Migrations

Start dev services and check that migrations run cleanly:

```bash
./dev.sh
```

Then connect to the database and verify tables exist:

```bash
docker exec -it notebookmd-postgres psql -U notebookmd -d notebookmd -c "\dt"
```

**Expected new tables:**
- `cloud_documents`
- `notebook_shares`
- `notebook_public_links`
- `collab_sessions`
- `document_versions`
- `plans`
- `plan_entitlements`
- `user_plan_subscriptions`
- `user_usage_counters`
- `feature_flags`

### Step 3 — Feature Flags (API)

```bash
# In dev mode, flags auto-enable
curl -s http://localhost:3001/api/feature-flags/cloud_notebooks | jq
# Expected: { "key": "cloud_notebooks", "enabled": true }
```

### Step 4 — Create a Cloud Notebook

Sign in at `http://localhost:5173`, then:

1. Click **"+ Add Notebook"**
2. You should see a **Cloud** source type (cloud icon) in the source picker
3. Select Cloud, give it a name, and create it
4. The notebook should appear in the sidebar

**API equivalent:**

```bash
# Get your auth cookie from browser DevTools, then:
curl -s -X POST http://localhost:3001/api/notebooks \
  -H "Content-Type: application/json" \
  -b "refresh_token=YOUR_TOKEN" \
  -d '{"name":"Test Cloud","sourceType":"cloud","sourceConfig":{}}' | jq
```

### Step 5 — Create & Read Cloud Documents

```bash
# Create a file (use notebook ID from step 4)
curl -s -X POST "http://localhost:3001/api/sources/cloud/files/hello.md?root=NOTEBOOK_ID" \
  -H "Content-Type: application/json" \
  -b "refresh_token=YOUR_TOKEN" \
  -d '{"content":"# Hello from Cloud"}' | jq

# Read it back
curl -s "http://localhost:3001/api/sources/cloud/files/hello.md?root=NOTEBOOK_ID" \
  -b "refresh_token=YOUR_TOKEN" | jq '.content'
# Expected: "# Hello from Cloud"
```

### Step 6 — Entitlement Limits

Create 3 cloud notebooks (the free tier max), then try creating a 4th:

```bash
# After creating 3 notebooks...
curl -s -X POST http://localhost:3001/api/notebooks \
  -H "Content-Type: application/json" \
  -b "refresh_token=YOUR_TOKEN" \
  -d '{"name":"Fourth Cloud","sourceType":"cloud","sourceConfig":{}}' | jq
# Expected: 403 with "Cloud notebook limit reached"
```

### Step 7 — Sharing Flow

1. **Send invite:**
```bash
curl -s -X POST "http://localhost:3001/api/cloud/notebooks/NOTEBOOK_ID/invites" \
  -H "Content-Type: application/json" \
  -b "refresh_token=YOUR_TOKEN" \
  -d '{"email":"collaborator@example.com","permission":"editor"}' | jq
```

2. **Check Mailpit** at `http://localhost:8025` — you should see the invite email with an accept link

3. **List members:**
```bash
curl -s "http://localhost:3001/api/cloud/notebooks/NOTEBOOK_ID/members" \
  -b "refresh_token=YOUR_TOKEN" | jq
```

### Step 8 — Public Share Links

```bash
# Create a public link
curl -s -X POST "http://localhost:3001/api/cloud/notebooks/NOTEBOOK_ID/share-links" \
  -H "Content-Type: application/json" \
  -b "refresh_token=YOUR_TOKEN" \
  -d '{"visibility":"public"}' | jq

# Resolve it (no auth required!)
curl -s "http://localhost:3001/api/public/shares/LINK_TOKEN/resolve" | jq

# Read a document through the public link
curl -s "http://localhost:3001/api/public/shares/LINK_TOKEN/documents/hello.md" | jq
# Expected: decrypted content, X-Robots-Tag header present
```

Visit `http://localhost:5173/s/LINK_TOKEN` in an incognito browser to see the PublicDocumentViewer.

### Step 9 — Export as Zip

```bash
curl -s "http://localhost:3001/api/cloud/notebooks/NOTEBOOK_ID/export" \
  -b "refresh_token=YOUR_TOKEN" \
  -o notebook.zip

unzip -l notebook.zip
# Expected: lists all files in the notebook with correct paths
```

### Step 10 — Version History

```bash
# Get a document ID
DOC_ID=$(docker exec notebookmd-postgres psql -U notebookmd -d notebookmd -t -c \
  "SELECT id FROM cloud_documents WHERE notebook_id = 'NOTEBOOK_ID' LIMIT 1" | tr -d ' ')

# List versions
curl -s "http://localhost:3001/api/cloud/documents/$DOC_ID/versions" \
  -b "refresh_token=YOUR_TOKEN" | jq

# Restore a version (creates pre-restore snapshot automatically)
curl -s -X POST "http://localhost:3001/api/cloud/documents/$DOC_ID/versions/VERSION_ID/restore" \
  -b "refresh_token=YOUR_TOKEN" | jq
```

### Step 11 — Usage & Quota

```bash
curl -s http://localhost:3001/api/usage/me \
  -b "refresh_token=YOUR_TOKEN" | jq
# Expected: cloudNotebooks count, storageBytesUsed, storageLimit, bannerState
```

### Step 12 — UI Walkthrough

In the browser at `http://localhost:5173`:

1. **Cloud icon** visible in "Add Notebook" source picker
2. **ShareNotebookModal** — right-click a Cloud notebook, select "Share" (if wired to context menu; otherwise, check component exists)
3. **QuotaBanner** — would appear if storage exceeds 90% (hard to trigger manually)
4. **Account Settings → Delete Account** — with Cloud notebooks present, should show the red warning box with checkbox
5. **Drag a file** from a GitHub/local notebook onto a Cloud notebook — should copy with a success toast

### Step 13 — Collab Server (Manual)

The HocusPocus collab server starts on port 3002 via `dev.sh`. To verify:

```bash
# Check it's running
curl -s http://localhost:3002
# (Will likely return a WebSocket upgrade error — that's expected for HTTP)
```

The collaboration hooks (`useCollaboration`) and extensions are wired in the editor but require a full end-to-end setup with two browser sessions to test live cursors.

---

## What's NOT Included (Out of Scope)

Per the instructions, these were explicitly excluded:

- ❌ Production infrastructure (Terraform, container apps)
- ❌ CI/CD pipeline changes (GitHub Actions workflows)
- ❌ Marketing pages (features, about, landing)
- ❌ Phase 6 (hardening, rate limiting, marketing, launch)
- ❌ Markdown round-trip fidelity tests (listed in Phase 5 exit criteria as unchecked)
- ❌ Full end-to-end Playwright tests for co-authoring flows
- ❌ Viewer/editor role enforcement in the TipTap editor UI (server-side checks exist)
- ❌ "Shared with me" sidebar section in NotebookTree
- ❌ Account-level sharing management page

---

## Known Gaps / Follow-Up Items

1. **Viewer role UI enforcement** — Server rejects writes, but the editor UI doesn't disable editing for viewers yet
2. **"Shared with me" sidebar** — Notebooks shared with you don't appear in a separate section yet
3. **ShareNotebookModal integration** — The modal component exists but needs to be wired into the notebook context menu
4. **Markdown fidelity tests** — Round-trip tests for Yjs ↔ Markdown conversion not yet written
5. **Live collab testing** — Requires two browser sessions; not covered by automated tests
6. **ExportNotebookModal** — UI for exporting to external providers (GitHub/OneDrive/GDrive) not built; only zip download exists
