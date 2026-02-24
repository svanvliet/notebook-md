# Feature Flags & Flighting Requirements

**Date:** 2026-02-24  
**Status:** Draft → v2 (redesigned: rollout % moved from flags to flights)  
**Author:** Co-authored with Copilot  
**Depends on:** Existing feature flag system (migration 004, `featureFlags.ts`, admin UI)

---

## 1. Problem Statement

Notebook.md has a basic feature flag system: a `feature_flags` table with `key → enabled` (boolean), an admin toggle UI, and a `requireFeature` middleware. Flags are **global** — when enabled, every user sees the feature.

This is insufficient for production rollout of co-authoring and future features because we need:

- **Beta testing** — give specific users or groups early access before general availability
- **Gradual rollout** — ramp from 0% → 10% → 50% → 100% with the ability to pause or roll back
- **A/B testing** — show different feature variants to different cohorts and measure impact
- **Flight groups** — bundle related flags together (e.g., all co-authoring flags) so they can be assigned as a unit
- **User-level targeting** — override flags for specific users (internal testers, beta opt-ins, support escalations)

### Current System (What Exists Today)

| Component | Location | What It Does |
|-----------|----------|-------------|
| `feature_flags` table | `migrations/001_initial-schema.sql` | `key VARCHAR(100) PK`, `enabled BOOLEAN`, `description TEXT`, `updated_at` |
| Cloud flags seed | `migrations/004_feature-flags-cloud.sql` | 6 cloud flags: `cloud_notebooks`, `cloud_collab`, `cloud_sharing`, `cloud_public_links`, `soft_quota_banners`, `hard_quota_enforcement` |
| `isFeatureEnabled(key)` | `apps/api/src/services/featureFlags.ts` | Queries DB, defaults to `true` in dev, `false` in prod |
| `requireFeature(key)` | `apps/api/src/services/featureFlags.ts` | Express middleware — returns 404 if flag disabled |
| `GET /api/feature-flags/:key` | `apps/api/src/app.ts` | Public endpoint, returns `{ key, enabled }` |
| `useFeatureFlag(key)` | `apps/web/src/hooks/useFeatureFlag.ts` | React hook, fetches flag, caches 1 min |
| Admin UI | `apps/admin/src/pages/FeatureFlagsPage.tsx` | List/create/toggle flags |
| Admin API | `apps/api/src/routes/admin.ts` | `GET /admin/feature-flags`, `POST /admin/feature-flags` |

### What's Missing

- No per-user or per-group targeting
- No concept of flights (grouped flags)
- No percentage-based rollout
- No A/B test variants
- No audit history beyond the audit log
- Frontend fetches flags one at a time (N+1 API calls)
- `requireFeature` doesn't know who the user is — it only checks the global flag

---

## 2. Goals & Non-Goals

### Goals

1. **User-level flag resolution** — Evaluate flags per-user, considering group membership, user overrides, and rollout percentage
2. **Flights** — Named bundles of flags that can be assigned together to users or groups
3. **Groups** — Named sets of users (e.g., "beta-testers", "internal", "enterprise-pilot") for targeting
4. **Gradual rollout** — Percentage-based rollout that is deterministic per user (same user always gets the same result for a given percentage)
5. **A/B test variants** — Flags can have string variants (not just boolean) for experimentation
6. **Admin UI** — Manage flights, groups, overrides, and rollout from the admin console
7. **Backward compatibility** — Existing `requireFeature` middleware and `useFeatureFlag` hook continue to work without changes to call sites
8. **Batch flag resolution** — Frontend fetches all flags for the current user in a single API call
9. **Audit trail** — All flag/flight/group changes are logged

### Non-Goals (V1)

- Third-party feature flag service integration (LaunchDarkly, Unleash, etc.) — build in-house first
- Real-time flag propagation via WebSocket (polling with cache TTL is sufficient)
- Statistical significance calculations for A/B tests (use external analytics)
- Flag scheduling (auto-enable/disable at a specific time)
- Environment-level flags (staging vs. production) — handle via separate databases
- Client-side SDKs for mobile apps

