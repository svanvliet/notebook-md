# Flighting Implementation Plan

**Requirements:** `docs/requirements/flighting-requirements.md`  
**Branch:** `feature/flighting` (based on `feature/co-auth`)  
**Date:** 2026-02-24  
**Status:** All phases complete (Phases 1–5 + Phase 6 v2 redesign)

---

## Overview

Evolve the basic boolean feature flag system into a full flighting platform with per-user resolution, groups, flights, percentage rollout, and admin UI — while maintaining backward compatibility with all existing `requireFeature` and `useFeatureFlag` call sites.

### Current State

The co-authoring feature (Phases 0–5) uses 6 feature flags gated by `requireFeature` middleware (15 routes) and `useFeatureFlag` hook (2 UI components). These flags are global booleans — all or nothing. In dev mode, all flags auto-enable.

### Approach

Build in 5 phases, each independently testable and committable:

1. **Database schema** — migration for new tables + columns
2. **Resolution engine** — the core `resolveAllFlags` function + batch API
3. **Admin API** — CRUD for groups, flights, overrides
4. **Admin UI** — new pages + enhanced flags page
5. **Frontend + user-facing** — FlagProvider, self-enrollment, badge support

---

## Phase 1 — Database Schema

**Goal:** Add all new tables and columns via a single migration. No logic changes yet.

### 1.1 Migration `007_flighting.sql`

**File:** `apps/api/migrations/007_flighting.sql`

```sql
-- Extend feature_flags
ALTER TABLE feature_flags
  ADD COLUMN IF NOT EXISTS rollout_percentage INTEGER DEFAULT 100
    CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stale_at TIMESTAMPTZ DEFAULT NULL;

-- Per-user flag overrides
CREATE TABLE IF NOT EXISTS flag_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_key VARCHAR(100) NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  variant VARCHAR(100) DEFAULT NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE (flag_key, user_id)
);

-- User groups
CREATE TABLE IF NOT EXISTS user_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  allow_self_enroll BOOLEAN NOT NULL DEFAULT false,
  email_domain VARCHAR(255) DEFAULT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_group_members (
  group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- Flights
CREATE TABLE IF NOT EXISTS flights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  show_badge BOOLEAN NOT NULL DEFAULT false,
  badge_label VARCHAR(50) DEFAULT 'Beta',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flight_flags (
  flight_id UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  flag_key VARCHAR(100) NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  PRIMARY KEY (flight_id, flag_key)
);

CREATE TABLE IF NOT EXISTS flight_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flight_id UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT flight_target CHECK (
    (group_id IS NOT NULL AND user_id IS NULL) OR
    (group_id IS NULL AND user_id IS NOT NULL)
  ),
  UNIQUE (flight_id, group_id, user_id)
);

-- Indexes for resolution query performance
CREATE INDEX IF NOT EXISTS idx_flag_overrides_user ON flag_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_flag_overrides_key ON flag_overrides(flag_key);
CREATE INDEX IF NOT EXISTS idx_user_group_members_user ON user_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_flight_assignments_flight ON flight_assignments(flight_id);
CREATE INDEX IF NOT EXISTS idx_flight_assignments_group ON flight_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_flight_assignments_user ON flight_assignments(user_id);
```

### 1.2 Verify migration runs

- Run `npm run migrate` (or however migrations execute)
- Verify tables exist and existing flags have `rollout_percentage = 100`

### Exit Criteria

- [x] Migration runs cleanly on fresh DB and on existing DB with cloud flags
- [x] Existing 277+ API tests pass (no schema breakage)
- [x] All 6 existing cloud flags have `rollout_percentage = 100`, `variants = NULL`

---

## Phase 2 — Resolution Engine

**Goal:** Implement the core flag resolution algorithm and batch API endpoint. This is the heart of the system. Existing middleware (`requireFeature`) and endpoint (`GET /api/feature-flags/:key`) become user-aware without breaking call sites.

