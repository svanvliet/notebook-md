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

This gives the fastest credible path to real-time collaboration while preserving the 
existing BYO-storage identity for users who prioritize provider-native storage.

## Answers to first round of questions

I'm aligned with your recommendations. See my answers below and ask any follow-ups, appended to this document for me to answer.

1. Yes, free for now. We can introduce some premium features later, like joining Teams vs. having anyone share (creates a Pro/Enterprise type offering).

2. Keep them single-author for now. If we allow for invite with link for view only, we'd have to provides proxied access to content technically stored on the other services.

3. For initial launch, can we just have Owner, Editor, and Viewer?

4. I think sharing via link is a critical feature for adoption, so let's include it. We can have nice calls to action when a user clicks the link for them to sign up to edit, etc. Also, we should make sure the user, when sharing, has the ability to make the link public or private.

5. Right now we're all US-based. Let's make note of the requirements for data residency in a future release. This will be important for the entire app, not only for this feature.

6. Platform managed keys are good for now, but document what BYOK would look like in the future (and as a paid feature for Teams/Enterprises).

7. Yes, but we should limit the file size of a .md file to a reasonable max size. We can look at gzip compression of the text when stored at rest as well to keep size down, perhaps?

8. Thinking on this. How difficult would it be to have our current GitHub remote notebooks support co-authoring based on the design choices you've made?

9. What is a reasonable # of concurrent users that our current tech stack can support without causing significant load/stress on the system as designed?

10. "Cloud" is fine.

---

## 14) Decisions Captured from Your Answers (Round 1)

These decisions are now treated as requirements unless superseded:

1. **Pricing/packaging at launch:** Cloud collaboration is available on free tier initially.  
   - Future monetization path: Teams/Enterprise controls and advanced sharing/governance.

2. **BYO notebooks:** Remain **single-author** for now.

3. **Initial roles:** `Owner`, `Editor`, `Viewer` only.

4. **Link sharing:** In scope for initial launch, with user controls for link visibility (`private` vs `public`).

5. **Data residency:** US-first now; data residency roadmap required for later release.

6. **Encryption keys:** Platform-managed keys in initial release; BYOK documented as future Teams/Enterprise capability.

7. **Content limits/storage efficiency:** Support Markdown documents with explicit size limits and evaluate compression at rest.

8. **Naming:** Source type name is **Cloud**.

---

## 15) Responses to Your Follow-Ups

### 15.1 How difficult is GitHub-backed co-authoring (without Cloud storage)?

Short answer: **meaningfully harder** than Cloud-backed collaboration and not recommended for initial release.

Why:
- GitHub APIs and git commits are optimized for file/version operations, not sub-second collaborative sync.
- Real-time editing would still require Notebook.md to host ephemeral shared state (CRDT session + presence), then reconcile/commit to GitHub asynchronously.
- You would need to solve cross-user authorization and permission semantics on top of GitHub ownership/installations.
- External repo changes during active sessions introduce conflict/rebase complexity and confusing UX.

Recommended stance:
- Keep GitHub notebooks single-author in v1 collaboration launch.
- Introduce optional **“Cloud notebook -> sync/publish to GitHub”** later, rather than direct multi-user GitHub-native co-authoring first.

### 15.2 Reasonable concurrent-user target for current stack

For initial design targets (before load testing), a practical envelope is:
- **Per document (active editors):** target 20, stretch to 50.
- **Per document (viewers):** 100+ is reasonable with lightweight presence updates.
- **Platform launch target:** design for a few hundred concurrently editing users across the cluster, then scale horizontally.

Recommended launch guardrails:
- Set a configurable cap per document (e.g., 25 active editors at launch).
- Keep WebSocket/presence state in Redis-backed coordination.
- Run explicit load tests before GA and tune caps based on observed p95 latency and error rates.

### 15.3 Markdown file size and compression guidance

Recommendation for v1:
- Enforce **max 5 MB uncompressed markdown per document** (configurable server-side).
- Store canonical markdown + compressed snapshot/object representation for storage efficiency.
- Reject oversized writes with clear UX messaging and guidance.
- Keep large binary assets out of markdown body storage (handle as separate asset objects/URLs).

---

## 16) Second-Round Clarification Questions

Please answer these so I can refine the spec further:

1. For **public links**, should anonymous users be allowed to **view only**, or must all viewers authenticate?
2. For link sharing, should default be **private (recommended)** when creating a new link?
3. Should public links be revocable with a single “rotate link” action (new token invalidates old URL)?
4. Do you want link-level expiration in v1 (e.g., never / 7 days / 30 days), or defer to later?
5. For free tier limits, do you want an initial cap on Cloud collaboration usage (e.g., number of cloud notebooks or collaborators per notebook)?
6. For the 5 MB markdown cap, do you prefer this as a hard global default, or role/plan-based in the future?

## Answers to second round of questions

I'm aligned to your recommendations. Answers to your questions below.

1. Yes, anonymous users can view-only.

2. Yes, default is private but it should be easy for the user to select the public option.

