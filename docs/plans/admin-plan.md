# Admin Console Upgrade — Implementation Plan

**Requirements:** `docs/requirements/admin-requirements.md` (v1.1)  
**Branch:** `feature/admin`  
**Date:** 2026-02-26  

---

## Overview

Upgrade the admin console from a basic CRUD interface to a polished, consistent, and interconnected management tool. Four phases, each building on the previous.

**Current state:** 11 source files, 7 pages, no shared components, no frontend tests, no Headless UI. API has good test coverage (700+ lines).

**Target state:** Shared component library (Headless UI + Tailwind), unified Feature Management section, user detail slide panel with tabs, pagination everywhere, and comprehensive test coverage.

---

## Phase 1: Component Library + Infrastructure

**Goal:** Build the shared UI component library and establish patterns. Refactor existing pages to use them. No new features — purely visual/behavioral consistency.

### 1.1 Install Dependencies

- [ ] Add `@headlessui/react` (modals, dropdowns, combobox, transitions)
- [ ] Add `react-day-picker` (date picker for scheduling/filtering)
- [ ] Add `date-fns` (date formatting/manipulation — react-day-picker peer dep)
- [ ] Verify Tailwind config works with Headless UI (no changes expected)

### 1.2 Shared Components (`apps/admin/src/components/ui/`)

Build each component with TypeScript, Tailwind styling, and Headless UI where applicable:

- [ ] **Badge** — Status badges with preset variants: `success`, `warning`, `error`, `info`, `neutral`. Props: `variant`, `children`, `dot` (optional leading dot indicator).
- [ ] **Button** — Variants: `primary`, `secondary`, `danger`, `ghost`. Sizes: `sm`, `md`. Loading state (spinner + disabled). Props: `variant`, `size`, `loading`, `disabled`.
- [ ] **ConfirmDialog** — Headless UI Dialog with title, message, confirm/cancel buttons. Destructive variant (red confirm button). Props: `open`, `onClose`, `onConfirm`, `title`, `message`, `confirmLabel`, `destructive`.
- [ ] **Toast** — Toast notification system with context provider. Types: `success`, `error`, `info`. Auto-dismiss (5s). Stack multiple. Props: `useToast()` hook returning `addToast(message, type)`.
- [ ] **DataTable** — Sortable columns (click header), pagination controls (prev/next/page numbers), empty state, loading skeleton. Props: `columns[]`, `data[]`, `pagination`, `onSort`, `onPageChange`, `loading`, `emptyMessage`.
- [ ] **SlidePanel** — Headless UI Dialog as slide-over from right. ~50% viewport width. Header with title + close button. Scrollable body. Props: `open`, `onClose`, `title`, `children`, `wide` (optional wider variant).
- [ ] **PageHeader** — Page title + optional description + action buttons area. Consistent spacing. Props: `title`, `description`, `actions` (ReactNode).
- [ ] **EmptyState** — Centered icon + message + optional action button. Props: `icon`, `title`, `description`, `action`.
- [ ] **LoadingSpinner** — Inline and full-page variants. Props: `size`, `fullPage`.
- [ ] **FormField** — Label + input wrapper + error message. Props: `label`, `error`, `required`, `children`.
- [ ] **DatePicker** — Wrapper around react-day-picker in a Headless UI Popover. Props: `value`, `onChange`, `placeholder`.
- [ ] **Combobox (UserPicker)** — Defer to Phase 2 (needs API endpoint first).

### 1.3 Toast Provider Setup

- [ ] Create `ToastProvider` context in `apps/admin/src/components/ui/Toast.tsx`
- [ ] Wrap app in `ToastProvider` in `App.tsx`
- [ ] Export `useToast()` hook

### 1.4 Refactor Existing Pages

Refactor each page to use shared components. No new features — maintain identical behavior.