### 2.1 Evolve `featureFlags.ts`

**File:** `apps/api/src/services/featureFlags.ts`

Add:

- `resolveAllFlags(userId?: string, userEmail?: string)` — the batch resolution function
  - Single SQL query with CTEs (overrides, user_flights, domain groups)
  - Returns `Record<string, { enabled: boolean; variant: string | null; badge: string | null; source: string }>`
  - Implements the 5-step priority chain from §4.1
- `getUserBucket(flagKey: string, userId: string): number` — deterministic FNV-1a hash for rollout
- In-memory cache: `Map<string, { result, fetchedAt }>` with 30s TTL, keyed by `userId`
- Cache clear function for admin mutations

Update:

- `isFeatureEnabled(key, userId?)` — call `resolveAllFlags` and extract the single flag
  - When `userId` is provided, use full resolution
  - When absent (public/unauthenticated), use global-only logic (existing behavior)
- `requireFeature(key)` — extract `req.userId` and pass to `isFeatureEnabled`
  - `req.userId` is available because `requireAuth` runs first on all gated routes
  - For the few routes where `requireFeature` runs WITHOUT `requireAuth`, fall back to global resolution

Add `DEV_FLIGHTING` support:

- When `NODE_ENV !== 'production'` and `DEV_FLIGHTING !== 'true'`, preserve current behavior (auto-enable all)
- When `DEV_FLIGHTING=true`, run full resolution even in dev

### 2.2 Batch API endpoint

**File:** `apps/api/src/app.ts`

Add:

```
GET /api/flags → { flags: Record<string, { enabled, variant, badge }> }
```

- If authenticated (`req.userId` from session): resolve all flags for user
- If unauthenticated: return globally-enabled flags at 100% rollout, no badge/variant

Update existing endpoint to use new resolution:

```
GET /api/feature-flags/:key → { key, enabled }
```

- If authenticated: use per-user resolution
- If unauthenticated: global-only (existing behavior preserved)

### 2.3 Tests

**File:** `apps/api/src/tests/flighting.test.ts` (new)

Test cases:

- **Kill switch:** Flag `enabled = false` → OFF for everyone, including overrides and flights
- **Override priority:** User override takes precedence over flight and rollout
- **Flight assignment (direct user):** User assigned to flight → flags enabled
- **Flight assignment (via group):** User in group, group assigned to flight → flags enabled
- **Domain-based group:** User email matches `email_domain` → treated as group member
- **Flight bypasses rollout (D1):** Flag at 10% rollout, user in flight → enabled
- **Rollout determinism:** Same user+flag always lands in same bucket
- **Rollout monotonicity:** Increasing percentage from 10→20 adds users, doesn't remove
- **Override expiry:** Expired override is ignored
- **Global default:** Flag enabled at 100% with no overrides/flights → ON
- **Dev mode default:** In test env without `DEV_FLIGHTING`, flags auto-enable
- **Batch endpoint:** `GET /api/flags` returns all resolved flags for authenticated user
- **Backward compat:** `GET /api/feature-flags/:key` still works

### Exit Criteria

- [x] `resolveAllFlags` returns correct results for all priority levels
- [x] `requireFeature` now checks per-user (existing routes still work)
- [x] `GET /api/flags` batch endpoint works for auth and unauth users
- [x] `GET /api/feature-flags/:key` backward compatible
- [x] Deterministic rollout hashing verified
- [x] DEV_FLIGHTING toggle works
- [x] All new tests pass + all existing 277+ tests pass

---

## Phase 3 — Admin API

**Goal:** CRUD endpoints for groups, flights, overrides, and enhanced flag management. All behind existing admin auth middleware.

### 3.1 Groups API

**File:** `apps/api/src/routes/admin.ts`

