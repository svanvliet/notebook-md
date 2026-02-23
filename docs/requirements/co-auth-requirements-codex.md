# Notebook.md Real-Time Co-Authoring Requirements (Codex Draft)

**Author:** Codex  
**Date:** 2026-02-23  
**Status:** Draft for review

---

## 1) Executive Summary

Notebook.md can add real-time co-authoring without abandoning its original philosophy if we treat centrally hosted storage as an **opt-in storage mode** rather than the new default.  

**Recommendation:** Keep existing BYO storage notebooks as-is, and introduce a new notebook source type, **Cloud (Notebook.md Managed)**, specifically designed for multi-user collaboration and simpler ACL management.  

For editor/collaboration tech, the best near-term path is to **keep TipTap** and add a CRDT collaboration layer (Yjs + Hocuspocus or equivalent), rather than replacing the editor stack or building a custom collaboration engine.

---

## 2) Strategy Change: From “Never Store Content” to “You Choose Where Content Lives”

### 2.1 Current Positioning (today)
- Product/docs/marketing currently assert that Notebook.md does not store document content.
- This appears in README, features/about pages, legal copy, and privacy statements.

### 2.2 Proposed Positioning (future)
- Shift from an absolute promise to a **mode-based promise**:
  - **BYO Storage mode:** files live in customer cloud providers (GitHub/OneDrive/Google Drive), as today.
  - **Notebook Cloud mode:** files are stored by Notebook.md to enable real-time co-authoring and native sharing.

### 2.3 Messaging Principle
- Replace “we never store content” with:
  - “**You choose where your notebook data is stored.**”
  - “Use your cloud provider for single-author workflows, or Notebook Cloud for real-time collaboration.”

### 2.4 Product Strategy Requirement
- The app must make storage mode explicit at notebook creation time and in settings.
- Users must be able to understand tradeoffs before choosing:
  - BYO mode: external ACL complexity, no native real-time co-authoring.
  - Cloud mode: centralized storage + native sharing + live collaboration.

---

## 3) Goals and Non-Goals

### 3.1 Goals
1. Support 2+ users editing the same Markdown document simultaneously.
2. Preserve Notebook.md writing UX quality (WYSIWYG Markdown-first experience).
3. Provide first-party sharing/permissions for collaborative notebooks.
4. Keep BYO-storage workflows available and reliable.
5. Update legal/marketing language to avoid misleading users.

### 3.2 Non-Goals (Phase 1)
1. Real-time collaboration for BYO sources (GitHub/OneDrive/Google Drive).
2. Full Google Docs parity (suggest mode, comments threads, track changes) in initial release.
3. End-user-managed encryption keys in v1.

---

## 4) User and Business Requirements

### 4.1 Primary User Stories
- As an owner, I can create a Cloud notebook and invite collaborators by email.
- As an editor, I can see others’ cursors/presence and edits in near real-time.
- As a viewer, I can read but not edit.
- As an owner/admin, I can revoke access instantly.
- As a user, I can still choose BYO storage notebooks when I do not need collaboration.

### 4.2 Collaboration UX Requirements
- Presence indicators (who is online in current doc).
- Live cursor/selection awareness.
- Conflict-free concurrent editing.
- Fast reconnect/resume behavior after transient disconnects.
- Version history checkpoints (at minimum snapshot restore).

### 4.3 Permissions Requirements (Cloud notebooks)
- Roles: `Owner`, `Editor`, `Commenter` (optional phase 2), `Viewer`.
- Access share methods:
  - direct invite by email,
  - share link with explicit role (optional phase 2),
  - workspace/team scopes (future).
- Permission checks enforced server-side on every doc/session operation.

### 4.4 Data & Lifecycle Requirements
- Document source of truth for Cloud notebooks must be service-managed.
- Persist collaboration state and periodic snapshots.
- Export to `.md` at any time.
- Optional sync/publish from Cloud notebook to GitHub/Drive is a later feature, not required for initial co-authoring launch.

---

## 5) Editor/Canvas Evaluation

## 5.1 Option A — TipTap + Yjs (+ Hocuspocus) **(Recommended)**
**Pros**
- Reuses current editor investment and UX.
- Strong ecosystem for ProseMirror collaborative editing.
- Fastest route with lowest rewrite risk.
- Keeps markdown conversion pipeline under existing control.

