# Admin Console Upgrade — Validation Checklist

**Branch:** `feature/admin`
**Date:** 2026-02-26

Start your local dev environment (`docker compose up` + `npm run dev` in admin), then:

## 1. Dashboard (`/`)
- [ ] Health cards show green for DB + Redis
- [ ] Metrics cards populate (user count, notebooks, etc.)
- [ ] **New:** Recent Actions table shows last 10 audit entries
- [ ] **New:** Stale Flags section appears if any flags have passed `stale_at`
- [ ] **New:** Active Flights section shows enabled flights with rollout bars

## 2. Users (`/users`)
- [ ] **New:** Status filter pills (All / Active / Suspended) work
- [ ] **New:** Sortable "Joined" and "Last Active" column headers (click to toggle sort)
- [ ] Search is debounced (type without pressing Enter)
- [ ] Click a user → slide panel opens with **4 tabs**: Overview, Groups & Flights, Flags, Sessions
- [ ] Sessions tab has **Force Logout** button — click it, verify toast confirms revocation

## 3. Feature Flags (`/feature-flags`)
- [ ] **New:** Filter tabs: Active / Archived / All
- [ ] **New:** Archive a flag → it disappears from Active, appears in Archived
- [ ] **New:** Flight badges appear on flags that belong to flights (clickable → navigates to flights)
- [ ] Override panel: **UserPicker** autocomplete replaces raw User ID input
- [ ] Pagination works

## 4. Flights (`/flights`)
- [ ] **New:** Visual rollout bar in detail panel (colored progress bar)
- [ ] **New:** UserPicker for assigning users (replaces raw User ID input)
- [ ] Flag keys in detail panel are clickable links to `/feature-flags`

## 5. Groups (`/groups`)
- [ ] **New:** UserPicker for adding members (replaces email text input)
- [ ] Pagination works

## 6. Navigation
- [ ] **New:** "Feature Management" collapsible section in sidebar containing Flags, Flights, Groups
- [ ] Auto-expands when you're on any of those pages

## 7. Audit Log (`/audit-log`)
- [ ] **New:** Date range filter (From / To date pickers)
- [ ] **New:** User filter text input
- [ ] **New:** Export CSV button → downloads a `.csv` file

## 8. Announcements (`/announcements`)
- [ ] **New:** Markdown preview shows side-by-side when creating/editing

## What's Next After Validation

1. **Merge to main** — once you're happy with the local experience
2. **Deploy** — build + push admin image as `admin:v0.3.0`, API as `api:v0.3.0` (migration 011 needs to run)
3. **Remaining work** from requirements that was deferred: bulk CSV user import, announcement scheduling, admin notifications, audit retention policies, dashboard customization