- [ ] **Layout.tsx** — Use Badge for nav items if needed; no major changes
- [ ] **DashboardPage** — Use PageHeader, Badge, LoadingSpinner
- [ ] **UsersPage** — Use PageHeader, DataTable (with existing pagination), Badge, Button, ConfirmDialog (replace `window.confirm`), Toast for feedback
- [ ] **FeatureFlagsPage** — Use PageHeader, DataTable, SlidePanel (replace inline side panel), Badge, Button, ConfirmDialog, Toast
- [ ] **GroupsPage** — Use PageHeader, DataTable, SlidePanel, Badge, Button, ConfirmDialog, Toast
- [ ] **FlightsPage** — Use PageHeader, DataTable, SlidePanel, Badge, Button, ConfirmDialog, Toast
- [ ] **AnnouncementsPage** — Use PageHeader, DataTable, Badge, Button, ConfirmDialog, Toast
- [ ] **AuditLogPage** — Use PageHeader, DataTable (with existing pagination), Badge

### 1.5 Tests

**Admin frontend unit tests** (new — apps/admin has zero tests currently):

- [ ] Set up Vitest + React Testing Library for `apps/admin`
  - Add vitest, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom to dev deps
  - Create `vitest.config.ts` for admin workspace
  - Add `test` script to admin `package.json`
- [ ] **Component tests** (`apps/admin/src/components/ui/__tests__/`):
  - [ ] Badge.test.tsx — renders variants, children
  - [ ] Button.test.tsx — renders variants, loading state disables, click handler
  - [ ] ConfirmDialog.test.tsx — opens/closes, calls onConfirm, destructive variant
  - [ ] Toast.test.tsx — useToast adds/removes toasts, auto-dismiss
  - [ ] DataTable.test.tsx — renders columns/data, sort click, pagination, empty state, loading
  - [ ] SlidePanel.test.tsx — opens/closes, renders children
  - [ ] PageHeader.test.tsx — renders title, description, actions
  - [ ] EmptyState.test.tsx — renders icon, title, action

### 1.6 Exit Criteria

- [ ] All existing pages refactored to use shared components
- [ ] Visual behavior identical to before (no regressions)
- [ ] All destructive actions use ConfirmDialog (no more `window.confirm`)
- [ ] All mutations show Toast feedback (success/error)
- [ ] All async operations show loading states
- [ ] Component tests passing
- [ ] `npm run build` succeeds for admin workspace

---

## Phase 2: User Management Upgrade

**Goal:** Powerful user management with debounced search, sortable columns, status filter, user detail slide panel with tabs, and UserPicker autocomplete component.

### 2.1 Database Migration

- [ ] Migration: Add `last_active_at` column to `users` table (updated on session creation/refresh)
  - `ALTER TABLE users ADD COLUMN last_active_at TIMESTAMPTZ;`
  - Backfill from most recent session: `UPDATE users SET last_active_at = (SELECT MAX(created_at) FROM sessions WHERE sessions.user_id = users.id);`

### 2.2 API Changes

- [ ] `GET /admin/users` — Add query params:
  - `sort` (name, email, created_at, last_active_at) + `order` (asc, desc)
  - `status` filter (all, active, suspended)
- [ ] `GET /admin/users/search?q=` — New lightweight endpoint for UserPicker autocomplete
  - Returns: `[{id, email, displayName, avatarUrl}]` (max 10 results)
  - Searches by email prefix OR display name (ILIKE)
- [ ] `GET /admin/users/:id` — Add to response:
  - `resolvedFlags` — computed flag state for this user (reuse `resolveAllFlags`)
  - `groups` — groups this user belongs to
  - `flights` — flights targeting this user (via group or direct assignment)
  - `lastActiveAt` — from new column
- [ ] `POST /admin/users/:id/logout` — New: revoke all sessions for user
- [ ] Update session creation/refresh to set `users.last_active_at`

### 2.3 Frontend: UserPicker Component

- [ ] **UserPicker** (`apps/admin/src/components/ui/UserPicker.tsx`)
  - Headless UI Combobox with async search
  - Debounced API call (300ms) to `/admin/users/search?q=`
  - Shows avatar (or initials) + name + email in dropdown
  - Single-select mode (returns one user)
  - Multi-select mode (returns array, with selected user chips)
  - Keyboard navigation (arrow keys, enter, backspace to remove)