```
GET    /admin/groups                        → List groups (name, description, member count, allow_self_enroll, email_domain)
POST   /admin/groups                        → Create group { name, description, allowSelfEnroll?, emailDomain? }
GET    /admin/groups/:id                    → Group detail + members list
PATCH  /admin/groups/:id                    → Update group
DELETE /admin/groups/:id                    → Delete group (cascades)
POST   /admin/groups/:id/members            → Add members { userIds: string[] }
DELETE /admin/groups/:id/members/:userId    → Remove member
```

All mutations log to audit log.

### 3.2 Flights API

**File:** `apps/api/src/routes/admin.ts`

```
GET    /admin/flights                       → List flights (name, flag count, assignment count, enabled)
POST   /admin/flights                       → Create flight { name, description, flagKeys, showBadge?, badgeLabel? }
GET    /admin/flights/:id                   → Flight detail + flags + assignments
PATCH  /admin/flights/:id                   → Update flight
DELETE /admin/flights/:id                   → Delete flight (cascades)
POST   /admin/flights/:id/flags             → Add flags { flagKeys: string[] }
DELETE /admin/flights/:id/flags/:key        → Remove flag
POST   /admin/flights/:id/assign            → Assign { groupId? | userId? }
DELETE /admin/flights/:id/assignments/:assignmentId → Remove assignment
```

### 3.3 Overrides API

**File:** `apps/api/src/routes/admin.ts`

```
GET    /admin/feature-flags/:key/overrides  → List overrides for flag
POST   /admin/feature-flags/:key/overrides  → Create override { userId, enabled, variant?, reason?, expiresAt? }
DELETE /admin/feature-flags/:key/overrides/:userId → Remove override
```

### 3.4 Enhanced Flags API

**File:** `apps/api/src/routes/admin.ts`

Update existing `POST /admin/feature-flags` to accept `rolloutPercentage`, `variants`, `staleAt` in addition to existing `key`, `enabled`, `description`.

### 3.5 User Flag Resolution API

**File:** `apps/api/src/routes/admin.ts`

```
GET /admin/users/:id/flags → Resolved flags for this user (with source for each)
```

This powers the "what does this user see?" diagnostic view.

### 3.6 Cache Invalidation

All admin mutations that affect flag resolution must clear the in-memory cache:

- Flag update → clear all cached entries
- Override create/delete → clear cached entry for that user
- Group member add/remove → clear cached entries for affected users
- Flight enable/disable/assign/unassign → clear all cached entries

### 3.7 Tests

**File:** `apps/api/src/tests/flighting-admin.test.ts` (new)

Test CRUD operations for groups, flights, overrides. Verify audit log entries. Test cache invalidation indirectly (mutation → re-resolve → different result).

### Exit Criteria

- [x] Groups CRUD works (create, list, detail, update, delete, add/remove members)
- [x] Flights CRUD works (create, list, detail, update, delete, add/remove flags, assign/unassign)
- [x] Overrides CRUD works (create, list, delete per flag+user)
- [x] Enhanced flag update accepts rolloutPercentage
- [x] User flag resolution diagnostic returns sources
- [x] All mutations logged to audit log
- [x] Cache invalidation works (flag change → immediate effect on next resolve)
- [x] All tests pass

---

## Phase 4 — Admin UI

**Goal:** Build admin console pages for managing groups, flights, and overrides. Enhance existing feature flags page.

### 4.1 Navigation

**File:** `apps/admin/src/components/Layout.tsx`

Add nav items:

```tsx
{ to: '/groups', label: 'Groups', icon: '👥' },
{ to: '/flights', label: 'Flights', icon: '✈️' },
```

### 4.2 useAdmin hook extensions

**File:** `apps/admin/src/hooks/useAdmin.ts`

Add API functions:

- Groups: `getGroups()`, `createGroup()`, `getGroup(id)`, `updateGroup()`, `deleteGroup()`, `addGroupMembers()`, `removeGroupMember()`
- Flights: `getFlights()`, `createFlight()`, `getFlight(id)`, `updateFlight()`, `deleteFlight()`, `addFlightFlags()`, `removeFlightFlag()`, `assignFlight()`, `unassignFlight()`
- Overrides: `getFlagOverrides(key)`, `createFlagOverride()`, `deleteFlagOverride()`
- User flags: `getUserFlags(userId)`

