# Admin Console — Upgraded Experience Requirements

**Version:** 1.0  
**Date:** 2026-02-26  
**Status:** Draft — Pending Owner Review  

---

## 1. Problem Statement

The current admin console (`admin.notebookmd.io`) is functional but difficult to use at scale. Key pain points:

1. **Feature flags and flights feel disconnected** — they live on separate pages with no visual relationship, despite being parts of the same flighting subsystem. An admin must mentally map flags → flights → groups → assignments across 3 pages.
2. **User and group management is cumbersome** — adding users to groups or flag overrides requires typing raw user IDs or emails with no autocomplete or search. There's no way to see a user's complete flag/flight/group picture from one place.
3. **No shared UI components** — every page builds tables, forms, buttons, and badges from scratch with inline Tailwind. This causes visual inconsistencies (e.g., some pages use side panels, Users uses a modal; deletions sometimes confirm, sometimes don't).
4. **Missing operational polish** — no loading states, no error toasts, no success feedback, no undo, no bulk operations. Silent failures erode admin confidence.

---

## 2. Goals

1. **Unify the flighting experience** — merge Feature Flags, Flights, and Groups into a coherent "Feature Management" section where the relationship between flags, flights, rollout, and targeting is immediately clear.
2. **Make user management powerful** — full user profiles, quick actions, cross-referencing with flags/groups/flights, and autocomplete everywhere.
3. **Establish a component library** — extract reusable, consistent components (DataTable, Modal, Toast, Badge, UserPicker, ConfirmDialog) so all pages share the same interaction patterns.
4. **Add operational confidence** — loading states, error handling, success toasts, confirmation dialogs on all destructive actions, and audit trail visibility.

---

## 3. Information Architecture

### 3.1 Navigation Structure

```
📊  Dashboard
👤  Users
🚩  Feature Management
    ├── Feature Flags
    ├── Flights
    └── Groups
📢  Announcements
📋  Audit Log
⚙️  Settings (future)
```

**Key change:** Feature Flags, Flights, and Groups move under a single "Feature Management" section with a sub-nav, making the flighting subsystem a coherent unit.

### 3.2 Page-Level Requirements

#### Dashboard (`/`)
- Current: health status + basic metrics. This is adequate.
- **Add:** Quick-links to recent admin actions (last 5 audit entries) and any stale flags (past `stale_at` date).
- **Add:** Active announcement count and active flights summary.

#### Users (`/users`)
- See §4 (User Management).

#### Feature Management (`/features`)
- See §5 (Feature Management).

#### Announcements (`/announcements`)
- See §6 (Announcements).

#### Audit Log (`/audit-log`)
- See §7 (Audit Log).

---

## 4. User Management

### 4.1 User List (`/users`)

**Current state:** Paginated table with search. Adequate foundation but needs refinement.

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Debounced search (300ms, auto-submit) | P1 | Remove the explicit "Search" button; search as you type |
| Sortable columns (name, email, joined, status) | P1 | Click column header to sort |
| Filter by status (all / active / suspended) | P1 | Dropdown or toggle above table |
| Filter by role (all / admin / regular) | P2 | |
| Bulk actions (suspend, unsuspend) | P2 | Checkbox selection + bulk action dropdown |
| Show user avatar (or initials fallback) | P2 | Visual identification |
| "Last active" column | P2 | Most recent session timestamp |

### 4.2 User Detail (`/users/:id`)

**Current state:** Modal with basic info. Replace with a full page or slide-over panel.

The user detail view should be a **full page** (not a modal) with tabbed sections:

**Header:**
- Avatar / initials, display name, email, status badge, admin badge
- Quick actions: Suspend/Unsuspend, Reset Password (if applicable), Delete

**Tabs:**

| Tab | Content |
|-----|---------|
| **Overview** | Account info (email, display name, joined date, last active, 2FA status, identity providers) |
| **Notebooks** | List of user's notebooks (name, source type, file count, storage used, created date) |
| **Flags & Flights** | Resolved flag state for this user (computed values), which flights they're in, which groups they belong to, any per-user overrides. **This is the single place to see the complete flag picture for a user.** |
| **Activity** | Filtered audit log for this user (recent sign-ins, actions) |
| **Sessions** | Active sessions with device/IP info, ability to revoke individual sessions |

### 4.3 User Picker Component

A reusable autocomplete component used everywhere an admin needs to select a user:

| Requirement | Priority |
|-------------|----------|
| Search by email or display name | P1 |
| Debounced API search (300ms) | P1 |
| Show avatar + name + email in dropdown | P1 |
| Support multi-select mode (for bulk add to group) | P1 |
| Keyboard navigation (arrow keys + enter) | P2 |
| Recently selected users shortcut | P3 |

This replaces all raw ID/email text inputs across flag overrides, group members, and flight assignments.

---

## 5. Feature Management

### 5.1 Design Philosophy

The flighting system has three concepts: **Flags** (what), **Flights** (how/when), and **Groups** (who). Currently these live on separate pages with no cross-linking, forcing admins to context-switch. The redesign unifies them under a single section with deep cross-referencing.

### 5.2 Feature Flags (`/features/flags`)

**Current state:** Table + side panel for overrides. Functional but isolated.

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Show which flight(s) each flag belongs to (inline) | P1 | Clickable badge linking to the flight |
| Show override count per flag | P1 | e.g., "3 overrides" |
| Flag detail view (click to expand or navigate) | P1 | Shows: description, kill-switch status, associated flights, all overrides, created/updated dates |
| Stale flag indicator | P1 | Visual warning when past `stale_at` date |
| Search/filter flags | P1 | By name, by enabled/disabled, by flight |
| User picker for overrides | P1 | Replace raw user ID input with autocomplete (§4.3) |
| Override expiration date picker | P2 | Calendar/date input for `expires_at` |
| Variant management UI | P2 | Currently in schema but not exposed in UI |
| Flag creation wizard with flight association | P2 | Create flag + optionally add to existing/new flight in one flow |
| Bulk enable/disable flags | P3 | |

### 5.3 Flights (`/features/flights`)

**Current state:** Table + side panel. Core functionality exists but workflows are clunky.

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Visual rollout progress bar | P1 | Show percentage as a filled bar, not just a number |
| Flight detail page (full page, not side panel) | P1 | See below |
| User picker for user assignments | P1 | Replace raw user ID input (§4.3) |
| Inline flag preview | P1 | Show flag names with enabled/disabled status in flight list |
| Flight status summary | P1 | "3 flags, 2 groups, 45 users, 25% rollout" at a glance |
| Confirmation on rollout % change | P1 | Show estimated user impact before saving |
| Assignment summary | P2 | "Assigned to: Beta Testers (12 members), Internal (5 members), + 3 individual users" |

**Flight detail page layout:**

```
┌─────────────────────────────────────────────┐
│ Flight: Beta Cloud Features                 │
│ Status: ● Enabled    Rollout: [████░░] 25%  │
├─────────────────────────────────────────────┤
│ Flags (3)              │ Targeting           │
│ ┌───────────────────┐  │ Groups:             │
│ │ ☑ cloud_notebooks  │  │  • Beta Testers (12)│
│ │ ☑ cloud_sharing    │  │  • Internal (5)     │
│ │ ☑ cloud_collab     │  │ Users:              │
│ └───────────────────┘  │  • alice@...         │
│ [+ Add Flag]           │  • bob@...           │
│                        │ [+ Add Group/User]   │
├─────────────────────────────────────────────┤
│ Rollout: 25%  [━━━━━━━━━━░░░░░░░░░░] → 100% │
│ Badge: "Beta"  Show: ✓                       │
│ Est. reach: ~4 users (25% of 17 targeted)    │
└─────────────────────────────────────────────┘
```

### 5.4 Groups (`/features/groups`)

**Current state:** Table + side panel. Works but membership management is limited.

| Requirement | Priority | Notes |
|-------------|----------|-------|
| User picker for adding members | P1 | Replace email text input (§4.3) |
| Show which flights each group is assigned to | P1 | Clickable badges |
| Member count with link to member list | P1 | |
| Bulk add members (paste emails, CSV) | P2 | Text area that accepts multiple emails |
| Domain auto-membership preview | P2 | "12 existing users match @company.com" |
| Group detail page | P2 | Full member list with pagination, flight assignments, enrollment settings |
| Confirmation on member removal | P1 | Currently no confirmation |
| Confirmation on group deletion | P1 | Already exists, keep it |

### 5.5 Cross-Referencing

The key UX improvement: everything links to everything else.

| From | Links To |
|------|----------|
| Flag row | Flight(s) it belongs to |
| Flight row | Flags it contains, Groups/Users assigned |
| Group row | Flights it's assigned to, Member count → member list |
| User detail | Groups they're in, Flights targeting them, Flag overrides, Resolved flag state |
| Override row | User detail page |
| Assignment row | Group detail or User detail |

---

## 6. Announcements

### 6.1 Current State
Basic CRUD with title, body, and active toggle. Functional.

### 6.2 Requirements

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Markdown preview for body | P1 | Split or tabbed edit/preview |
| Scheduling UI (starts_at, ends_at) | P1 | Date pickers; already in API but not in UI |
| Announcement type selection | P2 | info / warning / critical — with color preview |
| Preview as user would see it | P2 | Render in a mock notification bar |
| Pagination | P3 | Only needed at scale |

---

## 7. Audit Log

### 7.1 Current State
Paginated table with action filter. Adequate but limited filtering.

### 7.2 Requirements

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Date range filter | P1 | Start date / End date pickers |
| User filter (autocomplete) | P1 | Filter by admin who performed action |
| Combined filters (action + user + date) | P1 | All filters composable |
| Formatted detail column | P1 | Currently shows raw JSON; render as readable key-value pairs |
| Export to CSV | P2 | Download filtered results |
| Link to affected entity | P2 | e.g., "Suspended user X" → link to user detail |
| Real-time streaming (new entries appear) | P3 | WebSocket or polling |

---

## 8. Shared Component Library

### 8.1 Rationale
Every page currently builds its own tables, buttons, forms, and badges from scratch. This causes:
- Visual inconsistency (different padding, colors, hover states)
- Behavioral inconsistency (some confirmations, some not)
- Repeated code that's hard to update globally

### 8.2 Required Components

| Component | Description | Used By |
|-----------|-------------|---------|
| **DataTable** | Sortable, paginated table with row selection. Accepts column definitions + data. Renders consistently everywhere. | All pages |
| **UserPicker** | Autocomplete search for user selection. Single or multi-select modes. | Flags, Flights, Groups, Audit Log filter |
| **ConfirmDialog** | Modal confirmation with customizable message, confirm/cancel buttons, and destructive variant (red button). | All destructive actions |
| **Toast** | Success/error/info notifications that appear top-right and auto-dismiss. | All pages after API calls |
| **Badge** | Colored status badges (enabled/disabled, active/suspended, admin, beta). Consistent colors. | All pages |
| **SlidePanel** | Right-side slide-over panel for detail views. Consistent width, header, close button. | Feature Management pages |
| **PageHeader** | Page title + description + action buttons. Consistent spacing. | All pages |
| **EmptyState** | Centered message with icon when a list is empty. | All list pages |
| **LoadingSpinner** | Consistent loading indicator for async operations. | All pages |
| **FormField** | Label + input + error message wrapper. Consistent form layout. | All forms |
| **DatePicker** | Date/time input for scheduling and filtering. | Announcements, Audit Log, Overrides |

### 8.3 Interaction Patterns (Global Rules)

| Pattern | Rule |
|---------|------|
| **Destructive actions** | Always show ConfirmDialog. Red button. Describe impact. |
| **Successful mutations** | Always show success Toast ("Flag updated", "User suspended"). |
| **Failed API calls** | Always show error Toast with actionable message. |
| **Loading states** | Disable buttons + show spinner during async operations. |
| **Empty states** | Show EmptyState component (not a blank page). |
| **Navigation** | Breadcrumbs on detail pages (e.g., Users > alice@example.com). |

---

## 9. Technical Requirements

### 9.1 API Changes Needed

| Endpoint | Change | Reason |
|----------|--------|--------|
| `GET /admin/users` | Add `sort`, `order`, `status` query params | Sortable columns, status filter |
| `GET /admin/users/:id` | Add `flags` field (resolved flag state) | User detail Flags tab |
| `GET /admin/users/search?q=` | New — lightweight user search for autocomplete | UserPicker component |
| `GET /admin/feature-flags` | Include `flights[]` and `override_count` in response | Cross-referencing on flag list |
| `GET /admin/flights` | Include `targeted_user_count` (estimated reach) | Rollout impact estimation |
| `GET /admin/groups/:id` | Add pagination for members | Large groups |
| `GET /admin/audit-log` | Add `start_date`, `end_date` query params | Date range filtering |
| `GET /admin/audit-log` | Add `format=csv` option | CSV export |

### 9.2 Frontend Architecture

| Decision | Choice | Reason |
|----------|--------|--------|
| Component library | Custom components in `src/components/ui/` | Lightweight, Tailwind-native, no external dependency |
| State management | Keep local state (useState) | Admin app is simple enough; no need for Redux/Zustand |
| Data fetching | Extract API functions to `src/api/` module | Currently mixed into useAdmin hook; separate concerns |
| Form handling | React Hook Form or keep manual | Manual is fine for the number of forms we have |
| Routing | Keep React Router 7 | Already in place |
| Toast system | Custom component + context provider | Same pattern as the main web app (useToast) |

### 9.3 Non-Requirements (Explicitly Out of Scope)

- **Role-based admin access** (viewer vs. editor admin) — all admins are equal for now
- **Admin API rate limiting** — trusted internal users only
- **Internationalization** — English only
- **Mobile responsive admin** — desktop-only is acceptable
- **Dark mode** — nice-to-have only, not required
- **Real-time updates** (WebSocket push for admin data) — polling or manual refresh is fine
- **Admin user creation via UI** — remains CLI-only per security requirements

---

## 10. Implementation Approach

### 10.1 Suggested Phases

**Phase 1: Component Library + Toast/Confirm**
Build the shared components (DataTable, ConfirmDialog, Toast, Badge, PageHeader, EmptyState, LoadingSpinner, FormField). Refactor existing pages to use them. This phase is purely visual/behavioral consistency — no new features.

**Phase 2: User Management Upgrade**
- UserPicker component (autocomplete search API + frontend)
- User detail full page with tabs (Overview, Notebooks, Flags & Flights, Activity, Sessions)
- Debounced search, sortable columns, status filter

**Phase 3: Feature Management Unification**
- Restructure nav (Feature Management section with sub-pages)
- Cross-reference flags ↔ flights ↔ groups with clickable links
- Flight detail page with visual rollout bar and targeting summary
- Replace all raw ID inputs with UserPicker
- Confirmation dialogs on all destructive actions

**Phase 4: Announcements + Audit Log Polish**
- Markdown preview for announcements
- Scheduling UI (date pickers)
- Audit log: date range filter, user filter, formatted details, CSV export

---

## 11. Open Questions for Owner

1. **User detail page vs. slide panel:** Should the user detail be a full-page route (`/users/:id`) or a wide slide-over panel? Full page allows more room for tabs; slide panel keeps the user list visible.

2. **Flight detail page vs. expanded row:** Same question for flights — full page (`/features/flights/:id`) or an expanded in-place view?

3. **Audit log retention:** Do we need to set a retention policy (e.g., keep 90 days) or keep everything indefinitely?

4. **Admin notifications:** Should admins get email/push notifications for certain events (e.g., user signup spikes, failed auth attempts)? Or is the dashboard + audit log sufficient?

5. **Feature flag archival:** Should there be a way to archive old flags (hide from default view but keep history) vs. just deleting them?

6. **Bulk user import:** Is there a need to import users from a CSV (e.g., for pre-populating beta tester groups), or is manual add-by-email sufficient?

7. **Dashboard customization:** Should the dashboard metrics be configurable (choose which metrics to show), or is the current fixed layout fine?

8. **Announcement targeting:** Should announcements be targetable to specific groups/users (like flights), or remain platform-wide only?

9. **Session management scope:** Should admins be able to force-logout all users of a specific type (e.g., all OAuth users), or just individual session revocation?

10. **Component library scope:** Should we consider using an existing Tailwind component library (e.g., Headless UI, Radix) for complex components like modals, dropdowns, and date pickers, or build everything custom?