### 2.4 Frontend: Users Page Upgrade

- [ ] **Debounced search** — Remove search button; auto-search on 300ms debounce
- [ ] **Sortable columns** — Name, Email, Joined, Last Active, Status (click to toggle sort)
- [ ] **Status filter** — Dropdown above table: All / Active / Suspended
- [ ] **Last Active column** — Relative time ("2 hours ago", "3 days ago")
- [ ] **User avatar / initials** in name column

### 2.5 Frontend: User Detail Slide Panel

- [ ] **SlidePanel** with tabbed content (wide variant, ~50% viewport):
  - **Overview tab** — Email, display name, joined date, last active, 2FA status, admin badge, identity providers list, quick actions (Suspend/Unsuspend, Force Logout, Delete)
  - **Notebooks tab** — Table of user's notebooks (name, source type, file count, created date)
  - **Flags & Flights tab** — Resolved flag table (flag key, value, source: override/flight/kill-switch/not_delivered), groups list, flights list, per-user overrides with edit/delete
  - **Activity tab** — Filtered audit log for this user (last 50 entries)
  - **Sessions tab** — Active sessions with IP, user-agent, created date. Revoke individual or all.

### 2.6 Tests

**API tests** (`apps/api/src/tests/`):

- [ ] `admin.test.ts` — Add tests:
  - User search endpoint (`/admin/users/search?q=`) — returns matches, limits to 10, empty query
  - User list sorting (sort by name asc/desc, by created_at)
  - User list status filter (active only, suspended only)
  - User detail includes resolvedFlags, groups, flights
  - Force-logout endpoint revokes all sessions
  - `last_active_at` updated on session refresh

**Admin frontend tests** (`apps/admin/src/`):

- [ ] UserPicker.test.tsx — Search triggers API call after debounce, renders results, selects user, multi-select mode
- [ ] User detail panel tests — Renders tabs, switches between them, shows correct data

### 2.7 Exit Criteria

- [ ] User search is debounced (no button)
- [ ] Columns sortable, status filterable
- [ ] User detail slide panel shows all 5 tabs with real data
- [ ] UserPicker works with autocomplete in single and multi-select modes
- [ ] Force-logout works (revokes all sessions)
- [ ] All new API endpoints tested
- [ ] All new frontend components tested
- [ ] Existing admin tests still pass

---

## Phase 3: Feature Management Unification

**Goal:** Merge Feature Flags, Flights, and Groups under a unified "Feature Management" section with deep cross-referencing, flight detail pages, and flag archival.

### 3.1 Database Migration

- [ ] Migration: Add `archived` column to `feature_flags` table
  - `ALTER TABLE feature_flags ADD COLUMN archived BOOLEAN DEFAULT false;`
- [ ] Migration: Create `announcement_groups` join table for group targeting
  - ```sql
    CREATE TABLE announcement_groups (
      announcement_id UUID REFERENCES announcements(id) ON DELETE CASCADE,
      group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (announcement_id, group_id)
    );
    ```
  (Group targeting schema added here so both Phase 3 and 4 can use it)

### 3.2 API Changes

- [ ] `GET /admin/feature-flags` — Add to response:
  - `flights[]` — array of `{id, name}` for flights containing this flag
  - `overrideCount` — number of active overrides
  - Add query params: `archived` (true/false/all, default false), `page`, `per_page`
- [ ] `PATCH /admin/feature-flags/:key` — New endpoint for updating flag fields:
  - Body: `{description?, enabled?, archived?, variants?, staleAt?}`
  - Replaces the overloaded `POST /admin/feature-flags` for updates
- [ ] `GET /admin/flights` — Add to response:
  - `targetedUserCount` — estimated number of users reached (group members + direct assignments, deduplicated)
  - Add query params: `page`, `per_page`
- [ ] `GET /admin/groups` — Add query params: `page`, `per_page`
- [ ] `GET /admin/groups/:id` — Add pagination for members (`page`, `per_page`)
  - Add `flights[]` — flights this group is assigned to