3. Yes, a user should easlily be able to "un-share" a link. Whould also have a menu option on the account menu called Sharing, where users can review what they've shared and manage those details.

4. Let's defer this to a future version.

5. Let's limit free tier users to 3 cloud notebooks, with a total storage limit of 500 MB for their total cloud assets. We'll not introduce the premium offering or language yet in the app, but we should build the backend needed to capture these limits, introduce the database tables for purchased plans/tiers, and include a freemium tier that all users are entitled to by default. This will set up the scaffolding for future paid users. Feel free to design as you see fit here.

6. We can make this enforced by the entitlements check I started to outline in my answer above. Feel free to make decisions on the approach as you see fit.

---

## 17) Decisions Captured from Your Answers (Round 2)

These are now requirements unless superseded:

1. **Public links:** Anonymous access is allowed as **view-only**.
2. **Default link visibility:** New share links default to **private**, with easy user control to switch to public.
3. **Unshare/manageability:** Users must be able to quickly unshare/revoke links, and account settings must include a **Sharing** management area.
4. **Link expiration:** Deferred to future version.
5. **Free-tier limits (Cloud):**
   - Max **3 Cloud notebooks** per user.
   - Max **500 MB total Cloud storage assets** per user.
6. **Limits architecture:** Govern file-size and quota policy through a centralized entitlements system, with feature-flagged rollout of hard enforcement.

---

## 18) Additional Requirements Added from Round 2

### 18.1 Sharing management requirements
- Add an account-level **Sharing** page/menu where users can:
  - list active shares,
  - see current visibility (private/public),
  - revoke (“unshare”) links,
  - review collaborators and access level for Cloud notebooks.

### 18.2 Entitlements and plans scaffolding (backend-first)
- Build backend scaffolding now for freemium-to-paid evolution, without paid UI language at launch.
- Required backend concepts:
  - `plans` (e.g., `free`, future `pro`, `team`, `enterprise`)
  - `user_plan_subscriptions` (all users default to free)
  - `plan_entitlements` (limits/feature flags by plan)
  - `user_usage_counters` (authoritative usage for quota checks)
- Entitlements service must be the single policy gate for:
  - cloud notebook count limits,
  - aggregate cloud storage limits,
  - per-document size limits.

### 18.3 Limit enforcement behavior requirements
- On notebook-count limit reached:
  - block creation of additional Cloud notebooks,
  - return structured limit error for UI.
- On storage usage thresholds (v1 soft-quota mode):
  - show warning banner at >= 90% of quota,
  - show exceeded-quota banner at >= 100% of quota,
  - do not block edits/writes in v1.
- Future (flagged) hard-quota mode:
  - block writes/uploads that increase storage usage,
  - allow read/export/delete operations to recover.
- All limit denials should include user-facing reason + current usage + limit values.

### 18.4 Quota accounting requirements
- Track total Cloud storage usage per user in near real-time.
- Keep periodic reconciliation job to repair counter drift.
- Define storage accounting source of truth in backend (not client-calculated).

### 18.5 Document-size policy requirement
- Keep v1 default markdown size cap (5 MB) and enforce via entitlements gate.
- Future plans may raise/lower cap through entitlement config, not hard-coded logic.

---

## 19) Third-Round Clarification Questions

1. For the **500 MB** quota, should usage be measured from **uncompressed document size** (recommended for predictability) or compressed-at-rest size?
2. Should historical snapshots/versions count toward the 500 MB user quota in v1, or only current document state?
3. For anonymous public links, should access be “secret URL only” (not indexable/listed) in v1?
4. For users who hit quota limits, should we surface a usage dashboard immediately in v1, or just limit messages first and dashboard in a follow-up?

## Answers to third round of questions

1. Uncompressed.

2. Total size, including snapshots. We can always increase the free tier cap if this proves limiting.

3. Yes, we want the URLs to be non-indexable.

4. We should warn users in a banner of the app then they are within 10% of their storage usage (simliar to the demo mode banner). In the future, we'll have a link for them the upgrade to premium. But for now, the warning will suffice. Once a user reaches or surpasses their quota, for now, update the banner to explain the user has exceeded their quota. We won't enforce for now, but in future versions, we'll add the enforcement, such as disabling editing until they upgrade or delete files.

---

## 20) Decisions Captured from Your Answers (Round 3)

These are now requirements unless superseded:

1. **Quota accounting basis:** Use **uncompressed** size for quota accounting.
2. **Quota scope:** User quota includes **current document state + snapshots/versions**.
3. **Public link discoverability:** Anonymous public links must be **non-indexable/secret URL style** in v1.
4. **Storage quota behavior in v1:** Soft-quota warnings only (90% warning, 100% exceeded banner); no write-block enforcement yet.
5. **Enforcement roadmap:** Keep hard-quota enforcement implementation path behind entitlement/feature flags for future release.

### 20.1 Additional implementation notes from Round 3 decisions
- Public link responses/pages should include non-indexing controls (e.g., `noindex` directives) and never expose link targets via public listings/sitemaps.
- Quota meter UI can start as banner-only in v1; richer usage dashboard can follow.