### 4.3 Groups Page

**File:** `apps/admin/src/pages/GroupsPage.tsx` (new)

- **List view:** Table with name, description, member count, self-enroll badge, domain badge, created date
- **Create modal:** Name, description, allow_self_enroll toggle, email_domain input
- **Detail view (inline expand or separate route):** Member list with search, add members (user search by email), remove member button, list of assigned flights
- Pattern: Follow existing `UsersPage.tsx` for table + modal pattern

### 4.4 Flights Page

**File:** `apps/admin/src/pages/FlightsPage.tsx` (new)

- **List view:** Table with name, flag count, assignment count, enabled toggle, badge indicator
- **Create modal:** Name, description, select flags (checkboxes from existing flags), show_badge toggle, badge_label input
- **Detail view:** Flags included (with remove), assignments (groups + direct users with remove), add assignment modal
- Pattern: Follow existing page patterns

### 4.5 Enhanced Feature Flags Page

**File:** `apps/admin/src/pages/FeatureFlagsPage.tsx`

Extend existing page with:

- **Rollout percentage** — number input or slider (0–100) next to each flag
- **Stale indicator** — yellow highlight for flags past `stale_at`
- **Expandable row detail** — click a flag to see: overrides list, flight membership, variant config
- **Override management** — inline add/remove overrides (search user by email)

### 4.6 User Detail Enhancement

**File:** `apps/admin/src/pages/UsersPage.tsx`

Add a "Feature Flags" section to the user detail view:

- Table: Flag key, Resolved value, Source (global/override/flight/rollout), Badge
- Quick actions: Add override, Remove override
- Group memberships section: list groups, add/remove

### 4.7 Router

**File:** `apps/admin/src/App.tsx`

Add routes:

```tsx
<Route path="groups" element={<GroupsPage {...} />} />
<Route path="flights" element={<FlightsPage {...} />} />
```

### Exit Criteria

- [x] Groups page: list, create, view detail, add/remove members
- [x] Flights page: list, create, view detail, manage flags and assignments
- [x] Feature flags page: rollout percentage editable, overrides visible
- [x] User detail: shows resolved flags with sources
- [x] All admin actions work end-to-end (UI → API → DB → resolution change)

---

## Phase 5 — Frontend & User-Facing

**Goal:** Replace per-flag fetching with batch FlagProvider, add user-facing self-enrollment, and badge rendering.

### 5.1 FlagProvider context

**File:** `apps/web/src/hooks/useFeatureFlag.ts` (rewrite internals)

- Create `FlagContext` + `FlagProvider` component
- `FlagProvider` fetches `GET /api/flags` on mount and every 60 seconds
- Stores `Record<string, { enabled, variant, badge }>` in context
- `useFeatureFlag(key)` reads from context (synchronous) — returns `boolean`
- `useFeatureVariant(key)` reads from context — returns `{ enabled, variant, badge }`
- Falls back to individual `GET /api/feature-flags/:key` if context not available (SSR safety)
- **Backward compatible:** Existing call sites (`useFeatureFlag('cloud_notebooks')`) work without changes

### 5.2 Wire FlagProvider

**File:** `apps/web/src/main.tsx` or `apps/web/src/App.tsx`

Wrap the app with `<FlagProvider>` at the root level (inside auth context, so user is available).

### 5.3 User self-enrollment API

**File:** `apps/api/src/routes/groups.ts` (new, or add to existing)

```
GET  /api/groups/joinable    → List groups with allow_self_enroll = true
POST /api/groups/:id/join    → Authenticated user joins group
POST /api/groups/:id/leave   → Authenticated user leaves group
```

### 5.4 Account Settings — Beta Programs

**File:** `apps/web/src/components/account/AccountModal.tsx`

