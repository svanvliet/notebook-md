# URL-Based Navigation & State Management Design

## Problem Statement

The app currently holds all navigation state (open tabs, active document, tree expansion) in React component state, with no URL representation. This means:

1. **No back/forward button support** — Switching between documents doesn't use browser history. Clicking back exits the app entirely.
2. **Page refresh loses all state** — Open tabs, active document, and tree expansion state are lost on refresh.
3. **No deep linking** — You can't share or bookmark a URL to a specific document.
4. **Markdown links don't integrate with history** — Clicking a relative `.md` link opens a tab but doesn't push to browser history, so back doesn't return to the previous document.
5. **No return-to-context on auth** — If a user navigates to a deep link while unauthenticated, there's no mechanism to redirect back after login.

## Proposed URL Structure

### Route Hierarchy

```
/                                          → Marketing home / Welcome screen
/features, /about, /contact, /terms, etc.  → Marketing pages
/app                                       → Main app (no doc open, empty canvas)
/app/:notebookName                         → App with notebook expanded in tree
/app/:notebookName/*filePath               → App with specific file open
/demo                                      → Demo mode entry point
/demo/:notebookName/*filePath              → Demo mode with file open
```

### Examples

```
/app/My%20GitHub%20Repo/README.md
/app/Work%20Notes/2026/February/standup.md
/app/My%20GitHub%20Repo/docs/api/endpoints.md
/demo/Demo%20Notebook/Getting%20Started.md
/demo/Demo%20Notebook/Basics/Markdown%20Essentials.md
```

### Why Path-Based (Not Hash-Based)

| Consideration | Path-based (`/app/Notebook/file.md`) | Hash-based (`/app#Notebook/file.md`) |
|---|---|---|
| Browser history | Native `pushState` via React Router | Requires manual `hashchange` handling |
| React Router integration | First-class `<Route>` matching | Bypasses router, needs custom parsing |
| URL cleanliness | `/app/My%20Notebook/doc.md` | `/app#My%20Notebook/doc.md` |
| Server config | Needs SPA fallback (already configured) | No server changes |
| Future SSR/sharing | Compatible | Fragments not sent to server |

Since we already have SPA fallback routing configured for our deployment, path-based is the better choice.

### Notebook Identification in URLs

Use the **notebook display name** (URL-encoded) for human-readable URLs:
- `My%20GitHub%20Repo` not `a1b2c3d4-uuid`
- If two notebooks share a name (rare, different sources), append source suffix: `My%20Notes%20(GitHub)`, `My%20Notes%20(OneDrive)`

Internally, the app resolves the URL name to the notebook's internal ID on route match.

---

## Browser History Behavior

### Document Navigation

| Action | History Effect | URL Change |
|---|---|---|
| Click file in tree | `push` | → `/app/Notebook/path/file.md` |
| Click relative `.md` link | `push` | → `/app/Notebook/resolved/path.md` |
| Switch tab by clicking | `push` | → `/app/Notebook/other-file.md` |
| Close active tab | `replace` | → URL of new active tab (or `/app`) |
| Close non-active tab | none | URL unchanged |
| Browser back | `pop` | → Previous document |
| Browser forward | `pop` | → Next document |

### Key Design Decision: Push vs Replace

**Tab switches push to history.** This means back/forward navigates between recently viewed documents, which is the expected behavior (matches VS Code, browser tabs, etc.).

**Tab closes use replace.** If you close a tab, going back shouldn't reopen it — that's confusing. Instead, we replace the current history entry with the new active tab's URL.

### History Entry Deduplication

To avoid polluting history with repeated switches between the same two tabs, we can **coalesce**: if the user navigates A → B → A → B, the history should be `[A, B]`, not `[A, B, A, B]`. Implementation: before pushing, check if the new URL matches the current location — if so, `replace` instead of `push`.

---

## Session Persistence (Survive Page Refresh)

### What to Persist

| State | Storage | Key |
|---|---|---|
| Open tab list (IDs + order) | `sessionStorage` | `nb:tabs` |
| Active tab ID | URL (source of truth) | — |
| Tab scroll positions | `sessionStorage` | `nb:scroll:{tabId}` |
| Tree expanded notebooks | `sessionStorage` | `nb:tree:notebooks` |
| Tree expanded folders | `sessionStorage` | `nb:tree:folders` |
| Unsaved content (dirty buffers) | `IndexedDB` | `nb:draft:{tabId}` |