### Key Design Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Rollout percentage scope | Rollout percentage lives on **flights**, not on individual flags. A flight at 30% means 30% of users get *all* the flags in that flight. This ensures related flags roll out atomically and avoids managing N percentages for N flags. |
| D2 | Group enrollment | **Both** admin-managed and self-enrollment. Admins create groups; some groups are marked `allow_self_enroll = true` so users can opt in via account settings (e.g., "Join Beta"). |
| D3 | Beta indicator | **Configurable per flight.** Each flight has a `show_badge` boolean. When true, features gated by the flight's flags show a "Beta" or "Preview" badge in the UI. When false, features appear seamlessly. |
| D4 | Domain-based targeting | **Yes.** Groups support an optional `email_domain` filter (e.g., `@company.com`). Users whose email matches the domain are implicitly members of the group without explicit enrollment. |
| D5 | Default flag state | Flags are **OFF by default** unless delivered through a flight. A flag with `enabled = true` but no flight assignment is inactive. This prevents accidental exposure — features must be explicitly flighted to reach users. |
| D6 | Feature graduation | Graduated features use a built-in "General Availability" flight at `rollout_percentage = 100` with all users implicitly included. Alternatively, the flag check can be removed from code entirely. |

---

## 3. Data Model

### 3.1 Evolve `feature_flags` Table

Extend the existing table. The flag itself is now a simple registry entry with a kill switch. Rollout percentage has moved to flights (D1).

```sql
ALTER TABLE feature_flags
  ADD COLUMN variants JSONB DEFAULT NULL,
  ADD COLUMN stale_at TIMESTAMPTZ DEFAULT NULL;
```

| Column | Type | Description |
|--------|------|-------------|
| `key` | `VARCHAR(100) PK` | Unique flag identifier (existing) |
| `enabled` | `BOOLEAN` | Global kill switch — `false` = OFF for everyone, no exceptions (existing) |
| `description` | `TEXT` | Human-readable description (existing) |
| `variants` | `JSONB` | Optional variant definitions for A/B tests, e.g. `["control", "variant_a", "variant_b"]`. When `null`, flag is boolean (enabled/disabled) |
| `stale_at` | `TIMESTAMPTZ` | Optional expiration hint — admin reminder to clean up temporary flags |
| `updated_at` | `TIMESTAMPTZ` | Last modified (existing) |

**Note:** `rollout_percentage` is NOT on flags — it lives on flights. A flag is either killed (`enabled = false`), overridden per-user, delivered through a flight, or inactive. See §4 for the full resolution algorithm.

**Resolution logic for a flag:**

1. If `enabled = false` → flag is OFF for everyone (kill switch)
2. If user has an **override** → use the override value
3. If user is in a **flight** that contains this flag (via group assignment, direct assignment, or flight rollout %) → flag is ON
4. Otherwise → flag is OFF (not delivered)

### 3.2 New Tables

#### `flag_overrides` — Per-User Flag Overrides

Individual user overrides take highest priority. Use for internal testers, support escalations, or opt-in beta users.

```sql
CREATE TABLE flag_overrides (
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
```

| Column | Description |
|--------|-------------|
| `flag_key` | Which flag to override |
| `user_id` | The target user |
| `enabled` | Override value (true/false) |
| `variant` | Optional variant assignment (for A/B tests) |
| `reason` | Why this override exists ("beta tester", "support ticket #123") |
| `created_by` | Admin who created the override |
| `expires_at` | Optional auto-expiry (e.g., 30-day beta window) |

#### `user_groups` — Named Groups of Users

Groups are named sets of users used for targeting. A user can belong to multiple groups.

```sql
CREATE TABLE user_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  allow_self_enroll BOOLEAN NOT NULL DEFAULT false,
  email_domain VARCHAR(255) DEFAULT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_group_members (
  group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by UUID REFERENCES users(id),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
```

#### `flights` — Named Bundles of Flags