Add a "Beta Programs" tab or section:

- List joinable groups (from `GET /api/groups/joinable`)
- Show group name, description, and Join/Leave button
- When joined, user's flags update on next poll (≤60s)

### 5.5 Badge rendering

For features gated behind a flag that was resolved via a flight with `show_badge = true`:

- `useFeatureVariant(key)` returns `{ badge: "Beta" }` (or null)
- Components can optionally render a small badge next to the feature UI
- Create a `<FeatureBadge flag="cloud_notebooks" />` helper component that renders the badge if present

This is opt-in per component — no automatic badge injection.

### 5.6 Tests

**File:** `apps/web/src/hooks/useFeatureFlag.test.ts` (new or extend)

- FlagProvider fetches batch endpoint
- `useFeatureFlag` returns correct value from context
- Polling refreshes flags
- Falls back gracefully when provider not mounted
- Badge data flows through correctly

### Exit Criteria

- [x] FlagProvider fetches all flags in a single API call
- [x] `useFeatureFlag` works from context (no per-flag API calls)
- [x] `useFeatureVariant` returns badge and variant data
- [x] Self-enrollment API works (join/leave groups)
- [x] Account settings shows joinable groups
- [x] Existing `useFeatureFlag` call sites work unchanged
- [x] All tests pass

---

## Co-Authoring Flag Integration

The 6 existing cloud flags need to work seamlessly with the new system. Here's the specific integration plan:

### Existing flags to preserve

| Flag | Used By | Current State |
|------|---------|---------------|
| `cloud_notebooks` | `requireFeature` (4 routes), `useFeatureFlag` (AddNotebookModal) | Enabled globally in dev |
| `cloud_collab` | Referenced in code but not gated by middleware yet | Enabled globally in dev |
| `cloud_sharing` | `requireFeature` (11 routes) | Enabled globally in dev |
| `cloud_public_links` | Referenced but not actively gated | Enabled globally in dev |
| `soft_quota_banners` | `useFeatureFlag` (QuotaBanner) | Enabled globally in dev |
| `hard_quota_enforcement` | Not yet used | Disabled |

### Post-implementation workflow

Once flighting is built, the production rollout of co-authoring would be:

1. All 6 cloud flags remain `enabled = false` globally in production
2. Create a "co-authoring-beta" flight containing all 5 active cloud flags
3. Create a "beta-testers" group, add internal team members
4. Assign the flight to the group → beta testers get co-authoring
5. Gradually increase `rollout_percentage` on individual flags (10% → 25% → 50% → 100%)
6. At 100%, remove the flight (no longer needed) and the flags become globally available

No code changes to existing `requireFeature` or `useFeatureFlag` call sites — they'll automatically use per-user resolution via the upgraded `isFeatureEnabled`.

---

## Open Questions (Resolved)

| # | Question | Answer |
|---|----------|--------|
| 1 | Is the existing `GET /admin/users?search=...` sufficient for adding users to groups/overrides? | **Yes**, sufficient for now. |
| 2 | Is 90s max propagation delay (30s server + 60s client) acceptable? | **Yes.** |
| 3 | Single migration file or split? | **Single** `007_flighting.sql`. |

---

## File Change Summary