### Why sessionStorage (Not localStorage)

- `sessionStorage` is scoped to a browser tab — two browser tabs can have different sets of open documents without conflict.
- `localStorage` would cause cross-tab interference (tab A's state overwriting tab B's).
- Unsaved drafts use IndexedDB because they can be large and we want durability.

### Restoration Flow on Refresh

```
1. App mounts
2. React Router matches URL → e.g. /app/Demo%20Notebook/Getting%20Started.md
3. Read sessionStorage → get list of previously open tabs
4. Read sessionStorage → get tree expansion state
5. For each tab in the list:
   a. Fetch file content from backend (IndexedDB/GitHub/etc.)
   b. Check IndexedDB for unsaved draft → if exists, use draft content, mark dirty
   c. Create tab in state
6. Set active tab from URL (overrides whatever was stored)
7. Restore tree expansion state
8. Scroll to saved position for active tab
```

### Draft Persistence for Unsaved Changes

Currently, unsaved changes are lost on refresh. With IndexedDB drafts:

```typescript
// On content change (debounced, ~2s):
await idb.put('drafts', { tabId, content: htmlContent, timestamp: Date.now() })

// On successful save:
await idb.delete('drafts', tabId)

// On restore:
const draft = await idb.get('drafts', tabId)
if (draft && draft.timestamp > file.lastModified) {
  // Show "recovered unsaved changes" indicator on tab
  tab.content = draft.content
  tab.hasUnsavedChanges = true
}
```

---

## Markdown Link Integration

### Current Flow (Problems)
```
Click .md link → CustomEvent('notebook-link-click')
  → useNotebookManager handler resolves path
  → handleOpenFile(notebookId, resolvedPath)
  → Tab opens, but NO URL change, NO history entry
```

### Proposed Flow
```
Click .md link → CustomEvent('notebook-link-click')
  → Handler resolves relative path to absolute notebook path
  → navigate(`/app/${notebookName}/${resolvedPath}`)
  → React Router triggers route change
  → Route change handler opens tab (or switches to existing)
  → Browser history entry created automatically
```

This means:
- Back button after clicking a link returns to the previous document ✅
- The URL always reflects what's on screen ✅
- Links become shareable ✅

### External vs Internal Link Handling

```
href starts with http://, https://, etc. → target="_blank" (external)
href ends with .md (no protocol)          → resolve relative to current file, navigate internally
href is a #fragment                       → scroll within current document
everything else                           → treat as external (target="_blank")
```

---

## Route-Driven Architecture

### New Router Configuration