A flight groups related feature flags together so they can be assigned as a unit. For example, a "co-authoring-beta" flight bundles `cloud_notebooks`, `cloud_collab`, `cloud_sharing`, `cloud_public_links`, and `soft_quota_banners`.

Flights own the `rollout_percentage`. This means a single knob controls rollout for all flags in the flight simultaneously — no risk of partial feature exposure (D1).

```sql
CREATE TABLE flights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  rollout_percentage INTEGER NOT NULL DEFAULT 0
    CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  show_badge BOOLEAN NOT NULL DEFAULT false,
  badge_label VARCHAR(50) DEFAULT 'Beta',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

| Column | Description |
|--------|-------------|
| `enabled` | Flight kill switch — `false` disables the entire flight |
| `rollout_percentage` | What % of *all* users get this flight's flags. `0` = group/user-assigned only. `100` = generally available. Hash is based on `flightName:userId` for determinism. |
| `show_badge` | When true, features delivered by this flight show a badge in the UI |
| `badge_label` | Badge text (default "Beta") |

```sql
CREATE TABLE flight_flags (
  flight_id UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  flag_key VARCHAR(100) NOT NULL REFERENCES feature_flags(key) ON DELETE CASCADE,
  PRIMARY KEY (flight_id, flag_key)
);
```

#### `flight_assignments` — Assign Flights to Groups or Users

Flights can be assigned to entire groups or individual users.

```sql
CREATE TABLE flight_assignments (
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
```

Each assignment targets either a group OR a user (not both). This allows:

- Assign "co-authoring-beta" flight → "beta-testers" group (all members get all co-auth flags)
- Assign "co-authoring-beta" flight → specific user (one-off access)

---

## 4. Flag Resolution Algorithm

The flag resolution service evaluates all flags for a given user and returns a `Record<string, ResolvedFlag>` map. Resolution follows a strict priority order.

The key principle: **flights are the delivery mechanism for flags** (D5). A flag that exists in the registry but is not delivered through any flight is OFF. This prevents accidental exposure.

```
Priority (highest to lowest):
1. Flag kill switch (enabled = false → OFF, no exceptions)
2. Per-user override (flag_overrides table)
3. Flight delivery (group assignment, direct user assignment, or flight rollout %)
4. Default: OFF (flag not delivered to this user)
```

### 4.1 Detailed Resolution Steps

For each flag, given `user_id`:

```
function resolveFlag(flag, userId):
  // Step 1: Kill switch
  if flag.enabled == false:
    return { enabled: false, source: 'kill_switch' }

  // Step 2: Per-user override
  override = SELECT * FROM flag_overrides
    WHERE flag_key = flag.key AND user_id = userId
      AND (expires_at IS NULL OR expires_at > now())
  if override exists:
    return { enabled: override.enabled, variant: override.variant, source: 'override' }

  // Step 3: Flight delivery — check all flights containing this flag
  for each flight in (SELECT f.* FROM flight_flags ff
      JOIN flights f ON ff.flight_id = f.id
      WHERE ff.flag_key = flag.key AND f.enabled = true):

    // 3a: Targeted assignment (group membership, direct user, domain match)
    assigned = SELECT 1 FROM flight_assignments fa
      WHERE fa.flight_id = flight.id
        AND (
          fa.user_id = userId
          OR fa.group_id IN (
            SELECT group_id FROM user_group_members WHERE user_id = userId
            UNION
            SELECT id FROM user_groups
              WHERE email_domain IS NOT NULL
                AND userEmail LIKE '%@' || email_domain  -- domain match (D4)
          )
        )
    if assigned:
      return { enabled: true, source: 'flight',
               badge: flight.show_badge ? flight.badge_label : null }

    // 3b: Flight rollout percentage (for users not explicitly assigned)
    if flight.rollout_percentage > 0:
      bucket = hash(flight.name + ':' + userId) % 100
      if bucket < flight.rollout_percentage:
        return { enabled: true, source: 'rollout',
                 badge: flight.show_badge ? flight.badge_label : null }

  // Step 4: Not delivered — flag is OFF
  return { enabled: false, source: 'not_delivered' }
```

### 4.2 Deterministic Percentage Rollout

Percentage rollout is on the **flight**, not on individual flags. This ensures all flags in a flight roll out together atomically — a user either gets all flags in the flight or none of them.

The hash is based on `flightName:userId` (not `flagKey:userId`):

```typescript
function getFlightBucket(flightName: string, userId: string): number {
  const hash = fnv1a(`${flightName}:${userId}`);
  return hash % 100; // 0–99
}
```

When a flight's `rollout_percentage` increases from 10% to 20%, users in bucket 0–9 remain included. Users in bucket 10–19 are added. No existing users are removed. This ensures a **monotonically increasing** rollout.

### 4.3 Feature Graduation (D6)

When a feature is ready for general availability:

1. **Option A — Set flight to 100%:** Set the flight's `rollout_percentage = 100`. All users now get the flags. Simple, preserves the flight record for auditing.
2. **Option B — Create a "GA" flight:** Create a "General Availability" flight with `rollout_percentage = 100`, move graduated flags into it, remove them from beta flights. Clean separation.
3. **Option C — Remove the flag check:** Delete the `requireFeature` / `useFlag` calls from code. The flag becomes permanently on. Most complete graduation.

Recommendation: Use Option A during transition, then Option C when confident.

### 4.4 Variant Resolution (A/B Tests)

When a flag has `variants` defined (e.g., `["control", "variant_a", "variant_b"]`):

1. If the user has an override with a `variant`, use that
2. Otherwise, use a separate hash to deterministically assign a variant:
   ```
   variantIndex = hash(flag.key + ":variant:" + userId) % variants.length
   variant = variants[variantIndex]
   ```
3. The flag is `enabled = true` with the variant value

**Note:** A/B test flags still respect the kill switch. Variants are only assigned to users who receive the flag through a flight.

---

## 5. API Design

### 5.1 Flag Resolution (Authenticated Users)

Replace per-flag fetching with a single batch endpoint.

```
GET /api/flags
Authorization: (session cookie)
Response: {
  flags: {
    "cloud_notebooks": { enabled: true, variant: null, badge: null },
    "cloud_collab": { enabled: true, variant: null, badge: "Beta" },
    "cloud_sharing": { enabled: false, variant: null, badge: null },
    "new_editor": { enabled: true, variant: "variant_b", badge: "Preview" }
  }
}
```

The `badge` field is non-null only when the flag was resolved via a flight with `show_badge = true` (D3). The frontend uses this to optionally render a badge next to the feature UI.

This returns **all** resolved flags for the current user in a single call. The frontend caches the result and refreshes periodically (1-minute TTL, matching current behavior).

**For unauthenticated users:** Return only globally-enabled flags at 100% rollout (no user-specific resolution).

### 5.2 Backward Compatibility

The existing endpoint continues to work:

```
GET /api/feature-flags/:key → { key, enabled }
```

Internally, this will call the new resolution logic with the session user (if authenticated) or fall back to the global flag value.

### 5.3 Admin API — Flags

Extend the existing admin endpoints:

```
GET    /admin/feature-flags                 → List all flags with current settings
POST   /admin/feature-flags                 → Create/update flag (existing — add rollout_percentage, variants)
DELETE /admin/feature-flags/:key            → Soft-delete flag (set enabled = false + stale_at)
```

### 5.4 Admin API — Overrides

```
GET    /admin/feature-flags/:key/overrides  → List overrides for a flag
POST   /admin/feature-flags/:key/overrides  → Create override { userId, enabled, variant?, reason?, expiresAt? }
DELETE /admin/feature-flags/:key/overrides/:userId → Remove override
```

### 5.5 Admin API — Groups

```
GET    /admin/groups                        → List all groups with member count
POST   /admin/groups                        → Create group { name, description, allowSelfEnroll?, emailDomain? }
GET    /admin/groups/:id                    → Get group details + members (includes domain-matched users)
PATCH  /admin/groups/:id                    → Update group name/description/allowSelfEnroll/emailDomain
DELETE /admin/groups/:id                    → Delete group (cascades assignments)
POST   /admin/groups/:id/members            → Add members { userIds: string[] }
DELETE /admin/groups/:id/members/:userId    → Remove member
```

#### User-Facing Group Enrollment (D2)

```
GET    /api/groups/joinable                 → List groups with allow_self_enroll = true
POST   /api/groups/:id/join                 → Authenticated user joins a self-enroll group
POST   /api/groups/:id/leave               → Authenticated user leaves a group
```

These are exposed in the user's account settings under a "Beta Programs" section.

### 5.6 Admin API — Flights

```
GET    /admin/flights                       → List all flights with assigned flag count
POST   /admin/flights                       → Create flight { name, description, flagKeys, showBadge?, badgeLabel? }
GET    /admin/flights/:id                   → Get flight details + flags + assignments
PATCH  /admin/flights/:id                   → Update flight name/description/enabled/showBadge/badgeLabel
DELETE /admin/flights/:id                   → Delete flight
POST   /admin/flights/:id/flags             → Add flags to flight { flagKeys: string[] }
DELETE /admin/flights/:id/flags/:key        → Remove flag from flight
POST   /admin/flights/:id/assign            → Assign to group or user { groupId? | userId? }
DELETE /admin/flights/:id/assignments/:id   → Remove assignment
```

---

## 6. Backend Service Changes

### 6.1 Evolve `featureFlags.ts`

The existing `isFeatureEnabled(key)` function becomes user-aware:

```typescript
// New signature (backward compatible — userId is optional)
export async function isFeatureEnabled(key: string, userId?: string): Promise<boolean>;

// Batch resolution for all flags
export async function resolveAllFlags(userId?: string): Promise<Record<string, { enabled: boolean; variant: string | null }>>;

// Existing middleware — now extracts userId from request
export function requireFeature(key: string): RequestHandler;
// Internally: isFeatureEnabled(key, req.userId)
```

**Key change to `requireFeature`:** The middleware already receives the Express `Request` object. After `requireAuth` runs, `req.userId` is available. The middleware should pass this to `isFeatureEnabled` for user-specific resolution. When called without auth (public routes), it falls back to global-only resolution.

### 6.2 Caching Strategy

Flag resolution involves multiple queries (flags, overrides, groups, flights). To avoid per-request database load:

- **Server-side cache:** In-memory cache (Map) of resolved flags per user, with a 30-second TTL
- **Cache invalidation:** Clear the cache entry when an admin changes a flag, override, group membership, or flight assignment
- **Batch query:** Resolve all flags for a user in a single optimized SQL query (JOINs) rather than per-flag queries

```sql
-- Single query to resolve all flags for a user
WITH user_overrides AS (
  SELECT flag_key, enabled, variant
  FROM flag_overrides
  WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())
),
user_flights AS (
  SELECT DISTINCT ff.flag_key
  FROM flight_flags ff
  JOIN flights f ON ff.flight_id = f.id
  JOIN flight_assignments fa ON fa.flight_id = f.id
  WHERE f.enabled = true
    AND (fa.user_id = $1 OR fa.group_id IN (
      SELECT group_id FROM user_group_members WHERE user_id = $1
    ))
)
SELECT
  f.key,
  f.enabled AS global_enabled,
  f.rollout_percentage,
  f.variants,
  uo.enabled AS override_enabled,
  uo.variant AS override_variant,
  CASE WHEN uf.flag_key IS NOT NULL THEN true ELSE false END AS in_flight
