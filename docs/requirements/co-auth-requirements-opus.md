# Notebook.md — Co-Authoring Requirements Document

**Version:** 3.0  
**Date:** 2026-02-23  
**Status:** All questions answered — Ready for final review & technical design  
**Author:** Copilot (Opus 4.6), prompted by product owner

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement, Goals & Non-Goals](#2-problem-statement-goals--non-goals)
3. [Decisions Captured](#3-decisions-captured)
4. [Strategic Impact: "You Choose Where Content Lives"](#4-strategic-impact-you-choose-where-content-lives)
5. [Editor & Canvas Evaluation](#5-editor--canvas-evaluation)
6. [Collaboration Technology Evaluation](#6-collaboration-technology-evaluation)
7. [Application Layer & Data Storage](#7-application-layer--data-storage)
8. [Entitlements, Plans & Quotas](#8-entitlements-plans--quotas)
9. [Proposed Architecture](#9-proposed-architecture)
10. [Co-Authoring User Experience](#10-co-authoring-user-experience)
11. [Access Control & Sharing Model](#11-access-control--sharing-model)
12. [Messaging & Marketing Updates](#12-messaging--marketing-updates)
13. [Security Considerations](#13-security-considerations)
14. [Risks & Mitigations](#14-risks--mitigations)
15. [Migration & Rollout Plan](#15-migration--rollout-plan)
16. [Success Metrics](#16-success-metrics)
17. [Decisions Captured (Round 4)](#17-decisions-captured-round-4--opus-review)
18. [Deferred Items Register](#18-deferred-items-register)

---

## 1. Executive Summary

This document captures the requirements for adding **real-time co-authoring** to Notebook.md — enabling multiple users to simultaneously edit the same Markdown file with live cursor presence, conflict-free merging, and a sharing/permissions model.

Co-authoring fundamentally challenges Notebook.md's founding principle: **"We never store your content."** Today, all document content lives in user-owned cloud storage (GitHub, OneDrive, Google Drive), and our service acts as a transparent proxy. Real-time collaboration requires a shared, always-available document state that external providers cannot provide with the latency, ACL granularity, or API semantics needed for live co-editing.

This document evaluates how to introduce a **managed collaboration storage tier** while preserving the core identity of the product, and recommends technology choices for the editor, sync layer, and infrastructure.

> **Cross-reference:** This document was developed alongside a parallel Codex-authored requirements draft (`co-auth-requirements-codex.md`). The product owner provided three rounds of answers to that document's questions. All confirmed decisions from those rounds are incorporated here as requirements in §3 and throughout.

---

## 2. Problem Statement, Goals & Non-Goals

### 2.1 Problem

Users want to collaborate on Markdown documents in real time — similar to Google Docs or Notion — but Notebook.md currently has:

- **No server-side document storage** — content is proxied to/from external providers on every read/write
- **No WebSocket or real-time infrastructure** — the API is stateless HTTP REST
- **No collaboration extensions** in the TipTap editor (no `@tiptap/extension-collaboration`, no Yjs, no awareness/presence)
- **No ACL model** — every notebook belongs to exactly one user; there is no concept of shared access

### 2.2 Goals

| # | Goal | Priority |
|---|------|----------|
| G1 | Multiple users can simultaneously edit the same Markdown file with sub-second latency | Must-have |
| G2 | Live presence indicators (cursors, selections, user avatars) | Must-have |
| G3 | Conflict-free concurrent editing (no "merge conflict" dialogs) | Must-have |
| G4 | Share a notebook via email invite or shareable link (public or private) | Must-have |
| G5 | Granular permissions: Owner / Editor / Viewer | Must-have |
| G6 | Anonymous view-only access via public links | Must-have |
| G7 | Offline editing with automatic sync on reconnect | Should-have |
| G8 | Version history / undo across sessions | Should-have |
| G9 | Preserve zero-knowledge story for users who don't use co-authoring | Must-have |
| G10 | Entitlements scaffolding for freemium-to-paid evolution | Must-have |

### 2.3 Non-Goals (V1)

The following are explicitly **out of scope** for the initial release:

1. Real-time collaboration for BYO-source notebooks (GitHub/OneDrive/Google Drive) — these remain single-author
2. Google Docs parity features: suggesting mode, comment threads, track changes
3. End-user-managed encryption keys (BYOK)
4. Sync/publish from Cloud notebooks to GitHub or other providers
5. Data residency selection (US-only for V1; regional support is a future app-wide initiative)
6. Link expiration settings (all links are permanent until revoked in V1)
7. Per-file sharing within a notebook (sharing is notebook-level in V1)
8. Hard quota enforcement (soft warnings only in V1)

---

## 3. Decisions Captured

The following decisions were confirmed by the product owner during the Codex review rounds and are treated as **requirements** unless superseded.

### 3.1 Round 1 Decisions

| # | Decision | Detail |
|---|----------|--------|
| D1 | **Free tier at launch** | Cloud collaboration available on free tier. Future monetization via Teams/Enterprise controls. |
| D2 | **BYO notebooks stay single-author** | No collaboration features on GitHub/OneDrive/Google Drive notebooks in V1. |
| D3 | **Roles: Owner / Editor / Viewer** | No Commenter role in V1. |
| D4 | **Link sharing in scope** | Users can share via link with public/private toggle. Good CTA opportunity for signups. |
| D5 | **Data residency: US-first** | Future data residency is an app-wide initiative, not co-auth-specific. |
| D6 | **Platform-managed encryption keys** | BYOK documented as future Teams/Enterprise capability. |
| D7 | **Max 5 MB per Markdown document** | Consider gzip compression at rest. Large binary assets handled separately. |
| D8 | **GitHub co-authoring deferred** | Too complex for V1. Future path: Cloud notebook → sync/publish to GitHub. |
| D9 | **Concurrent editors: 20–50 per document** | 100+ viewers. Configurable cap, tuned via load testing. |
| D10 | **Source type name: "Cloud"** | |

### 3.2 Round 2 Decisions

| # | Decision | Detail |
|---|----------|--------|
| D11 | **Anonymous public link viewing** | Non-authenticated users can view (not edit) via public links. |
| D12 | **Default link visibility: private** | Easy toggle to switch to public. |
| D13 | **Revocable links** | Single "unshare" action. Account-level Sharing management page required. |
| D14 | **Link expiration deferred** | Not in V1. |
| D15 | **Free tier limits** | 3 Cloud notebooks, 500 MB total Cloud storage per user. |
| D16 | **Entitlements-based enforcement** | Centralized entitlements system governs all limits. Build scaffolding now, enforce later. |

### 3.3 Round 3 Decisions

| # | Decision | Detail |
|---|----------|--------|
| D17 | **Quota = uncompressed size** | Predictable for users. |
| D18 | **Quota includes snapshots/versions** | Total size, including version history. Free tier cap can be raised if limiting. |
| D19 | **Public links non-indexable** | `noindex` directives, not listed in sitemaps, secret-URL style. |
| D20 | **Soft quota warnings only in V1** | Banner at 90% usage, exceeded banner at 100%. No write-blocking. Hard enforcement behind feature flag for future. |

---

## 4. Strategic Impact: "You Choose Where Content Lives"

### 4.1 The Current Promise

Notebook.md's brand identity is built on three pillars:

1. **"Your Markdown notebooks, everywhere."** (tagline)
2. **"Your documents are yours. We don't store your content — it lives in your GitHub repos, OneDrive folders, or Google Drive."** (About page)
3. **"We never read, store, or process the content of your Markdown files."** (Privacy Policy §3)

These claims are accurate today. Every file operation proxies through our API to the user's own storage provider. Our database holds only account metadata and notebook configuration (source type, root path, etc.).

### 4.2 Why Co-Authoring Requires Server-Side Storage

Real-time co-authoring cannot be achieved by proxying to external providers because:

| Constraint | Why it matters |
|-----------|---------------|
| **Latency** | GitHub's Contents API, OneDrive, and Google Drive have 200–2000ms round-trip times. Co-editing requires <50ms update propagation. |
| **Concurrency** | These APIs are last-write-wins. Two users saving simultaneously would overwrite each other. CRDTs solve this, but need a shared state server. |
| **ACLs** | Granting User B access to User A's GitHub repo or OneDrive folder requires external admin actions, OAuth scope escalation, and creates security surface area we can't control. |
| **Presence** | External APIs have no concept of "who else is looking at this file right now." |
| **Webhook latency** | Even with webhooks, polling-based sync can't achieve the <100ms update frequency needed for character-by-character co-editing. |

**Conclusion:** Co-authored documents must have a collaboration layer that is hosted on our infrastructure, at least during active editing sessions, and likely at rest for shared documents.

### 4.3 Recommended Strategy: "Cloud" Storage Mode

Introduce a new source type — **`cloud`** — alongside existing GitHub, OneDrive, and Google Drive sources. The messaging shifts from "we never store content" to **"You choose where your notebook data is stored."**

**Key principles:**

1. **Opt-in only.** Users who never use co-authoring never have documents stored on our servers. The existing bring-your-own-storage model remains the default and continues working exactly as it does today.

2. **Clearly differentiated.** Cloud notebooks are visually distinct in the UI (badge, icon, or color). The storage mode is explicit at notebook creation time and in settings. Users always know where their content lives.

3. **Exportable at any time.** Users can export a Cloud notebook to any supported external provider (or download as a .zip of Markdown files) at any time. No lock-in.

4. **Encrypted at rest.** All Cloud-stored document content is encrypted at rest (AES-256) with platform-managed keys. BYOK is a documented future capability for Teams/Enterprise tiers.

5. **Data residency transparency.** The privacy policy and About page will state exactly where Cloud notebook data is stored (US-based Azure region for V1). Regional selection is a future app-wide initiative.

6. **Quota-governed.** Free tier: 3 Cloud notebooks, 500 MB total storage (uncompressed, including version history). Governed by an entitlements system (§8).

### 4.4 What Changes and What Doesn't

| Aspect | Before | After |
|--------|--------|-------|
| Default storage | External (GitHub/OneDrive/Google Drive) | External (unchanged — still the default) |
| Co-auth storage | N/A | Cloud (new) |
| Content on our servers | Never | Only for Cloud notebooks, encrypted at rest |
| External-source notebooks | Proxy only, content never stored | Unchanged — still proxy only, single-author |
| Privacy policy | "We never store your content" | "You choose where your content lives. Cloud notebooks are encrypted and stored by Notebook.md." |

---

## 5. Editor & Canvas Evaluation

### 5.1 Current State

Notebook.md uses **TipTap 2** (built on ProseMirror) with a rich extension set:

- StarterKit, tables (resizable), task lists, code blocks (Lowlight syntax highlighting), images, links, KaTeX math, custom callout blocks
- Three view modes: WYSIWYG, Source (raw Markdown), and Split (synced side-by-side)
- DOMPurify sanitization, drag-and-drop media, slash commands, context menus
- Content serialized as HTML internally; Markdown conversion via Turndown/marked
- No collaboration extensions installed

### 5.2 Options Evaluated

#### Option A: TipTap + Yjs (via Collaboration Extension) — **Recommended**

TipTap has first-party collaboration support via `@tiptap/extension-collaboration` and `@tiptap/extension-collaboration-cursor`, backed by Yjs CRDTs.

| Pros | Cons |
|------|------|
| **Native integration** — TipTap's collaboration extension is purpose-built; no editor swap needed | Adds Yjs dependency and WebSocket infrastructure |
| **Preserve all existing work** — all custom extensions, slash commands, callouts, code blocks, image handling continue working | Undo/redo changes behavior (must switch to Yjs-based undo to be collaboration-aware) |
| **Large ecosystem** — Yjs has providers for WebSocket, WebRTC, IndexedDB; well-documented | Source/Split view modes need careful handling (Markdown ↔ HTML sync with CRDT state) |
| **Self-hostable** — HocusPocus (MIT-licensed) is the production-ready Yjs WebSocket backend; no SaaS dependency | HocusPocus is maintained by TipTap team; coupling risk if they change direction |
| **Presence/awareness** built in — user cursors, selections, names, colors out of the box | |
| **Proven at scale** — used in production by many collaborative editors | |
| **Zero cost** — all components are MIT-licensed; no per-seat or per-document fees | |
| **Incremental adoption** — can be added as extensions to the existing editor without rewriting | |
| **Save flow redesign** — must move from debounced full-doc writes to CRDT update stream + snapshot compaction | Must redesign save flow |

**Estimated effort:** Medium. Add 3 npm packages, configure WebSocket provider, add HocusPocus server, modify undo/redo behavior, add presence UI components.

#### Option B: Microsoft Fluid Framework

Fluid Framework (used in Microsoft Loop) is an open-source CRDT platform with Azure Fluid Relay as a managed backend.

| Pros | Cons |
|------|------|
| Enterprise-grade, Microsoft-backed | **Requires replacing TipTap/ProseMirror entirely** — Fluid has its own document model (SharedString, SharedMap) incompatible with ProseMirror's node tree |
| Azure Fluid Relay is a managed service (less ops) | Tight coupling to Azure ecosystem; managed service costs scale per-connection |
| Strong for structured data collaboration | **Poor fit for rich-text editing** — Fluid is designed for structured data types, not rich-text editor DOMs. Building a ProseMirror-quality editor on Fluid would be a multi-month effort |
| | Would lose ALL existing TipTap extensions, custom components, and editor UX |
| | Much smaller open-source community for text editing use cases |
| | Double infrastructure cost (Fluid Relay + existing Azure setup) |

**Verdict:** Not recommended. The cost of replacing the entire editor stack is prohibitive, and Fluid's strengths (structured data sync) don't align with our rich-text editing needs. Fluid would be a better choice if we were building a spreadsheet or database-like collaborative tool.

#### Option C: Automerge

Automerge is a CRDT library focused on decentralized, offline-first collaboration with strong change attribution.

| Pros | Cons |
|------|------|
| Excellent audit trail / change history | Significantly slower than Yjs on large documents (benchmarks show 10–100× slower merges) |
| True peer-to-peer capable | No first-party TipTap integration — would need a custom ProseMirror binding |
| Good for offline-first / decentralized | Smaller ecosystem; fewer production deployments for rich-text |
| JSON-friendly data model | Memory overhead for large collaborative sessions |

**Verdict:** Interesting for future exploration (especially if P2P becomes a goal), but not practical for V1 given the lack of TipTap integration and performance concerns.

#### Option D: Build a Custom Editor

| Pros | Cons |
|------|------|
| Total control over collaboration semantics | **Enormous effort** — years of work to match ProseMirror/TipTap quality |
| No third-party dependency risk | Would need to reimplement: tables, code blocks, math, images, callouts, drag-and-drop, slash commands, etc. |
| | No ecosystem of plugins or extensions |
| | Ongoing maintenance burden for baseline editor functionality |

**Verdict:** Strongly not recommended. The editor is a solved problem; building one from scratch is not a competitive advantage for Notebook.md.

#### Option E: Replace TipTap with Another Collaborative Editor (e.g., Lexical, Slate)

| Pros | Cons |
|------|------|
| Lexical (Meta) has built-in collaboration via Yjs | Would require rewriting ALL custom extensions (callouts, code blocks, image handling, slash commands) |
| Slate is flexible and extensible | Loses TipTap's mature plugin ecosystem |
| | Significant regression risk during migration |
| | Lexical's Markdown support is less mature than TipTap's |

**Verdict:** Not justified. TipTap already supports Yjs collaboration natively. Switching editors solely for collaboration that TipTap already provides gains nothing and costs everything.

### 5.3 Editor Recommendation

**Use TipTap + Yjs (Option A).** It is the clear winner — both this document and the Codex review independently reached the same conclusion:

- Preserves the entire existing editor investment
- Adds collaboration incrementally via extensions
- Uses the fastest CRDT library (Yjs) with the most editor integrations
- Self-hostable backend (HocusPocus) with no licensing costs
- First-party support from the TipTap team

### 5.4 Source View & Split View Considerations

Co-authoring in Source (raw Markdown) and Split view modes presents challenges:

- The Yjs collaboration extension operates on ProseMirror's document tree (WYSIWYG), not on raw Markdown text
- If two users are in different view modes, changes from the Source-view user need to be parsed into ProseMirror operations, and vice versa

**Recommended approach:**
- V1: Co-authoring is available **only in WYSIWYG mode**. Source and Split views are read-only when a collaborative session is active, with a banner explaining why.
- V2: Evaluate adding a secondary Yjs text type for the Markdown source, synced bidirectionally with the ProseMirror document. This is complex but feasible.

---

## 6. Collaboration Technology Evaluation

### 6.1 CRDT Layer: Yjs

**Recommendation:** Yjs (v13+)

| Criterion | Yjs |
|-----------|-----|
| Performance | Best-in-class among JS CRDTs; sub-millisecond local apply times |
| Update size | Smallest binary wire format; efficient on mobile/low-bandwidth |
| Offline support | Built-in; merge on reconnect via CRDT properties |
| Editor bindings | First-party ProseMirror/TipTap binding (`y-prosemirror`) |
| Awareness protocol | Built-in; cursor position, user info, selection state |
| Persistence | Pluggable; can snapshot Y.Doc to binary and store anywhere |
| Maturity | 7+ years of production use; large community |

### 6.2 WebSocket Backend: HocusPocus (Self-Hosted)

**Recommendation:** Self-hosted HocusPocus server (MIT license)

HocusPocus is the canonical Yjs WebSocket backend, built by the TipTap team:

- **Document sync:** Relays Yjs updates between connected clients
- **Persistence hooks:** `onStoreDocument` / `onLoadDocument` — plug in any storage backend (PostgreSQL, S3, Redis)
- **Authentication hooks:** `onAuthenticate` — validate JWT or session token before granting document access
- **Awareness:** Broadcasts cursor/selection state to all participants
- **Debounced persistence:** Configurable debounce (e.g., 5 seconds) to avoid writing on every keystroke
- **Scaling:** Supports Redis pub/sub for multi-instance deployments
- **TypeScript native:** Fits our existing stack perfectly

**Deployment model:** Run HocusPocus as a sidecar or separate Azure Container App alongside the existing API. Both share the same PostgreSQL database and Redis instance.

**Why not a managed service (TipTap Cloud, Liveblocks)?**
- Cost: $149–$999/month+ with per-document quotas
- Data sovereignty: Documents would pass through third-party infrastructure
- Lock-in: Proprietary backend with potential feature gating
- Self-hosting is straightforward given our existing Azure Container Apps + Redis infrastructure
- **Contingency:** If team capacity for running real-time infrastructure proves limited, Liveblocks is a reasonable managed fallback to evaluate

### 6.3 Alternative: Azure Fluid Relay

Not recommended for reasons stated in §5.2 (Option B). Additionally:
- Fluid Relay is a managed service with per-connection pricing that could become expensive
- Requires its own SDK and document model, incompatible with Yjs/ProseMirror
- Would add a second real-time infrastructure alongside our existing stack

---

## 7. Application Layer & Data Storage

### 7.1 Current Stack Assessment

| Component | Current | Co-Auth Needs | Verdict |
|-----------|---------|---------------|---------|
| **API** | Express 5, TypeScript, stateless REST | Need WebSocket support for real-time sync | **Keep Express** — HocusPocus runs as a separate process; no need to add WebSocket to Express itself |
| **Database** | PostgreSQL 16 | Need to store: document content, collaboration metadata, sharing/ACL records, Y.Doc snapshots | **Keep PostgreSQL** — add new tables for Cloud notebooks and sharing |
| **Cache** | Redis 7 (rate limiting only) | Need Redis pub/sub for multi-instance HocusPocus sync; presence state | **Expand Redis usage** — add pub/sub channels for collab sync |
| **Auth** | JWT refresh tokens, session cookies | Need to authenticate WebSocket connections; need sharing/invite tokens | **Extend existing auth** — add WebSocket token validation |
| **Frontend** | React 19, Vite, TipTap | Need collaboration extensions, presence UI, sharing UI | **Keep stack** — add TipTap collab extensions |
| **Storage** | IndexedDB (client), PostgreSQL (metadata), external providers (content) | Need server-side document content storage for Cloud notebooks | **Add document storage** — see §7.2 |
| **Infra** | Azure Container Apps, Front Door | Need a new container for HocusPocus; WebSocket routing through Front Door | **Extend infra** — add HocusPocus container; configure WebSocket upgrade in Front Door |

**Verdict: No stack changes required.** The existing technology choices are well-suited. We add components (HocusPocus, new DB tables, Redis pub/sub) rather than replacing anything.

### 7.2 New Database Schema (Cloud Notebooks)

```sql
-- Cloud-stored document content (only for 'cloud' source type)
CREATE TABLE cloud_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    path TEXT NOT NULL,                    -- e.g., "notes/meeting-2026-02-23.md"
    content_enc BYTEA,                     -- AES-256 encrypted Markdown content
    ydoc_state BYTEA,                      -- Yjs Y.Doc binary snapshot (for resuming collab sessions)
    content_hash TEXT,                     -- SHA-256 of plaintext content (for change detection)
    size_bytes INTEGER DEFAULT 0,          -- uncompressed size (used for quota accounting)
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(notebook_id, path)
);

-- Sharing & ACLs
CREATE TABLE notebook_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES users(id),
    shared_with_user_id UUID REFERENCES users(id),     -- NULL if invite is pending
    shared_with_email TEXT,                              -- email for pending invites
    permission TEXT NOT NULL CHECK (permission IN ('viewer', 'editor')),
    invite_token TEXT UNIQUE,                            -- one-time token for accepting invite
    invite_expires_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

-- Public share links (separate from user-targeted shares)
CREATE TABLE notebook_public_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    link_token TEXT UNIQUE NOT NULL,       -- secret URL token
    permission TEXT NOT NULL DEFAULT 'viewer' CHECK (permission IN ('viewer')),
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

-- Collaboration sessions (active editing)
CREATE TABLE collab_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES cloud_documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    connected_at TIMESTAMPTZ DEFAULT now(),
    disconnected_at TIMESTAMPTZ,
    client_info JSONB                      -- browser, device, etc.
);

-- Document version history
CREATE TABLE document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES cloud_documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content_enc BYTEA NOT NULL,            -- encrypted snapshot
    ydoc_state BYTEA,                      -- Yjs state at this version
    size_bytes INTEGER DEFAULT 0,          -- uncompressed size (counts toward quota)
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    change_summary TEXT,                   -- auto-generated or user-provided
    UNIQUE(document_id, version_number)
);

-- Plans & Entitlements (see §8 for details)
CREATE TABLE plans (
    id TEXT PRIMARY KEY,                   -- 'free', 'pro', 'team', 'enterprise'
    name TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,      -- 'free' is default for all users
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE plan_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id TEXT NOT NULL REFERENCES plans(id),
    entitlement_key TEXT NOT NULL,         -- e.g., 'max_cloud_notebooks', 'max_storage_bytes', 'max_doc_size_bytes'
    entitlement_value TEXT NOT NULL,       -- string representation of limit value
    UNIQUE(plan_id, entitlement_key)
);

CREATE TABLE user_plan_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    plan_id TEXT NOT NULL REFERENCES plans(id),
    started_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,               -- NULL = no expiration
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id)                        -- one active plan per user
);

CREATE TABLE user_usage_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    counter_key TEXT NOT NULL,             -- 'cloud_notebook_count', 'cloud_storage_bytes'
    counter_value BIGINT DEFAULT 0,
    last_reconciled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, counter_key)
);

-- Indexes
CREATE INDEX idx_cloud_docs_notebook ON cloud_documents(notebook_id);
CREATE INDEX idx_shares_notebook ON notebook_shares(notebook_id);
CREATE INDEX idx_shares_user ON notebook_shares(shared_with_user_id);
CREATE INDEX idx_shares_email ON notebook_shares(shared_with_email);
CREATE INDEX idx_shares_token ON notebook_shares(invite_token);
CREATE INDEX idx_public_links_token ON notebook_public_links(link_token);
CREATE INDEX idx_public_links_notebook ON notebook_public_links(notebook_id);
CREATE INDEX idx_collab_sessions_doc ON collab_sessions(document_id);
CREATE INDEX idx_doc_versions ON document_versions(document_id, version_number);
CREATE INDEX idx_user_usage ON user_usage_counters(user_id, counter_key);
```

### 7.3 Cloud Document Storage Adapter

Implement a new `CloudAdapter` that conforms to the existing `SourceAdapter` interface:

```typescript
// apps/api/src/services/sources/cloud.ts
class CloudAdapter implements SourceAdapter {
    // Instead of calling external APIs, reads/writes to cloud_documents table
    async listFiles(userId, rootPath, dirPath): Promise<FileEntry[]>
    async readFile(userId, filePath): Promise<FileContent>
    async writeFile(userId, filePath, content): Promise<void>
    async createFile(userId, filePath, content): Promise<void>
    async deleteFile(userId, filePath): Promise<void>
    async renameFile(userId, oldPath, newPath): Promise<void>
}
```

This adapter integrates cleanly with the existing `getAdapter(sourceType)` registry pattern. The API routes in `sources.ts` will work without modification — they already resolve the adapter dynamically based on `source_type`.

### 7.4 HocusPocus Server Configuration

```typescript
// apps/collab/src/server.ts (new workspace: apps/collab)
import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { Redis } from '@hocuspocus/extension-redis';

const server = new Server({
    port: 3002,
    debounce: 5000,          // persist after 5s of inactivity
    maxDebounce: 30000,      // force persist after 30s regardless

    async onAuthenticate({ token, documentName }) {
        // Validate JWT/session token
        // Check notebook_shares for permission
        // Return user context (id, name, color)
    },

    async onLoadDocument({ documentName }) {
        // Load ydoc_state from cloud_documents
        // documentName format: "notebook:{notebookId}/file:{filePath}"
    },

    extensions: [
        new Database({
            async fetch({ documentName }) { /* load from PostgreSQL */ },
            async store({ documentName, state }) { /* save to PostgreSQL */ },
        }),
        new Redis({
            host: process.env.REDIS_HOST,
            port: 6379,
            // Enables multi-instance sync
        }),
    ],
});
```

### 7.5 Save/Sync Model

The save model fundamentally changes for Cloud notebooks:

- **Before (BYO storage):** Debounced full-document write to external provider API
- **After (Cloud):** CRDT update stream via Yjs + periodic snapshot compaction

Key requirements:
- Keep periodic Markdown snapshot generation for: export, search/indexing, backup/restore, and compatibility with the Markdown-first product promise
- The canonical document format stored at rest is **Markdown** (not HTML), ensuring portability and alignment with the product identity. Yjs binary state is stored alongside for resuming collaborative sessions without re-parsing.
- HocusPocus debounces persistence (5s default, 30s max) to avoid writing on every keystroke

### 7.6 Document Size & Storage Limits

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max document size | 5 MB (uncompressed plaintext) | Enforced via entitlements; future plans may adjust. Large binary assets stored as separate objects/URLs. |
| Max Cloud notebooks per user (free) | 3 | Per decision D15. |
| Max total storage per user (free) | 500 MB (uncompressed, including versions) | Per decision D15. Quota measured from uncompressed size for predictability (D17). |
| Max concurrent editors per document | 25 (configurable, tuned via load testing) | Target 20–50; stretch to 50 under load (D9). |
| Max concurrent viewers per document | 100+ | Lightweight presence updates only. |
| Version history retention | 90 days or 100 versions | Whichever comes first. Version storage counts toward quota (D18). |

Consider gzip compression of Markdown content at rest to reduce actual storage costs, while continuing to measure quota against uncompressed size.

---

## 8. Entitlements, Plans & Quotas

This section captures the backend scaffolding needed to support freemium-to-paid evolution, per decision D16.

### 8.1 Design Principles

- **Build backend now, no paid UI language at launch.** The entitlements system exists in the backend and governs limits, but the app does not surface "upgrade" flows or pricing tiers in V1.
- **Single policy gate.** All limit checks (notebook count, storage, doc size) go through one entitlements service. No hard-coded limits scattered across the codebase.
- **Additive.** The entitlements system must not affect existing BYO-storage notebooks, which have no quotas.

### 8.2 Plan Structure

| Plan | Cloud Notebooks | Total Storage | Max Doc Size | Notes |
|------|----------------|---------------|--------------|-------|
| `free` (default) | 3 | 500 MB | 5 MB | All users start here |
| `pro` (future) | TBD | TBD | TBD | Individual power users |
| `team` (future) | TBD | TBD | TBD | Team sharing controls |
| `enterprise` (future) | TBD | TBD | TBD | BYOK, data residency, SSO |

### 8.3 Entitlements Service

```typescript
// apps/api/src/services/entitlements.ts
interface EntitlementsService {
    // Check if a user can perform an action
    canCreateCloudNotebook(userId: string): Promise<{ allowed: boolean; reason?: string; current: number; limit: number }>;
    canWriteDocument(userId: string, additionalBytes: number): Promise<{ allowed: boolean; reason?: string; currentBytes: number; limitBytes: number }>;
    getUsageSummary(userId: string): Promise<{ cloudNotebooks: number; storageBytes: number; limits: PlanLimits }>;
}
```

### 8.4 Quota Accounting

- Track `cloud_notebook_count` and `cloud_storage_bytes` per user in `user_usage_counters`
- Counters updated on document create/update/delete and version snapshot creation
- **Reconciliation job:** Periodic background task recalculates actual usage from `cloud_documents` and `document_versions` tables to repair counter drift
- Server-side is the authoritative source of truth for all quota calculations (not client-calculated)

### 8.5 Quota Warning UX (V1)

Per decisions D20:

- **≥ 90% usage:** Warning banner in the app (similar to existing demo mode banner). Text: "You're approaching your Cloud storage limit. [X MB] of [500 MB] used."
- **≥ 100% usage:** Exceeded banner. Text: "You've exceeded your Cloud storage limit. You can continue editing for now, but please free up space by deleting files or notebooks."
- **No write-blocking in V1.** Hard enforcement is behind a feature flag for future release.
- **Future:** Banner includes "Upgrade to Pro" link once paid tiers exist.

### 8.6 Limit Enforcement Behavior

- **Notebook count limit reached:** Block creation of new Cloud notebooks. Return structured error with current count, limit, and user-facing reason.
- **Storage exceeded (future hard mode):** Block writes/uploads that increase storage. Allow read/export/delete to recover.
- All limit denials include: user-facing reason, current usage, limit value.

---

## 9. Proposed Architecture

### 9.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                            │
│                                                                     │
│  ┌──────────────┐   ┌──────────────────┐   ┌───────────────────┐   │
│  │  TipTap +    │   │  HocusPocus      │   │  REST Client      │   │
│  │  Yjs Collab  │◄──│  Provider (WS)   │   │  (existing)       │   │
│  │  Extensions  │   │  + Awareness     │   │                   │   │
│  └──────────────┘   └────────┬─────────┘   └────────┬──────────┘   │
│                              │ WebSocket             │ HTTPS        │
└──────────────────────────────┼───────────────────────┼──────────────┘
                               │                       │
                    ┌──────────▼──────────┐  ┌────────▼──────────┐
                    │   HocusPocus        │  │   Express API      │
                    │   Server (:3002)    │  │   Server (:3001)   │
                    │                     │  │                    │
                    │  • Auth hooks       │  │  • REST endpoints  │
                    │  • Doc load/save    │  │  • Source adapters  │
                    │  • Presence relay   │  │  • Sharing/invite  │
                    │  • Yjs sync         │  │  • Notebook CRUD   │
                    └────────┬────────────┘  └────────┬──────────┘
                             │                        │
                    ┌────────▼────────────────────────▼──────────┐
                    │              PostgreSQL 16                  │
                    │                                             │
                    │  users, notebooks, identity_links,         │
                    │  cloud_documents, notebook_shares,          │
                    │  collab_sessions, document_versions         │
                    └────────────────────┬───────────────────────┘
                                        │
                    ┌───────────────────▼───────────────────────┐
                    │              Redis 7                       │
                    │                                            │
                    │  • Rate limiting (existing)                │
                    │  • HocusPocus pub/sub (multi-instance)     │
                    │  • Presence/awareness state                │
                    └────────────────────────────────────────────┘
```

### 9.2 Request Flow: Opening a Shared Document

1. User B receives invite link → clicks → lands on Notebook.md → accepts invite (creates `notebook_shares` record)
2. User B opens the shared notebook → UI shows it in sidebar with "Shared with me" section
3. User B opens a file → client establishes WebSocket to HocusPocus with auth token
4. HocusPocus `onAuthenticate` validates token, checks `notebook_shares` for permission
5. HocusPocus `onLoadDocument` loads `ydoc_state` from `cloud_documents`
6. Y.Doc state is synced to client → TipTap renders the document
7. User B types → Yjs encodes change → WebSocket sends to HocusPocus → broadcasts to all connected clients
8. HocusPocus debounces writes → persists updated `ydoc_state` and decrypted→re-encrypted content to `cloud_documents`

### 9.3 Request Flow: Anonymous Public Link Viewing

1. Anonymous user receives public link → clicks → lands on Notebook.md
2. Server validates `link_token` against `notebook_public_links`, checks `is_active`
3. Document content is loaded and rendered in a **read-only** editor view
4. Page includes `<meta name="robots" content="noindex, nofollow">` — not discoverable via search engines
5. No user session required; no editing capabilities exposed
6. CTA banner: "Sign up to create and collaborate on your own notebooks"

### 9.4 Infrastructure Changes

| Component | Change |
|-----------|--------|
| **Azure Container Apps** | Add `collab` container (HocusPocus server) with WebSocket support enabled |
| **Azure Front Door** | Add WebSocket upgrade routing rule for `wss://api.notebookmd.io/collab` (path-based, per D21) |
| **Redis** | Enable pub/sub (already available; just use additional channels) |
| **PostgreSQL** | Add migration for new tables (§7.2) |
| **Docker Compose (dev)** | Add HocusPocus service |
| **CI/CD** | Add build job for `apps/collab` workspace |

### 9.5 Performance Target

- **SLO:** p95 local edit propagation < 250ms for active collaborative sessions under target load
- Validate via load testing before GA; tune concurrent editor caps based on observed latency and error rates

---

## 10. Co-Authoring User Experience

### 10.1 Creating a Cloud Notebook

- When creating a new notebook, user sees source options: **GitHub**, **OneDrive**, **Google Drive**, **Cloud** (new)
- Selecting Cloud requires no external account linking — it just works
- Cloud notebooks display a distinct icon (☁️ or similar) in the sidebar
- Users must understand the tradeoff before choosing: BYO mode = external ACL complexity, no native co-authoring; Cloud mode = centralized storage + native sharing + live collaboration
- If the user has reached their Cloud notebook limit (3 for free tier), creation is blocked with a clear message showing current count and limit

### 10.2 Sharing a Notebook

- Owner clicks "Share" button → modal shows:
  - **Link sharing** section:
    - Generate a shareable URL with embedded token
    - **"Copy link" button** that copies the link to clipboard for direct sharing via any channel (per D23)
    - Toggle: **Private** (default) or **Public** — easy to switch
    - Private links require the recipient to have a Notebook.md account and accept the invite
    - Public links allow anonymous view-only access (no account required)
    - "Unshare" button to revoke the link instantly (generates new token, old URL stops working)
  - **Invite by email** section:
    - Enter email address + permission level (Editor or Viewer)
    - Sends email with accept link
  - **Current collaborators** list:
    - Shows each collaborator with their permission level
    - Owner can change permission or revoke access
- Invited user receives email or link → signs in (or creates account) → notebook appears in their sidebar under "Shared with me"

### 10.3 Sharing Management Page

Per decision D13, the account settings must include a **Sharing** management area where users can:

- List all notebooks they've shared (with collaborator count and link status)
- See current link visibility (private/public) for each shared notebook
- Revoke ("unshare") links with one click
- Review collaborators and their access levels
- See notebooks shared with them by others

### 10.4 Real-Time Editing

- When a shared document is opened and other users are connected:
  - **Collaborator avatars** appear in the top bar (similar to Google Docs)
  - **Live cursors** with user name labels appear in the editor, color-coded per user
  - **Selections** are highlighted with the user's color
  - Changes appear in real-time (character by character)
- **Offline behavior:** If a user loses connection, they can continue editing. On reconnect, Yjs merges changes automatically. A toast notification confirms "Changes synced."

### 10.5 View Mode Restrictions (V1)

- Co-authoring is supported in **WYSIWYG mode only** (V1)
- Source and Split views show a banner: "Switch to visual editing mode to collaborate in real-time" with a button to switch
- Individual (non-shared) editing in Source/Split mode remains unchanged

### 10.6 Presence & Awareness

- Sidebar shows who's currently viewing/editing each file
- File list shows presence dots (green = active, yellow = idle) per file
- Maximum 25 concurrent editors per document (configurable); additional users enter read-only mode with a notification
- 100+ concurrent viewers supported with lightweight presence

### 10.7 Mobile Experience (V1)

Per decision D25, mobile devices show a **read-only view** of co-authored documents in V1:
- Document content renders normally but editing is disabled
- Banner: "Co-editing is available on desktop. You're viewing a read-only version."
- Presence indicators are visible (see who else is editing)
- Full mobile co-editing is a deferred item

### 10.8 Cross-Source Drag-to-Copy

Per decision D26, users can **drag files from any notebook source into a Cloud notebook** via the sidebar tree:
- Dragging a file from a GitHub/OneDrive/Google Drive/local notebook into a Cloud notebook copies the file content to Cloud storage
- This extends the existing drag-to-copy functionality that works within local notebooks
- Provides a natural "promote to Cloud" path without a dedicated button
- If implementation proves complex (especially cross-provider content fetching during drag), defer to a fast-follow

---

## 11. Access Control & Sharing Model

### 11.1 Permission Levels

| Level | Can View | Can Edit | Can Share | Can Delete | Can Manage Collaborators |
|-------|----------|----------|-----------|------------|--------------------------|
| **Owner** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Editor** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Viewer** | ✅ | ❌ | ❌ | ❌ | ❌ |

### 11.2 Sharing Scope

- V1: Sharing is at the **notebook level** (all files in a notebook are shared with the same permissions)
- Future: Per-file sharing within a notebook

### 11.3 Invite Flow

1. Owner enters collaborator's email + permission level
2. System creates `notebook_shares` record with `invite_token`
3. If collaborator has a Notebook.md account: notification + email
4. If collaborator doesn't have an account: email with invite link → account creation → auto-accept
5. Invite tokens expire after 7 days
6. Owner can revoke access at any time (immediate disconnect from any active session)

### 11.4 Public Link Access

Per decisions D11 and D19:

- Public links allow **anonymous view-only access** — no authentication required
- Public link pages include `<meta name="robots" content="noindex, nofollow">` and are excluded from sitemaps
- Public link URLs use a cryptographically random token (secret-URL style; not guessable)
- CTA on public link pages encourages sign-up: "Create your own notebooks" / "Sign up to edit"
- Owner can revoke a public link at any time; old URL immediately stops working

### 11.5 External-Source Notebooks

Sharing is **only available for Cloud notebooks** (V1). External-source notebooks (GitHub, OneDrive, Google Drive) cannot be shared through Notebook.md because:
- We don't control access to the underlying storage
- Sharing should be done through the storage provider's native sharing mechanisms
- This keeps the separation of concerns clean
- Real-time co-authoring on external sources would require proxying sub-second updates through provider APIs with 200–2000ms latency — not feasible

Future consideration: "Cloud notebook → sync/publish to GitHub" path, rather than direct multi-user GitHub-native co-authoring (per decision D8).

---

## 12. Messaging & Marketing Updates

### 12.1 Core Message Evolution

The product's identity evolves from "we never store your content" to **"You choose where your notebook data is stored."** This is not an apology — it's an enhancement. The Codex review independently arrived at the same framing.

#### Current Messaging → Proposed Updates

**Tagline:**
- Current: *"Your Markdown notebooks, everywhere."*
- **Keep unchanged.** This tagline doesn't make storage claims and remains accurate.

**About Page — Philosophy:**
- Current: *"Your documents are yours. We don't store your content — it lives in your GitHub repos, OneDrive folders, or Google Drive. Notebook.md is a window into your files, not a walled garden."*
- Proposed: *"Your documents are yours — always. Connect your GitHub repos, OneDrive folders, or Google Drive, and Notebook.md works as a window into your files. When you're ready to collaborate in real-time, Cloud notebooks give you a shared workspace with the same ownership guarantees: your content is encrypted, exportable, and deletable at any time. No lock-in, no walled garden."*

**Features Page — "Your Storage, Your Data":**
- Current: *"Connect GitHub repos, OneDrive folders, or Google Drive — your documents stay in your cloud storage. We never store your content."*
- Proposed: *"You choose where your content lives. Connect your cloud providers — or use Cloud notebooks for real-time collaboration with encrypted storage you control. Export or delete anytime."*

**Privacy Policy — §3 "Data We Do NOT Collect":**
- Current: *"Your document content — We never read, store, or process the content of your Markdown files."*
- Proposed: *"For external-source notebooks (GitHub, OneDrive, Google Drive): We never read, store, or process the content of your Markdown files. Document content passes through our server only as a proxy and is not logged or stored. For Cloud notebooks: Your content is stored encrypted (AES-256) on our servers to enable real-time collaboration. You can export or permanently delete your Cloud content at any time from your account settings."*

### 12.2 Trust-Preserving Principles for Marketing

1. **Lead with choice:** "You decide where your content lives."
2. **Never hide the storage model:** Cloud storage is always clearly labeled and explained
3. **Emphasize control:** Export, delete, encryption are front and center
4. **Don't apologize:** Storing content for collaboration is normal and expected. Frame it as an enhancement, not a compromise.
5. **Differentiate tiers:** Make it clear that bring-your-own-storage remains the default and is fully supported

### 12.3 Tagline Options (if a refresh is desired)

The current tagline works, but the Codex review proposed alternatives worth considering:

1. **"Your Markdown notebooks, everywhere."** (current — recommended to keep)
2. *"Write together, store your way."* (emphasizes collaboration + choice)
3. *"Bring your own storage — or use Cloud for live collaboration."* (explicit about the modes)

### 12.4 Feature Page Additions

Add a new feature card for co-authoring:

> **Real-Time Co-Authoring**  
> Write together, in real time. Invite collaborators to your Notebook.md Cloud notebooks and edit Markdown side by side — with live cursors, presence indicators, and zero merge conflicts. Your shared content is encrypted at rest and exportable at any time.

Add a comparison table:

> | | Bring Your Own Storage | Cloud |
> |---|---|---|
> | Content stored on | Your GitHub / OneDrive / Google Drive | Notebook.md servers (encrypted) |
> | Real-time co-authoring | ❌ | ✅ |
> | Version history | Via your provider (e.g., Git) | Built-in (90-day retention) |
> | Sharing | Via your provider's sharing | Built-in invite + public links |
> | Offline editing | ✅ | ✅ (with sync on reconnect) |
> | Export | N/A (already external) | Export to any provider or download |
> | Free tier limit | Unlimited | 3 notebooks, 500 MB |

### 12.5 Surfaces to Update

Per the Codex review, the following files need marketing/legal copy updates:

- `README.md`
- `apps/web/src/components/marketing/FeaturesPage.tsx`
- `apps/web/src/components/marketing/AboutPage.tsx`
- `apps/web/src/components/marketing/MarketingLayout.tsx`
- `apps/web/src/components/legal/PrivacyPage.tsx`
- `apps/web/src/components/legal/TermsPage.tsx`
- Any onboarding/demo copy that states "we never store your content"
- i18n translation files (`translation.json`)

---

## 13. Security Considerations

### 13.1 Encryption

- All `cloud_documents.content_enc` is AES-256 encrypted at rest
- Encryption key managed via Azure Key Vault (existing infrastructure)
- Consider per-notebook encryption keys derived from a master key for isolation
- Y.Doc binary state (`ydoc_state`) is also encrypted at rest

### 13.2 WebSocket Security

- WebSocket connections require authentication (JWT or session token passed during handshake)
- HocusPocus `onAuthenticate` hook validates the token and checks `notebook_shares` for authorization
- Connections are terminated immediately when access is revoked
- Rate limiting on WebSocket message frequency to prevent flooding
- Maximum message size limits to prevent memory exhaustion

### 13.3 Invite Token Security

- Invite tokens are cryptographically random (256-bit)
- Tokens are single-use and expire after 7 days
- Accepting an invite requires authentication (prevents anonymous access)
- Invite emails use the same secure transactional email infrastructure as magic links

### 13.4 Data Isolation

- HocusPocus document names encode the notebook ID — authorization is checked on every connection
- Database queries for shared content always include a permission check (no direct document access without a `notebook_shares` record or ownership)
- Cloud document content is never included in API responses for notebook listing (only metadata)

### 13.5 Audit Trail

- Extend the existing `audit_log` table to cover:
  - Sharing actions (invite, accept, revoke)
  - Collaboration sessions (connect, disconnect)
  - Document creation and deletion in Cloud notebooks
  - Export operations

### 13.6 Account Deletion Behavior (Cloud Notebooks)

Per decision D27:
- When a user deletes their account, all owned Cloud notebooks are **hard deleted**
- The account deletion flow must **warn the user** that this will permanently remove shared notebooks and affect collaborators
- Collaborators see the notebook disappear from their "Shared with me" list
- **Deferred:** Ownership transfer to another collaborator, or time-limited archive access for collaborators, to be revisited in future versions

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Brand trust hit** from "we now store content" | Users feel misled; churn | Explicit "storage mode" language everywhere, not hidden in legal docs. Lead with user choice. Update all surfaces before launch (§12.5). |
| **Real-time infra complexity** for small team | Ops burden; reliability risk | Start with constrained V1 (capped concurrency, single region). Evaluate managed fallback (Liveblocks) if self-hosted HocusPocus proves too burdensome. |
| **Markdown fidelity drift** in collaborative editing | Round-trip conversion (Markdown → ProseMirror → Markdown) may alter formatting | Define canonical Markdown serialization tests. Periodic snapshot validation against expected output. Invest in Turndown/marked converter quality. |
| **Multi-tenant security exposure** | Data leaks between users | Strict tenant isolation in all queries. Encryption at rest. ACL enforcement on every operation. Threat model review and penetration testing before beta. |
| **Quota gaming** via version history | Users accumulate versions to inflate usage for competitors, or surprise themselves | Quota includes versions (D18). Version retention policy (90 days / 100 versions). Reconciliation job catches drift. |
| **WebSocket scaling** under load | Latency spikes, dropped connections | Redis pub/sub for multi-instance. Configurable editor cap (25 default). Load test before GA. Horizontal scaling of HocusPocus containers. |

---

## 15. Migration & Rollout Plan

### 15.1 Development Phases

**Phase 1: Foundation**
- Add `apps/collab` workspace with HocusPocus server
- Add database migration for new tables (§7.2): `cloud_documents`, `notebook_shares`, `notebook_public_links`, `collab_sessions`, `document_versions`, `plans`, `plan_entitlements`, `user_plan_subscriptions`, `user_usage_counters`
- Implement `CloudAdapter` conforming to `SourceAdapter` interface
- Implement entitlements service (§8)
- Seed `plans` table with `free` tier and entitlements
- Add Cloud as a notebook source type in the UI

**Phase 2: Real-Time Collaboration**
- Add `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor`, `y-prosemirror`, `yjs` to web app
- Implement HocusPocus provider in the editor
- Add presence/awareness UI (avatars bar, live cursors)
- Modify undo/redo to use Yjs-aware undo manager
- Implement CRDT update stream + snapshot compaction save model

**Phase 3: Sharing & Permissions**
- Implement invite flow (email + link sharing with public/private toggle)
- Build sharing modal UI
- Build account-level Sharing management page
- Add "Shared with me" section to notebook sidebar
- Implement anonymous public link viewing (read-only, noindex)
- Implement access revocation with live session disconnect

**Phase 4: Polish & Launch**
- Version history UI
- Export to external providers
- Quota warning banners (90% / 100%)
- Update all marketing pages, privacy policy, terms, About page, README (§12.5)
- Load testing for concurrent editing (validate p95 < 250ms SLO)
- Security review / penetration testing
- Feature flag rollout: internal → beta → GA

### 15.2 Feature Flags

Use the existing `feature_flags` table to gate rollout:

| Flag | Purpose |
|------|---------|
| `cloud_notebooks` | Enable Cloud as a notebook source type |
| `co_authoring` | Enable real-time collaboration features |
| `public_sharing` | Enable public link sharing |
| `hard_quota_enforcement` | Enable write-blocking at quota limits (future) |

Additional resilience flag: ability to disable real-time collaboration while preserving read/export access in incident scenarios.

### 15.3 Backward Compatibility

- Existing notebooks (GitHub, OneDrive, Google Drive) are completely unaffected
- No schema changes to existing tables
- No changes to existing API routes
- The `CloudAdapter` is additive — it registers alongside existing adapters

---

## 16. Success Metrics

| Category | Metric | Target |
|----------|--------|--------|
| **Activation** | % of users creating at least one Cloud notebook | Track baseline, grow month-over-month |
| **Collaboration usage** | Shared docs per user; concurrent sessions per doc | Increasing engagement |
| **Reliability** | Collaboration session error rate | < 1% |
| **Reliability** | WebSocket reconnect success rate | > 99% |
| **Performance** | p95 edit propagation latency | < 250ms |
| **Trust** | Support tickets about "where is my data stored" | Minimal / decreasing |
| **Growth** | Sign-ups via public link CTAs | Track conversion funnel |

---

## 17. Decisions Captured (Round 4 — Opus Review)

All open questions have been answered. These decisions are now requirements unless superseded.

| # | Decision | Detail |
|---|----------|--------|
| D21 | **WebSocket routing: path-based** | Use `wss://api.notebookmd.io/collab` (path-based on existing API domain). Avoids extra DNS/TLS/CORS. Can migrate to separate subdomain later if scaling demands it. |
| D22 | **Blob storage: defer** | Store documents in PostgreSQL for V1. Future versions should move document/snapshot storage outside PostgreSQL (Azure Blob or similar) for scalability. |
| D23 | **Notifications: email + copy link** | Email-only notifications for invites in V1. Sharing modal includes a "Copy link" button so users can share directly via any channel. In-app notification system deferred. |
| D24 | **No file locking** | Instead of locking, users can unshare a file/notebook to get exclusive access. File-level locking is not needed given CRDT conflict-free editing. |
| D25 | **Mobile: read-only** | Mobile devices show a read-only view of co-authored documents in V1. Full mobile co-editing deferred. |
| D26 | **Cross-source drag-to-copy** | Users can drag files from any notebook source (GitHub, OneDrive, Google Drive, local) into a Cloud notebook via the sidebar tree, copying the content. Defer if implementation proves complex. |
| D27 | **Account deletion: hard delete + warning** | Deleting an account hard-deletes all owned Cloud notebooks. Users are warned that this affects shared collaborators. Deferred: ownership transfer and time-limited archive access for collaborators. |
| D28 | **Backup/DR: PostgreSQL-native** | Use Azure PostgreSQL's built-in backup (see §17.1 for recommendation). Lowest cost, no custom infra, scalable foundation. |
| D29 | **Conflict resolution: automatic (Yjs)** | Rely entirely on Yjs CRDT automatic resolution in V1. Reconsider adding a review/confirm UX for complex merges in future versions. |
| D30 | **Search/indexing: defer** | Full-text search across Cloud document content is deferred to a future version. |
| D31 | **API access: defer** | Programmatic REST API for Cloud documents is deferred to a future version. |

### 17.1 Backup & Disaster Recovery Recommendation

Given the goal of lowest cost without painting into a corner, the recommendation is to **rely on Azure PostgreSQL Flexible Server's built-in backup**, which is already configured in the existing Terraform infrastructure:

| Parameter | Setting | Rationale |
|-----------|---------|-----------|
| **Backup retention** | 35 days (already configured) | Sufficient for pre-launch through early growth. Increase to max 35 days is free on Flexible Server. |
| **Geo-redundant backup** | Enabled (already configured) | Cross-region protection at minimal incremental cost. |
| **RPO (Recovery Point Objective)** | ~5 minutes | PostgreSQL continuous WAL archiving provides near-continuous backup. Acceptable for collaborative documents that also have Yjs state on connected clients. |
| **RTO (Recovery Time Objective)** | < 1 hour | Point-in-time restore to a new server. Acceptable for a pre-launch product. |
| **Additional cost** | $0 incremental | Already included in the existing PostgreSQL Flexible Server SKU. |

**Why this works for now:**
- Zero additional infrastructure or operational burden
- 35-day point-in-time restore covers accidental deletion, corruption, and most failure modes
- Geo-redundant backup protects against regional Azure outages
- Yjs clients retain local document state, so a brief outage doesn't lose in-flight edits

**Future scaling path (when needed):**
- Add application-level periodic Markdown snapshots to Azure Blob Storage for independent, cheaper long-term retention
- Consider logical replication to a read replica for zero-downtime disaster recovery
- Move to a higher PostgreSQL SKU with shorter RPO if SLAs demand it

---

## 18. Deferred Items Register

The following items are explicitly deferred from V1 but documented for future planning:

| Item | Deferred From | Notes |
|------|---------------|-------|
| In-app notification system | D23 | Build when collaboration scale justifies it |
| Ownership transfer on account deletion | D27 | Allow collaborator to claim ownership before hard delete |
| Archive with time-limited collaborator access | D27 | Alternative to hard delete for shared notebooks |
| Complex merge review UX | D29 | Reconsider if Yjs automatic resolution causes user confusion |
| Full-text search for Cloud documents | D30 | Requires decryption + indexing pipeline |
| Programmatic REST API for Cloud docs | D31 | CI/CD integration, automated publishing |
| Blob storage for documents/snapshots | D22 | Move outside PostgreSQL when storage volume grows |
| Mobile co-editing | D25 | Touch cursors, virtual keyboard challenges |
| Data residency / region selection | D5 | App-wide initiative, not co-auth specific |
| BYOK (customer-managed encryption keys) | D6 | Teams/Enterprise paid feature |
| Link expiration settings | D14 | Never / 7d / 30d options |
| Hard quota enforcement | D20 | Write-blocking behind feature flag |
| GitHub sync/publish from Cloud notebooks | D8 | Cloud → GitHub one-way sync |
| Suggest mode / comment threads | Non-goal | Google Docs parity features |
| Per-file sharing | Non-goal | V1 is notebook-level sharing only |

---

*End of document. Version 3.0 — all open questions answered. This document is ready for final review and technical design planning.*