### 3.3 Frontend: Navigation Restructure

- [ ] Add "Feature Management" section to sidebar with collapsible sub-nav:
  - 🚩 Feature Flags (`/features/flags`)
  - ✈️ Flights (`/features/flights`)
  - 👥 Groups (`/features/groups`)
- [ ] Update React Router routes accordingly
- [ ] Redirect old routes (`/feature-flags` → `/features/flags`, etc.)

### 3.4 Frontend: Feature Flags Page Upgrade

- [ ] Show flight badges inline on each flag row (clickable → navigates to flight)
- [ ] Show override count per flag
- [ ] Stale flag indicator (⚠️ icon when past `stale_at`)
- [ ] Archived filter toggle (default: hide archived; toggle to show all)
- [ ] Archive/unarchive action on flag row
- [ ] Pagination (DataTable, 20 per page)
- [ ] Replace user ID input in overrides with UserPicker
- [ ] Add DatePicker for override expiration

### 3.5 Frontend: Flights Page Upgrade

- [ ] **Flight list** — Visual rollout progress bar, flag count, assignment summary, pagination
- [ ] **Flight detail page** (`/features/flights/:id`) — Full page layout:
  - Header: Name, status badge, enable/disable toggle
  - Rollout section: Visual progress bar with slider, estimated reach count
  - Flags section: List of associated flags with enabled/disabled status, add/remove
  - Targeting section: Assigned groups (with member counts), assigned users, add group/user (UserPicker)
  - Badge section: Show badge toggle, badge label input
  - Confirmation on rollout % change (show estimated user impact)
- [ ] Replace user ID input in assignments with UserPicker

### 3.6 Frontend: Groups Page Upgrade

- [ ] Show flight badges inline (which flights this group is assigned to)
- [ ] Member count links to member list
- [ ] Pagination on group list (20 per page)
- [ ] Paginated member list in group detail
- [ ] Replace email input with UserPicker for adding members
- [ ] Confirmation dialog on member removal

### 3.7 Cross-Reference Links

- [ ] Flag row → clickable flight badge → `/features/flights/:id`
- [ ] Flight detail → clickable group name → group detail
- [ ] Flight detail → clickable user name → user detail slide panel (on `/users` page)
- [ ] Group detail → clickable flight badge → `/features/flights/:id`
- [ ] Override row → clickable user → user detail
- [ ] User detail Flags tab → clickable flag → `/features/flags` with flag selected

### 3.8 Tests

**API tests:**

- [ ] Feature flags: archive/unarchive, filter by archived, pagination, flights in response, override count
- [ ] Flights: targeted user count estimation, pagination
- [ ] Groups: pagination, flights-in-response, member pagination

**Admin frontend tests:**

- [ ] Feature flags page: archive toggle, flight badges render, stale indicator, pagination
- [ ] Flight detail page: renders all sections, rollout slider, add/remove flags, add/remove assignments
- [ ] Groups page: flight badges, member pagination, UserPicker integration
- [ ] Navigation: Feature Management sub-nav renders, routes work, old routes redirect

### 3.9 Exit Criteria

- [ ] Feature Management section with 3 sub-pages in nav
- [ ] All cross-reference links work (flags ↔ flights ↔ groups ↔ users)
- [ ] Flight detail page with visual rollout bar and targeting summary
- [ ] Flag archival works (archive, unarchive, filter)
- [ ] All list pages paginated
- [ ] UserPicker replaces all raw ID/email inputs
- [ ] All new API endpoints tested
- [ ] All new frontend components tested
- [ ] Existing tests still pass

---

## Phase 4: Announcements, Audit Log & Dashboard Polish

**Goal:** Markdown preview for announcements, group targeting, audit log date filtering, CSV export, and dashboard enhancements.

### 4.1 API Changes