FROM feature_flags f
LEFT JOIN user_overrides uo ON uo.flag_key = f.key
LEFT JOIN user_flights uf ON uf.flag_key = f.key;
```

### 6.3 Dev Mode Behavior

Dev mode (`NODE_ENV !== 'production'`) supports two operational modes, controlled by a `DEV_FLIGHTING` environment variable:

**Default mode (`DEV_FLIGHTING` unset or `false`):**

- All flags resolve to `enabled: true` regardless of rollout, groups, or flights — **unless** the flag is explicitly set to `enabled = false` in the database
- This keeps local development frictionless (no need to set up groups/flights)
- This is the current behavior, preserved for backward compatibility

**Flighting mode (`DEV_FLIGHTING=true`):**

- The full resolution algorithm runs exactly as it would in production (overrides → flights → rollout → global default)
- Flags do NOT auto-enable — they must be explicitly enabled via the admin console, flight assignments, or overrides
- This allows developers to test the flighting system itself: create groups, assign flights, verify that the right users see the right features
- Use this mode when validating the flighting UX before deploying to production

To switch between modes during local development:

```bash
# Normal development — all features enabled
npm run dev

# Test flighting behavior — flags follow production resolution rules
DEV_FLIGHTING=true npm run dev
```

---

## 7. Frontend Changes

### 7.1 Batch Flag Fetching

Replace per-flag fetching with a single batch call. The `useFeatureFlag` hook remains the public API but internally uses a shared cache populated by a single `GET /api/flags` call.

```typescript
// New: FlagProvider wraps the app, fetches all flags once
<FlagProvider>
  <App />