**Cons**
- Requires adding a real-time state layer and session infra.
- Need careful handling of TipTap extension compatibility in collaborative mode.
- Must redesign save flow (currently tab-level debounced writes).

## 5.2 Option B — TipTap + Fluid Framework
**Pros**
- Fluid is built for real-time collaborative distributed data.
- Good primitives for presence and shared structures.

**Cons**
- More architectural/operational complexity than Yjs path for this stack.
- Less direct, common path for TipTap/ProseMirror than Yjs in OSS ecosystem.
- Likely longer time-to-market and higher integration risk unless team has Fluid-specific expertise.

## 5.3 Option C — Move to Lexical (+ collaboration stack)
**Pros**
- Modern editor framework with strong performance profile.
- Large ecosystem momentum.

**Cons**
- Major rewrite of editor behavior and existing custom extensions.
- Migration risk for markdown fidelity and current UX.
- Delays collaboration delivery due to parallel rewrite.

## 5.4 Option D — Build a custom editor/collaboration engine
**Pros**
- Full control over behavior and protocol.

**Cons**
- Highest engineering risk, longest timeline, most maintenance burden.
- Reinvents solved CRDT/OT problems.
- Not justified for current product stage.

### Editor Decision
Adopt **Option A** now. Reassess in future only if collaboration scale/performance constraints prove materially limiting.

---

## 6) App Layer and Storage Architecture

### 6.1 Fit with Current Stack (React + Express + Postgres + Redis)
Current stack can support this with targeted additions:

1. **New source type:** `cloud` (or `notebook_cloud`) in notebook model.
2. **Realtime service:** WebSocket collaboration server (Hocuspocus-compatible or equivalent) integrated with auth/session cookies/tokens.
3. **Persistence model:**
   - Postgres for metadata, ACLs, invitations, snapshot pointers, audit events.
   - Blob/object storage for document snapshots/large assets (S3/Azure Blob/GCS).
   - Redis pub/sub + ephemeral presence state for multi-instance scaling.

### 6.2 Data Model Requirements (Cloud mode)
At minimum add entities:
- `cloud_notebooks` (or extend notebooks with cloud-specific config)
- `cloud_documents`
- `cloud_document_memberships`
- `cloud_document_invites`
- `cloud_document_snapshots`
- `cloud_document_events` (optional in v1 if snapshots + CRDT updates suffice)
- `cloud_collab_sessions` (ephemeral/operational)

### 6.3 Save/Sync Model Requirement
- Move from “debounced full-document write” to “CRDT update stream + snapshot compaction.”
- Keep periodic markdown snapshot generation for:
  - export,
  - search/indexing,
  - backup/restore,
  - compatibility with existing markdown-first product promise.

### 6.4 Infrastructure Requirement
- Horizontal scale support for collaboration gateway.
- Sticky-session not required if CRDT provider is multi-node aware via Redis/backplane.
- SLO target (initial): p95 local edit propagation < 250ms for active sessions under target load.

---

## 7) Fluid Framework and Other OSS Technologies

### 7.1 Fluid Framework (Microsoft)
Use when:
- Team values Fluid’s distributed data model deeply,
- and accepts higher integration/operations complexity.

For Notebook.md right now:
- Viable, but **not the shortest path** to market with current TipTap investment.
- Better suited if product strategy expands into rich collaborative data objects beyond docs (boards, embedded app objects, etc.).

### 7.2 Strong OSS alternatives
- **Yjs + Hocuspocus**: best fit for TipTap/ProseMirror and current product maturity.
- **Automerge**: robust CRDT project; less standard pairing with current TipTap stack.
- **Liveblocks (managed)**: fast delivery but adds vendor dependency/cost; good fallback if ops capacity is constrained.

### 7.3 Recommendation
- Primary: **Yjs + Hocuspocus + existing stack**.
- Contingency: managed collaboration backend if team capacity for running realtime infra is limited.

---

## 8) Security, Privacy, and Compliance Requirements

### 8.1 Core security requirements
- Encrypt document data at rest.
- Encrypt in transit (TLS, WSS).
- Enforce ACL on doc open, subscribe, update, export.
- Write audit logs for share/invite/revoke/export/high-risk actions.