- [ ] `GET /admin/announcements` — Add pagination (`page`, `per_page`)
- [ ] `POST /admin/announcements` — Add `groupIds[]` field (optional; null = platform-wide)
- [ ] `PUT /admin/announcements/:id` — Add `groupIds[]` field
- [ ] `GET /admin/announcements/:id` — New: return single announcement with `groups[]`
- [ ] `GET /api/announcements` (public) — Filter by user's group membership when announcement has group targeting
- [ ] `GET /admin/audit-log` — Add `start_date`, `end_date` query params (ISO 8601)
- [ ] `GET /admin/audit-log?format=csv` — Return CSV download (Content-Type: text/csv)

### 4.2 Frontend: Announcements Page Upgrade

- [ ] Pagination (DataTable, 20 per page)
- [ ] **Markdown preview** — Split view: edit (textarea) on left, rendered preview on right
  - Use a lightweight markdown renderer (reuse `marked` from web app or add dependency)
- [ ] **Scheduling UI** — DatePicker for `starts_at` and `ends_at`
- [ ] **Type selector** — Dropdown: info / warning / critical with color preview badge
- [ ] **Group targeting** — Multi-select group picker (dropdown of existing groups, or platform-wide)
- [ ] **Preview** — "Preview as user" button showing how the announcement renders in the notification bar

### 4.3 Frontend: Audit Log Page Upgrade

- [ ] **Date range filter** — Two DatePickers: Start date, End date
- [ ] **User filter** — UserPicker (single-select) to filter by acting admin
- [ ] **Combined filters** — All filters composable (action + user + date range)
- [ ] **Formatted details** — Parse JSON details into readable key-value pairs instead of raw JSON
- [ ] **Entity links** — Link affected entities (user → user detail, flag → flag page, etc.)
- [ ] **CSV export** — "Export" button that downloads filtered results as CSV

### 4.4 Frontend: Dashboard Enhancements

- [ ] **Recent admin actions** — Last 5 audit log entries with quick links
- [ ] **Stale flags alert** — Count of flags past their `stale_at` date, with link to flags page filtered to stale
- [ ] **Active announcements** — Count and list of currently active announcements
- [ ] **Active flights summary** — List of enabled flights with rollout % bars

### 4.5 Tests

**API tests:**

- [ ] Announcements: group targeting CRUD, filtered delivery by group membership, pagination
- [ ] Audit log: date range filtering, CSV export format
- [ ] Audit log: combined filters (action + user + date)

**Admin frontend tests:**

- [ ] Announcements: markdown preview renders, date picker sets dates, group targeting selector, type dropdown
- [ ] Audit log: date filter, user filter, formatted details, CSV export button
- [ ] Dashboard: recent actions render, stale flags alert, active flights summary

### 4.6 Exit Criteria

- [ ] Announcements have markdown preview, scheduling, type selection, and group targeting
- [ ] Audit log has date range, user filter, formatted details, and CSV export
- [ ] Dashboard shows recent actions, stale flags, active announcements, and flights summary
- [ ] All list pages paginated
- [ ] All new API endpoints tested
- [ ] All new frontend components tested
- [ ] Full admin test suite passes (API + frontend)

---

## Test Summary

### New Test Files to Create