| File | Change Type | Phase |
|------|-------------|-------|
| `apps/api/migrations/007_flighting.sql` | New | 1 |
| `apps/api/src/services/featureFlags.ts` | Major rewrite | 2 |
| `apps/api/src/app.ts` | Add `GET /api/flags` + update existing endpoint | 2 |
| `apps/api/src/tests/flighting.test.ts` | New | 2 |
| `apps/api/src/routes/admin.ts` | Extend with groups/flights/overrides CRUD | 3 |
| `apps/api/src/tests/flighting-admin.test.ts` | New | 3 |
| `apps/admin/src/components/Layout.tsx` | Add nav items | 4 |
| `apps/admin/src/hooks/useAdmin.ts` | Add API functions | 4 |
| `apps/admin/src/pages/GroupsPage.tsx` | New | 4 |
| `apps/admin/src/pages/FlightsPage.tsx` | New | 4 |
| `apps/admin/src/pages/FeatureFlagsPage.tsx` | Enhance | 4 |
| `apps/admin/src/pages/UsersPage.tsx` | Add flags section | 4 |
| `apps/admin/src/App.tsx` | Add routes | 4 |
| `apps/web/src/hooks/useFeatureFlag.ts` | Rewrite internals (FlagProvider) | 5 |
| `apps/web/src/main.tsx` or `App.tsx` | Wrap with FlagProvider | 5 |
| `apps/api/src/routes/groups.ts` | New (user-facing join/leave) | 5 |
| `apps/web/src/components/account/AccountModal.tsx` | Add Beta Programs section | 5 |

---

## Phase 6 — v2 Redesign: Flight-Level Rollout ✅

**Goal:** Move `rollout_percentage` from `feature_flags` to `flights`, making flights the sole delivery mechanism for flags. This aligns with the mental model: Users → Groups → Flights (with %) → Flags.

**Commit:** `6e4785e`

### Motivation

The v1 implementation has rollout percentage on individual flags, which creates two parallel delivery paths:
1. Flight-based delivery (targeted groups + direct user assignments)
2. Per-flag percentage rollout (independent of flights)

This is confusing and error-prone. If you have 6 co-authoring flags and want to roll out to 25%, you'd update 6 rows individually. If one gets missed, users get a broken partial experience.

The redesigned model puts % on flights. One knob controls rollout for all flags in a flight atomically.

### 6.1 Schema Changes

```sql
-- Add rollout_percentage to flights
ALTER TABLE flights
  ADD COLUMN rollout_percentage INTEGER NOT NULL DEFAULT 0
    CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100);

-- Remove rollout_percentage from feature_flags (or keep as deprecated, stop using in resolution)
```

### 6.2 Resolution Engine Changes

Update `featureFlags.ts`:
- Remove Step 4 (per-flag rollout %) and Step 5 (global default)
- Expand Step 3 (flight delivery) to include flight-level rollout %
- Hash on `flightName:userId` instead of `flagKey:userId`
- Flags not delivered by any flight → OFF (source: `not_delivered`)

New algorithm:
1. Flag disabled (`enabled = false`) → OFF
2. Per-user override → use override
3. Flight delivery (for each flight containing this flag):
   - 3a: Targeted assignment (group/user/domain) → ON
   - 3b: Flight rollout % (hash `flightName:userId`) → ON if in bucket
4. Not delivered → OFF

### 6.3 Admin UI Changes

- Remove rollout % selector from FeatureFlagsPage
- Add rollout % slider to FlightsPage (in flight detail panel)
- Create a "General Availability" flight for graduated features (rollout = 100%)

### 6.4 Migration for Existing Co-Auth Flags

Current state: 6 co-auth flags at `enabled = true`, `rollout_percentage = 100` (globally on).

Migration plan:
1. Create a "General Availability" flight with `rollout_percentage = 100`
2. Add all 6 co-auth flags to the GA flight
3. Resolution engine will deliver them via the GA flight at 100% — same behavior as today

### 6.5 Tests

- Update existing flighting tests for new resolution algorithm
- Add tests for flight-level rollout %
- Verify co-auth flags still resolve correctly through GA flight
- Verify monotonic rollout at flight level
- Added `seedFlagsWithGAFlight()` helper to fix co-auth tests (sharing, export, version-history)

### Exit Criteria

- [x] `rollout_percentage` on flights table, not feature_flags
- [x] Resolution uses flight-level % with `flightName:userId` hash
- [x] Flags without flight delivery resolve to OFF
- [x] Co-auth flags work through GA flight at 100%
- [x] Admin UI has rollout % on flights, not flags
- [x] All 332 tests pass