</FlagProvider>

// Existing hook signature preserved (backward compatible)
useFeatureFlag('cloud_notebooks') → boolean

// New: variant-aware hook
useFeatureVariant('new_editor') → { enabled: boolean; variant: string | null }
```

### 7.2 FlagProvider

A React context provider that:

1. Fetches `GET /api/flags` on mount (and every 60 seconds)
2. Stores all resolved flags in context
3. `useFeatureFlag(key)` reads from context (synchronous, no individual API call)
4. Falls back to `false` for unknown flags

This eliminates the N+1 API call pattern (currently 1 call per `useFeatureFlag` invocation).

### 7.3 Flag-Dependent UI Patterns

Components that gate behind flags should follow this pattern:

```tsx
function CloudNotebookOption() {
  const enabled = useFeatureFlag('cloud_notebooks');
  if (!enabled) return null;
  return <CloudNotebookUI />;
}
```

No changes needed to existing call sites — they already use this pattern.

---

## 8. Admin Console UI

### 8.1 Feature Flags Page (Enhanced)

Extend the existing `FeatureFlagsPage.tsx` with:

- **Rollout percentage slider** — adjust 0–100% with live preview of affected user count
- **Variant configuration** — define variant names for A/B tests
- **Override list** — show per-user overrides with ability to add/remove
- **Flight membership** — show which flights include this flag
- **Stale indicator** — highlight flags past their `stale_at` date

### 8.2 Groups Page (New)

| View | Details |
|------|---------|
| Group list | Name, description, member count, created date |
| Group detail | Member list with search, add/remove members, assigned flights |
| Create group | Name, description, optional initial members (search by email) |

### 8.3 Flights Page (New)

| View | Details |
|------|---------|
| Flight list | Name, description, flag count, assignment count, enabled toggle |
| Flight detail | Flags included, groups/users assigned, enable/disable |
| Create flight | Name, description, select flags from checkboxes, assign to groups |

### 8.4 User Detail (Enhanced)

On the existing user detail page in admin, add a section showing:

- All flags resolved for this user (with source: global, override, flight, rollout)
- Active overrides (with ability to add/remove)
- Group memberships (with ability to add/remove)
- Flight assignments (via groups or direct)

This gives admins a "what does this user see?" diagnostic view.

---

## 9. Example Workflows

### 9.1 Beta Testing Co-Authoring

1. **Admin creates a group** "co-auth-beta" with description "Co-authoring beta testers"
2. **Admin adds 10 users** to the group (by email search)
3. **Admin creates a flight** "co-authoring-v1" containing flags: `cloud_notebooks`, `cloud_collab`, `cloud_sharing`, `cloud_public_links`, `soft_quota_banners` — with `rollout_percentage = 0` (group-assigned only) and `show_badge = true`
4. **Admin assigns flight** "co-authoring-v1" → group "co-auth-beta"
5. **Result:** Those 10 users see all co-authoring features with a "Beta" badge. Everyone else does not.
6. **To add more testers:** Admin adds users to the "co-auth-beta" group — they immediately get access.
7. **To end beta:** Admin disables the flight or removes the assignment.

### 9.2 Gradual Rollout to General Availability

1. **Admin sets** "co-authoring-v1" flight `rollout_percentage = 10`
2. **Result:** 10% of all users (deterministic) see all co-authoring features, plus all beta group users (via assignment)
3. **Admin monitors metrics** — error rates, support tickets, usage patterns
4. **Admin increases** flight rollout to 25%, then 50%, then 100%
5. **At 100%:** Feature is generally available to all users through the flight. All flags roll out together atomically.
6. **Optional cleanup:** Remove `show_badge`, remove beta group assignments, or eventually remove flag checks from code.

### 9.3 A/B Testing a New Editor Layout

1. **Admin creates flag** `new_editor_layout` with `variants: ["control", "compact", "wide"]`
2. **Admin creates flight** "editor-experiment" with `rollout_percentage = 30`, containing the flag
3. **Frontend** uses `useFlag('new_editor_layout')` → enabled for 30% of users, with deterministic variant assignment
4. **Analytics** tracks engagement metrics per variant
5. **Admin picks winner** → sets flight to 100% with winning variant, or removes flag and ships the winning layout

### 9.4 Emergency Kill Switch

1. **Production incident** — co-authoring WebSocket server is overloaded
2. **Admin sets** `cloud_collab` flag `enabled = false` in admin console
3. **Result:** Feature is immediately disabled for ALL users, including beta testers and overrides — flag kill switch takes absolute priority
4. **Investigation proceeds** — once fixed, admin re-enables the flag

### 9.5 Support Escalation Override

1. **User reports** they can't see cloud notebooks but should be able to
2. **Admin searches for user** in admin console → sees their flag resolution (all flags OFF, not in any flight)
3. **Admin creates override:** `cloud_notebooks → enabled = true` for this user, reason: "Support ticket #456", expires in 30 days
4. **User refreshes** → feature appears

---

## 10. Migration Strategy

### 10.1 Database Migration

A single migration extends the schema:

1. `ALTER TABLE feature_flags` — add `rollout_percentage`, `variants`, `stale_at` columns
2. `CREATE TABLE flag_overrides`
3. `CREATE TABLE user_groups` + `user_group_members`
4. `CREATE TABLE flights` + `flight_flags` + `flight_assignments`

All existing flags continue to work with default values (`rollout_percentage = 100`, no variants, no overrides).

### 10.2 Service Migration

1. Evolve `isFeatureEnabled(key, userId?)` — add user-aware resolution
2. Add `resolveAllFlags(userId?)` — batch resolution
3. Update `requireFeature` middleware to pass `req.userId` to resolution
4. Add `GET /api/flags` batch endpoint
5. Existing `GET /api/feature-flags/:key` continues to work

### 10.3 Frontend Migration

1. Add `FlagProvider` at app root
2. Internal refactor of `useFeatureFlag` to use context (no call site changes needed)
3. Add `useFeatureVariant` hook for A/B tests

### 10.4 Admin Migration

1. Extend `FeatureFlagsPage` with new columns
2. Add `GroupsPage` and `FlightsPage`
3. Add flag resolution view to user detail page

---

## 11. Performance Considerations

| Concern | Mitigation |
|---------|-----------|
| Per-request flag resolution is expensive | Batch resolve all flags in single SQL query; cache per-user for 30s |
| Frontend N+1 flag calls | Single `GET /api/flags` call replaces per-flag fetching |
| Large group memberships | Index on `user_group_members(user_id)` for fast lookup |
| Hash computation for rollout | FNV-1a is O(1) per flag — negligible |
| Cache staleness | 30s server TTL + 60s client TTL means max 90s propagation delay; kill switch bypasses cache |

---

## 12. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Flag values leak feature existence | `GET /api/flags` only returns flags relevant to the user; disabled flags are omitted, not returned as `enabled: false` |
| Admin flag manipulation | All flag/override/group/flight changes logged to audit log with admin user ID, IP, and timestamp |
| Override abuse | Overrides have optional `expires_at`; stale overrides highlighted in admin UI |
| Group membership manipulation | Group changes logged to audit log; only admins can modify groups |
| Kill switch reliability | Kill switch check is first in resolution chain; no cache bypass needed — the cache key includes the flag's `enabled` state |

---

## 13. Observability

### 13.1 Audit Log Events

All administrative actions produce audit log entries:

| Action | Details |
|--------|---------|
| `flag_updated` | Flag key, old/new enabled, old/new rollout_percentage |
| `flag_override_created` | Flag key, target user, enabled, variant, reason |
| `flag_override_removed` | Flag key, target user |
| `group_created` | Group name |
| `group_member_added` | Group name, user email |
| `group_member_removed` | Group name, user email |
| `flight_created` | Flight name, included flags |
| `flight_assigned` | Flight name, target group or user |
| `flight_unassigned` | Flight name, target group or user |

### 13.2 Metrics (Future)

When analytics infrastructure is in place:

- Flag evaluation counts (per flag, per resolution source)
- Variant distribution (per flag — actual vs. expected split)
- Time-to-resolve (p50, p99 for flag resolution latency)

---

## 14. Future Extensions (Out of Scope for V1)

| Extension | Description |
|-----------|-------------|
| **Scheduled flags** | Auto-enable/disable flags at a specific date/time |
| **Mutual exclusion** | Ensure a user is in at most one A/B test variant across multiple experiments |
| **Segment targeting** | Target by user attributes beyond email domain (e.g., account age, plan tier, usage patterns) |
| **Flag dependencies** | "Flag B requires Flag A" — automatically enable prerequisites |
| **LaunchDarkly integration** | Migrate to a managed service if in-house system becomes a burden |
| **Real-time propagation** | Push flag changes via WebSocket instead of polling |
| **Statistical analysis** | Built-in A/B test results with confidence intervals |

---

## 15. Acceptance Criteria

### Must Have (V1)

- [x] Existing `requireFeature` middleware works unchanged (backward compatible)
- [x] Existing `useFeatureFlag` hook works unchanged (backward compatible)
- [x] Flags can be resolved per-user (not just globally)
- [x] Per-user overrides can be created/removed via admin UI
- [x] User groups can be created with members added/removed via admin UI
- [x] Groups support `email_domain` filter for implicit membership (D4)
- [x] Groups support `allow_self_enroll` with user-facing join/leave (D2)
- [x] Flights can bundle multiple flags and be assigned to groups or users via admin UI
- [x] Flights support configurable badge display (D3)
- [ ] Rollout percentage lives on flights, not flags (D1) — **v2 redesign, not yet implemented**
- [ ] Flags are OFF by default unless delivered through a flight (D5) — **v2 redesign, not yet implemented**
- [x] Global kill switch (enabled = false) overrides all targeting
- [x] Frontend fetches all flags in a single batch API call
- [x] `DEV_FLIGHTING=true` env var enables full resolution in dev mode (§6.3)
- [x] All admin actions are logged to audit log
- [x] All 277+ existing API tests continue to pass
- [x] New tests cover: flag resolution priority, override expiry, group membership, flight assignment, domain matching, self-enrollment, rollout determinism

### Should Have (V1)

- [x] User detail page in admin shows resolved flags with source
- [ ] Rollout percentage slider on flights in admin UI — **v2 redesign, not yet implemented**
- [x] Override expiry (auto-cleanup of expired overrides)
- [ ] Stale flag indicator in admin UI
- [x] "Beta Programs" section in user account settings for self-enrollment (D2)

### Nice to Have (V2)

- [ ] A/B test variant support (variants column, `useFeatureVariant` hook)
- [ ] Variant distribution analytics
- [ ] Flag scheduling