| File | Type | Phase | Tests |
|------|------|-------|-------|
| `apps/admin/vitest.config.ts` | Config | 1 | Test infrastructure setup |
| `apps/admin/src/components/ui/__tests__/Badge.test.tsx` | Unit | 1 | Badge variants |
| `apps/admin/src/components/ui/__tests__/Button.test.tsx` | Unit | 1 | Button variants, loading |
| `apps/admin/src/components/ui/__tests__/ConfirmDialog.test.tsx` | Unit | 1 | Open/close, confirm, destructive |
| `apps/admin/src/components/ui/__tests__/Toast.test.tsx` | Unit | 1 | Add/remove, auto-dismiss |
| `apps/admin/src/components/ui/__tests__/DataTable.test.tsx` | Unit | 1 | Columns, sort, pagination, empty |
| `apps/admin/src/components/ui/__tests__/SlidePanel.test.tsx` | Unit | 1 | Open/close, children |
| `apps/admin/src/components/ui/__tests__/PageHeader.test.tsx` | Unit | 1 | Title, description, actions |
| `apps/admin/src/components/ui/__tests__/EmptyState.test.tsx` | Unit | 1 | Icon, title, action |
| `apps/admin/src/components/ui/__tests__/UserPicker.test.tsx` | Unit | 2 | Search, select, multi-select |
| `apps/admin/src/pages/__tests__/UsersPage.test.tsx` | Integration | 2 | Detail panel, tabs |
| `apps/admin/src/pages/__tests__/FeatureFlagsPage.test.tsx` | Integration | 3 | Archive, flights, pagination |
| `apps/admin/src/pages/__tests__/FlightDetailPage.test.tsx` | Integration | 3 | Rollout, flags, assignments |
| `apps/admin/src/pages/__tests__/GroupsPage.test.tsx` | Integration | 3 | Members, flights, pagination |
| `apps/admin/src/pages/__tests__/AnnouncementsPage.test.tsx` | Integration | 4 | Markdown, targeting, scheduling |
| `apps/admin/src/pages/__tests__/AuditLogPage.test.tsx` | Integration | 4 | Filters, export, formatted details |
| `apps/admin/src/pages/__tests__/DashboardPage.test.tsx` | Integration | 4 | Recent actions, stale flags, flights |

### Existing Test Files to Extend

| File | Phase | New Tests |
|------|-------|-----------|
| `apps/api/src/tests/admin.test.ts` | 2 | User search, sorting, status filter, force-logout, last_active_at |
| `apps/api/src/tests/flighting-admin.test.ts` | 3 | Flag archival, pagination, flights-in-flag-response, targeted user count |
| `apps/api/src/tests/admin.test.ts` | 4 | Announcement group targeting, audit log date/CSV |

### Test Commands

```bash
# API tests (existing)
npm run test:api

# Admin frontend tests (new)
npm run -w apps/admin test

# All tests
npm run test:api && npm run -w apps/admin test
```

---

## Migration Summary

| Migration | Phase | Changes |
|-----------|-------|---------|
| `011_admin-upgrade.sql` | 2+3 | `ALTER TABLE users ADD COLUMN last_active_at TIMESTAMPTZ;` |
| | | `ALTER TABLE feature_flags ADD COLUMN archived BOOLEAN DEFAULT false;` |
| | | `CREATE TABLE announcement_groups (announcement_id UUID, group_id UUID, PRIMARY KEY(...));` |

(Single migration for all schema changes — simpler to manage.)

---

## Dependency Changes

| Package | Workspace | Phase | Purpose |
|---------|-----------|-------|---------|
| `@headlessui/react` | apps/admin | 1 | Modals, dropdowns, combobox, transitions |
| `react-day-picker` | apps/admin | 1 | Date picker component |
| `date-fns` | apps/admin | 1 | Date formatting (react-day-picker peer dep) |
| `vitest` | apps/admin (dev) | 1 | Test runner |
| `@testing-library/react` | apps/admin (dev) | 1 | Component testing |
| `@testing-library/jest-dom` | apps/admin (dev) | 1 | DOM assertions |
| `@testing-library/user-event` | apps/admin (dev) | 1 | User interaction simulation |
| `jsdom` | apps/admin (dev) | 1 | DOM environment for tests |
| `marked` | apps/admin | 4 | Markdown rendering for announcement preview |

---

## Risk Notes

1. **Headless UI + React 19 compatibility** — Verify `@headlessui/react` works with React 19 before starting. If incompatible, fall back to Radix UI primitives or custom implementations.
2. **DataTable complexity** — The DataTable component is the most complex shared component. Consider building it incrementally (static first, then add sort, then pagination) rather than all at once.
3. **Cross-reference links** — Deep linking between Feature Management pages requires careful URL structure. Plan routes before building pages.
4. **Announcement group targeting** — The public announcement API (`GET /api/announcements`) needs to filter by user group membership without breaking existing clients that expect platform-wide announcements.
5. **UserPicker performance** — The search endpoint needs to be fast (<100ms). Add a DB index on `users.email` and `users.display_name` if not already present.
