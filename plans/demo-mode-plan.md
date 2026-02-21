# Demo Mode — Implementation Plan

**Status:** ✅ Complete (implemented 2026-02-20)

## Problem
Users must create an account before they can try the app, which is a friction point. We want a "demo mode" that lets users explore the editor and create local notebooks without signing up — then seamlessly migrate their work when they do create an account.

## Approach
Add a `demoMode` state to the app that bypasses server-side auth while restricting features to local-only notebook operations. The demo uses the existing `anonymous` IndexedDB scope. On sign-up, we migrate notebooks from the anonymous DB to the new user's DB.

## UI Changes

### WelcomeScreen ✅
- "Try it free — no account needed" button displayed prominently above Sign In button as a primary blue CTA
- Clicking navigates directly into demo mode

### MarketingNav ✅
- "Try Demo" button next to Sign In, visible on all public pages (Home, Features, About, Contact)
- Uses `navigate('/', { state: { enterDemo: true } })` pattern for cross-page state delivery

### TitleBar (when in demo mode) ✅
- Account dropdown shows: "Demo Mode" label, Settings (allowed), "Create Account" CTA, "Exit Demo" option
- Account Settings, Admin Site, and Sign Out are hidden
- "Create Account" navigates directly to sign-up form (not welcome screen buttons)

### NotebookPane / AddNotebookModal (demo mode) ✅
- Only "Local" source type is selectable in AddNotebookModal
- Remote types (GitHub, OneDrive, Google Drive) show clickable "Sign up to connect →" links that navigate to sign-up form
- "Add Notebook" button still works for local notebooks

### DocumentPane (demo mode) ✅
- Full editing works — no restrictions on the editor itself
- Publish/Discard buttons hidden (no remote sources)

### Demo Banner ✅
- Dismissible blue banner at top of main app view: "You're using Notebook.md in demo mode. Create a free account to connect cloud storage and sync across devices."
- "Create a free account" link navigates directly to sign-up form

## Technical Changes

### 1. useAuth hook (`useAuth.ts`) ✅
- Added `isDemoMode: boolean` to return value
- Added `enterDemoMode()` — sets `isDemoMode = true`, creates synthetic demo user (`{ id: 'demo-user', ... }`)
- Added `exitDemoMode()` — clears demo state, returns to WelcomeScreen
- `isSignedIn` returns `true` when in demo mode so App.tsx renders the main UI
- Demo state stored in `sessionStorage` (`notebookmd:demoMode`) — clears on tab close
- `signUp` clears demo mode on success

### 2. App.tsx ✅
- Passes `auth.isDemoMode` to TitleBar, AddNotebookModal, and other gated components
- On `handleSignUp`: detects `wasDemoMode` flag and calls `migrateAnonymousNotebooks(newUserId)` before completing
- Passes `onEnterDemo` callback to WelcomeScreen
- Handles `enterDemo` and `signIn` navigation state from content pages via `useLocation().state`
- `welcomeView` state manages direct-to-form navigation (`'signin'` or `'signup'`)

### 3. localNotebookStore.ts ✅
- Added `migrateAnonymousNotebooks(newUserId: string)` function:
  1. Opens `notebook-md-anonymous` DB
  2. Reads all notebooks and files
  3. Opens `notebook-md-{newUserId}` DB
  4. Copies all records (with sortOrder offset to avoid conflicts)
  5. Deletes `notebook-md-anonymous` DB via `deleteDB()` from `idb`
- Returns count of migrated notebooks
- Called once during sign-up when transitioning from demo mode

### 4. AddNotebookModal — gate remote sources ✅
- Accepts `isDemoMode` and `onDemoSignUp` props
- When in demo mode: remote source types show clickable "Sign up to connect →" links
- Links call `onDemoSignUp` which navigates to sign-up form

### 5. TitleBar — demo mode menu ✅
- Accepts `isDemoMode`, `onExitDemo`, `onCreateAccount` props
- Shows "Demo Mode" header, Settings, Create Account CTA, Exit Demo

### 6. WelcomeScreen + MarketingNav — demo entry point ✅
- WelcomeScreen accepts `onEnterDemo` and `initialView` props
- MarketingNav "Try Demo" button uses `navigate()` with state for cross-page delivery
- MarketingNav "Sign In" button uses `navigate()` (not `<Link>`) for reliable state re-trigger

### 7. WelcomeScreen — proper HTML semantics ✅
- Content area wrapped in `<main>` tag for proper semantics and E2E test scoping

## UX Refinements Applied ✅
- "Try it free" moved above Sign In as primary CTA (not below Sign Up)
- Separator between Sign Up and OAuth section removed for cleaner flow
- Spacing tightened between separator and "Already have an account" text (pt-6 → pt-4)
- Spacing tightened between tagline and "Try it free" button (mb-8 → mb-6)
- Sign In button behavior stabilized (one-shot `welcomeView` pattern with auto-clear)
- `welcomeView` useState declarations moved before useEffects to fix initialization error
- E2E tests updated to scope `Sign In` selectors via `getByRole('navigation')` and `getByRole('main')`

## Todos

1. ~~**demo-auth** — Add `isDemoMode`, `enterDemoMode()`, `exitDemoMode()` to useAuth hook~~ ✅
2. ~~**demo-welcome** — Add "Try it free" button to WelcomeScreen + "Try Demo" to MarketingNav~~ ✅
3. ~~**demo-app-gate** — Update App.tsx to handle demo mode (pass props, gate sign-up migration)~~ ✅
4. ~~**demo-titlebar** — Update TitleBar dropdown for demo mode~~ ✅
5. ~~**demo-notebook-gate** — Gate remote sources in AddNotebookModal with sign-up CTAs~~ ✅
6. ~~**demo-banner** — Add dismissible demo banner at top of main app view~~ ✅
7. ~~**demo-migrate** — Add `migrateAnonymousNotebooks()` to localNotebookStore.ts~~ ✅
8. **demo-tests** — Add tests for demo auth state, migration, and gated features (pending)

## Commits
- `c3825d5` — Add demo mode (core implementation)
- `bd8bb04` — Fix demo mode UX (navigation, CTAs, sign-up links)
- `55c150b` — Nav Sign In → sign-in form
- `ceec1f2` — Spacing tweak (pt-6 → pt-4)
- `764633e` — Spacing tweak (mb-8 → mb-6)
- `909bf63` — Fix sticky welcomeView
- `59d42c9` — Fix welcomeView declaration order
- `d315f89` — Fix E2E: scope Sign In selectors