### 8.2 Privacy/legal requirements
- Update Privacy Policy and Terms to reflect Cloud mode data processing.
- Introduce clear retention/deletion guarantees for cloud documents.
- Define data residency roadmap (if regional constraints matter for target customers).
- Provide account deletion behavior for shared documents (ownership transfer/archive rules).

### 8.3 Trust requirement
- In-product copy must clearly state:
  - what data is stored,
  - when it is stored,
  - why it is stored,
  - and user controls for export/deletion.

---

## 9) Marketing, Website, and Tagline Updates

## 9.1 Positioning updates needed
Current copy repeatedly says “we never store your content”; this must be replaced with mode-aware messaging.

### 9.2 Proposed tagline options
1. **“Write together, store your way.”**
2. **“Bring your own storage—or use Notebook Cloud for live collaboration.”**
3. **“Your Markdown, your choice: provider storage or Notebook Cloud.”**

### 9.3 Suggested copy framework
- Hero/feature pages:
  - “Notebook.md supports both connected cloud providers and Notebook Cloud for real-time collaboration.”
- Trust statement:
  - “You choose where documents live. Collaboration notebooks are stored by Notebook.md with encryption and access controls.”

### 9.4 Repository surfaces to update
- `README.md`
- `apps/web/src/components/marketing/FeaturesPage.tsx`
- `apps/web/src/components/marketing/AboutPage.tsx`
- `apps/web/src/components/marketing/MarketingLayout.tsx`
- `apps/web/src/components/legal/PrivacyPage.tsx`
- `apps/web/src/components/legal/TermsPage.tsx`
- Any onboarding/demo copy that states “we never store your content”

---

## 10) Rollout Requirements

### 10.1 Delivery phases
1. **Foundation:** cloud source type, document model, ACL model, auth integration.
2. **Realtime alpha:** live editing in cloud notebooks, internal users only.
3. **Private beta:** invites/sharing, snapshots, export, audit logs.
4. **GA:** legal/marketing updates live, billing/limits policy in place, operational readiness.

### 10.2 Feature flagging
- Gate Cloud notebooks and real-time collaboration behind server-side feature flags.
- Ability to disable realtime while preserving read/export access in incident scenarios.

### 10.3 Success metrics
- Activation: % of users creating Cloud notebooks.
- Collaboration usage: shared docs/user, concurrent sessions.
- Reliability: collaboration session error rate, reconnect success.
- Trust: support tickets related to “where is my data stored”.

---

## 11) Risks and Mitigations

- **Risk:** Brand trust hit from strategy shift.  
  **Mitigation:** explicit “storage mode” language everywhere, not hidden in legal docs.

- **Risk:** Realtime infra complexity for small team.  
  **Mitigation:** start with constrained v1 + evaluate managed provider fallback.

- **Risk:** Markdown fidelity drift in collaborative editing.  
  **Mitigation:** define canonical markdown serialization tests and periodic snapshot validation.

- **Risk:** Security exposure from multi-tenant document storage.  
  **Mitigation:** strict tenant isolation, encryption, audit trails, and threat-model review before beta.

---

## 12) Open Questions for You

1. Should Cloud notebooks be available on free tier, or paid-only from day one?
2. Do you want BYO notebooks to remain strictly single-author in v1, or allow “invite with view-only links” without realtime editing?
3. Which permission roles are required for initial launch: Owner/Editor/Viewer only, or include Commenter?
4. Is external sharing (public link) in scope for first release, or invite-only?
5. Any required data residency constraints (US-only, EU region, customer-selectable)?
6. Do you need customer-managed encryption keys (BYOK) on the roadmap, or platform-managed keys are acceptable initially?
7. Should Cloud notebooks support large binary embeds/assets in v1, or text-first markdown only?
8. Do you want a “publish/sync to GitHub” path for Cloud notebooks in initial release or explicitly defer?
9. What collaboration scale target should we design for initially (e.g., typical concurrent editors per doc)?
10. What is the preferred product naming: “Cloud”, “Notebook Cloud”, “Hosted”, or another term?

---

## 13) Final Recommendation

Proceed with **Notebook Cloud** as an additive storage mode and implement co-authoring using **TipTap + Yjs/Hocuspocus** on top of the current stack.  

This gives the fastest credible path to real-time collaboration while preserving the existing BYO-storage identity for users who prioritize provider-native storage.
