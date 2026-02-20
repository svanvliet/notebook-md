# Demo Mode — Implementation Plan

## Problem
Users must create an account before they can try the app, which is a friction point. We want a "demo mode" that lets users explore the editor and create local notebooks without signing up — then seamlessly migrate their work when they do create an account.

## Approach
Add a `demoMode` state to the app that bypasses server-side auth while restricting features to local-only notebook operations. The demo uses the existing `anonymous` IndexedDB scope. On sign-up, we migrate notebooks from the anonymous DB to the new user's DB.

## UI Changes

### WelcomeScreen
- Add "Try it free — no account needed" button below Sign In / Sign Up, before OAuth section
- Styled as a text link or subtle outline button to avoid competing with primary CTAs

### MarketingNav
- Add "Try Demo" link next to the Sign In button

### TitleBar (when in demo mode)
- Account dropdown shows: "Demo Mode" label, Settings (allowed), "Create Account" CTA, "Exit Demo" option
- Hide: Account Settings, Admin Site, Sign Out

### NotebookPane / AddNotebookModal (demo mode)
- Only show "Local" source type in AddNotebookModal
- Remote types (GitHub, OneDrive, Google Drive) show a lock icon + "Sign up to connect cloud storage" CTA
- "Add Notebook" button still works for local notebooks

### DocumentPane (demo mode)
- Full editing works — no restrictions on the editor itself
- Publish/Discard buttons hidden (no remote sources)

### Demo Banner
- Thin, dismissible banner at top of main app view: "You're using Notebook.md in demo mode. [Create a free account] to connect cloud storage and sync across devices."

## Technical Changes

### 1. useAuth hook (`useAuth.ts`)
- Add `isDemoMode: boolean` to return value
- Add `enterDemoMode()` function — sets `isDemoMode = true`, creates a fake demo user (no API call needed)
- Add `exitDemoMode()` function — clears demo state, returns to WelcomeScreen
- `isSignedIn` should return `true` when in demo mode (so App.tsx renders the main UI)
- Demo state stored in `sessionStorage` (not localStorage) so it clears on tab close

### 2. App.tsx
- Pass `auth.isDemoMode` to child components that need to gate features
- On `handleSignUp`: if `isDemoMode`, migrate notebooks before completing sign-up
- Pass `onEnterDemo` callback to WelcomeScreen

### 3. localNotebookStore.ts
- Add `migrateAnonymousNotebooks(newUserId: string)` function:
  1. Open `notebook-md-anonymous` DB
  2. Read all notebooks and files
  3. Open `notebook-md-{newUserId}` DB
  4. Copy all records
  5. Delete `notebook-md-anonymous` DB
- This runs once during sign-up when transitioning from demo mode

### 4. AddNotebookModal — gate remote sources
- Accept `isDemoMode` prop
- When true: remote source types show "Sign up to connect" overlay/badge instead of being selectable

### 5. TitleBar — demo mode menu
- Accept `isDemoMode` prop
- Show "Demo Mode" header, Settings, Create Account CTA, Exit Demo

### 6. WelcomeScreen + MarketingNav — demo entry point
- Add `onEnterDemo` prop to WelcomeScreen
- Add "Try Demo" button/link to both components

## Todos

1. **demo-auth** — Add `isDemoMode`, `enterDemoMode()`, `exitDemoMode()` to useAuth hook
2. **demo-welcome** — Add "Try it free" button to WelcomeScreen + "Try Demo" to MarketingNav
3. **demo-app-gate** — Update App.tsx to handle demo mode (pass props, gate sign-up migration)
4. **demo-titlebar** — Update TitleBar dropdown for demo mode (Demo label, Create Account CTA, no Account Settings)
5. **demo-notebook-gate** — Gate remote sources in AddNotebookModal with sign-up CTAs
6. **demo-banner** — Add dismissible demo banner at top of main app view
7. **demo-migrate** — Add `migrateAnonymousNotebooks()` to localNotebookStore.ts, wire into sign-up flow
8. **demo-tests** — Add tests for demo auth state, migration, and gated features