```tsx
<Routes>
  {/* Marketing */}
  <Route path="/" element={<MarketingOrApp />} />
  <Route path="/features" element={<FeaturesPage />} />
  <Route path="/about" element={<AboutPage />} />
  <Route path="/contact" element={<ContactPage />} />
  <Route path="/terms" element={<TermsPage />} />
  <Route path="/privacy" element={<PrivacyPage />} />
  
  {/* Auth callbacks */}
  <Route path="/app/magic-link" element={<MagicLinkHandler />} />
  <Route path="/app/verify-email" element={<VerifyEmailHandler />} />
  
  {/* Main app */}
  <Route path="/app" element={<App />} />
  <Route path="/app/:notebookName/*" element={<App />} />
  
  {/* Demo mode */}
  <Route path="/demo" element={<App demo />} />
  <Route path="/demo/:notebookName/*" element={<App demo />} />
  
  {/* Fallback */}
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

### Route-to-State Synchronization Hook: `useDocumentRoute`

A new custom hook that bridges React Router and the notebook manager:

```typescript
function useDocumentRoute(notebookManager: NotebookManager) {
  const { notebookName, '*': filePath } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  // URL → State: When URL changes (including back/forward), open the document
  useEffect(() => {
    if (notebookName && filePath) {
      const notebookId = resolveNotebookId(notebookName, notebookManager.notebooks)
      if (notebookId) {
        notebookManager.handleOpenFile(notebookId, filePath)
      }
    }
  }, [notebookName, filePath])

  // State → URL: When active tab changes (via tree click, etc.), update URL
  useEffect(() => {
    if (notebookManager.activeTabId) {
      const [nbId, ...pathParts] = notebookManager.activeTabId.split(':')
      const nbName = notebookManager.getNotebookName(nbId)
      const newPath = `/app/${encodeURIComponent(nbName)}/${pathParts.join(':')}`
      if (location.pathname !== newPath) {
        navigate(newPath, { replace: false })  // push
      }
    }
  }, [notebookManager.activeTabId])
  
  // Expose navigation function for link clicks, tree clicks, etc.
  const navigateToFile = (notebookId: string, path: string) => {
    const nbName = notebookManager.getNotebookName(notebookId)
    navigate(`/app/${encodeURIComponent(nbName)}/${path}`)
    // The URL→State effect above will handle opening the file
  }

  return { navigateToFile }
}
```

### Avoiding Infinite Loops

The bidirectional sync (URL↔State) needs care to avoid loops:

```
URL changes → effect opens file → activeTabId changes → effect updates URL → ...
```

Solution: **Compare before acting.** Both effects check if the change is already reflected:
- URL→State: Skip if `activeTabId` already matches the URL
- State→URL: Skip if `location.pathname` already matches the active tab

---

## Demo Mode Considerations

### URL Scheme for Demo

```
/demo                                        → Enter demo mode, open default file
/demo/Demo%20Notebook/Getting%20Started.md   → Demo with specific file
```

- Demo URLs don't require authentication
- Demo URLs are shareable — anyone can open `/demo/Demo%20Notebook/Basics/Markdown%20Essentials.md`
- "Try Demo" button navigates to `/demo` which triggers demo mode entry + opens default file
- Relative links within demo content navigate within `/demo/...` namespace

### Demo-to-App Transition

When a demo user signs up:
```
/demo/Demo%20Notebook/file.md → sign up → /app (fresh start, demo notebook removed)
```

---

## Edge Cases & Error Handling

### File Not Found
URL points to a file that doesn't exist (deleted, renamed, wrong URL):
- Show a toast: "File not found: {path}"
- Remove the invalid tab
- Navigate to `/app` (or the next valid open tab)

### Notebook Not Found
URL contains a notebook name that isn't connected:
- Show a toast: "Notebook not found: {name}"
- Navigate to `/app`

### Unauthenticated Deep Link
User navigates to `/app/My%20Notebook/file.md` but isn't logged in:
- Store intended URL in `sessionStorage` (`nb:returnTo`)
- Show login/welcome screen
- After successful auth, redirect to stored URL
- Clear `nb:returnTo`

### Concurrent Tabs (Multiple Browser Tabs)
Each browser tab has independent `sessionStorage`, so:
- Tab A can have `/app/Notebook/file1.md` open
- Tab B can have `/app/Notebook/file2.md` open
- No conflict (unlike localStorage which is shared)
- Draft persistence in IndexedDB is shared — last writer wins for unsaved drafts. Could add tab-id scoping if needed.

### URL with Special Characters
File paths may contain spaces, unicode, special chars:
- Use `encodeURIComponent()` for each path segment
- Decode with `decodeURIComponent()` on route match
- Example: `Héllo Wörld.md` → `H%C3%A9llo%20W%C3%B6rld.md`

---

## Implementation Phases

### Phase 1: URL Routing Foundation
- Add `/app/:notebookName/*` and `/demo/:notebookName/*` routes
- Create `useDocumentRoute` hook
- Wire tree clicks and tab switches to `navigate()`
- Wire markdown link clicks to `navigate()` instead of `handleOpenFile` directly
- Browser back/forward works for document navigation

### Phase 2: Session Persistence
- Persist open tabs list to `sessionStorage` on every tab open/close
- Persist tree expansion state to `sessionStorage`
- Restore tabs and tree state on page refresh
- Active tab determined by URL (not stored separately)

### Phase 3: Draft Recovery
- Save dirty content to IndexedDB on content change (debounced)
- Clear drafts on successful save
- On restore, check for drafts newer than saved content
- Show "recovered" indicator on tabs with restored drafts

### Phase 4: Auth-Aware Deep Links
- Store return URL on unauthenticated access to `/app/...`
- Redirect after login
- Handle demo→app transitions

### Phase 5: Polish & Edge Cases
- History deduplication (coalesce repeated tab switches)
- Tab scroll position persistence
- Error handling for invalid URLs (missing notebook/file)
- Keyboard shortcut integration (Ctrl+Tab cycles tabs + updates URL)

---

## Files Likely to Change

| File | Changes |
|---|---|
| `Router.tsx` | Add `/app/:notebookName/*` and `/demo/...` routes |
| `App.tsx` | Accept route params, wire `useDocumentRoute` |
| `useNotebookManager.ts` | Expose `navigateToFile`, decouple tab switching from direct state mutation |
| `DocumentPane.tsx` | Tab clicks call `navigateToFile` instead of `onTabSelect` directly |
| `NotebookPane.tsx` / `NotebookTree.tsx` | File clicks call `navigateToFile`; persist/restore expansion |
| `MarkdownEditor.tsx` | Link click handler uses `navigateToFile` |
| `extensions.ts` | No change (link rendering stays the same) |
| `WelcomeScreen.tsx` | "Try Demo" navigates to `/demo` |
| `useAuth.ts` | Store/restore return URL for deep links |
| New: `useDocumentRoute.ts` | Hook bridging React Router ↔ notebook manager |
| New: `useSessionPersistence.ts` | Hook for sessionStorage/IndexedDB persistence |

---

## Resolved Design Decisions

1. **Tab order in URL:** No — only the active tab is in the URL. Other open tabs persist in `sessionStorage`.

2. **Multi-file URLs:** No — `sessionStorage` handles open tab lists.

3. **Split view in URL:** No — split view state is persisted in `sessionStorage`. When a URL is loaded, split view is restored from session state, not the URL.

4. **Notebook name uniqueness:** Notebook names must be unique across all sources. Since remote notebooks can be given custom names, this is not restrictive. **Action item:** Add validation in Add Notebook (local + remote) and Rename Notebook flows to enforce uniqueness, with appropriate error messages so users can provide a unique name.

5. **Close all tabs:** Navigates to `/app` — the natural empty state.
---

## Implementation Status (2026-02-22)

**Status: COMPLETE ✅**

All five design phases have been implemented and tested:

### Phase 1: Routing Foundation ✅
- Routes: `/app/:notebookName/*`, `/demo/:notebookName/*`, auth callbacks
- `useDocumentRoute` hook: bidirectional URL↔State sync with refs for stale closure prevention
- `navigateToFile` for programmatic navigation (tree clicks, link clicks)

### Phase 2: Browser History ✅
- Document switches push history entries; back/forward navigates between documents
- Tab close uses `history.replace` via `markReplaceNext`
- Close all tabs navigates to `/app` or `/demo`

### Phase 3: Session Persistence ✅
- Tab persistence: `sessionStorage('nb:tabs')` with coordinated `restoreTabs` flow
- Tree expansion: `sessionStorage('nb:tree:notebooks')` and `nb:tree:folders`
- Remote notebook auto-reload on expansion restore
- Demo mode persistence via `sessionStorage('notebookmd:demoMode')`

### Phase 4: Link Integration ✅
- App URL links (`/app/...`, `/demo/...`): routed via React Router `navigate()`
- Relative `.md` links: resolved against current document directory
- External URLs: opened in new tab with `target="_blank"`
- Fixed duplicate StarterKit Link extension that caused spurious browser tab spawns

### Phase 5: Polish & Edge Cases ✅
- Deep link in new window: `nb:returnTo` for post-login redirect
- URL stripping prevention: `hadActiveTabRef` prevents premature URL clearing
- `initialLoadComplete` gate prevents URL→State during restoration
- Notebook name uniqueness validation (case-insensitive) in Add/Rename flows

### Key Files Created/Modified
| File | Role |
|---|---|
| `useDocumentRoute.ts` | URL↔State bridge hook |
| `useSessionPersistence.ts` | sessionStorage utilities |
| `App.tsx` | Orchestration: restoration, demo init, deep links |
| `useNotebookManager.ts` | `restoreTabs`, tab persistence, dedup guards |
| `NotebookTree.tsx` | Tree state persistence, remote notebook reload |
| `MarkdownEditor.tsx` | Link click interception (app/relative/external) |
| `extensions.ts` | Disabled duplicate StarterKit Link/Underline |
| `AddNotebookModal.tsx` | Notebook name uniqueness validation |
| `Router.tsx` | Document deep link routes |

### Tests
- 30 unit tests: `documentRoute.test.ts` (12), `sessionPersistence.test.ts` (8), `notebookNameUniqueness.test.ts` (10)
- 6 E2E tests: `e2e/navigation.spec.ts`
