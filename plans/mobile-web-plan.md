# Mobile Web Optimization Plan

## Problem Statement

Notebook.md is fully functional on mobile browsers but the UX is unintuitive. The app was designed desktop-first with no responsive breakpoints, causing layout overflow, cramped navigation, and unusable editing workflows on phones and small tablets. This plan addresses mobile web (portrait phones ≤ 430px, landscape phones ≤ 932px, tablets ≤ 1024px) — not native apps.

## Observed Issues (from iPhone 14 & iPad Pro 11 screenshots)

### Marketing Navigation (all marketing pages)
- **Nav items overflow**: "Notebook.md", DEV badge, "Features", "About", "Contact", "Try Demo", "Sign In" all crammed into one row
- **"Features" text hidden**: Partially obscured behind the DEV badge's absolute positioning
- **Touch targets too small**: Nav links are plain text with no padding — hard to tap accurately
- **No hamburger menu**: Standard mobile pattern missing entirely

### Welcome / Sign-In Page
- ✅ Content is actually fine — single-column card layout works well on mobile
- ✅ OAuth buttons, Sign In, Sign Up, "Try it free" CTA all render properly
- Minor: Cookie consent banner takes significant vertical space on small screens

### Features Page
- ✅ Feature cards stack vertically and are readable — this page works well
- Nav overflow is the only issue (same as all marketing pages)

### About Page
- ✅ Single-column prose works well on mobile
- ✅ Checklist items, CTA button all render properly

### Contact Page
- ✅ Form fields and cards render well
- ✅ Single-column layout is mobile-friendly

### App View (tablet screenshot — the only one that shows the actual editor)
- **Notebook pane**: Takes ~280px fixed width on the left, squeezing the editor
- **Editor toolbar**: 15+ buttons across two rows — wraps and takes up significant vertical space
- **Tab bar**: Works but will overflow with multiple open files
- **Status bar**: Fits on tablet, but will be cramped on phone
- **No way to hide notebook pane on mobile** to reclaim screen width

### Issues Not Visible in Screenshots (inferred from code analysis)
- **Slash commands**: Type `/` to get a dropdown — works on desktop keyboards but unintuitive on mobile (virtual keyboard blocks the dropdown)
- **Right-click context menus**: Not available on mobile (long-press doesn't trigger)
- **Split view (Markdown/WYSIWYG)**: Hard-coded `w-1/2` — unusable on phone width
- **Modals** (Account, Settings): Fixed widths (`w-48`, `max-w-lg`) may not fit phone screens
- **Toolbar button padding**: `p-1.5` (6px) — well below the 44px minimum touch target

---

## Implementation Plan

### Phase 1: Mobile Navigation (Marketing Pages)

**Goal**: Replace inline nav links with a hamburger menu on mobile.

#### 1.1 — Hamburger Menu for MarketingNav
- Add a `≡` (hamburger) button visible only on `md:hidden`
- Hide inline nav links with `hidden md:flex`
- On tap, open a slide-down panel or full-screen overlay with:
  - Features, About, Contact (as links)
  - Try Demo (as a button)
  - Sign In (as a button)
- Close on: tap outside, tap a link, tap ✕ button, press Escape
- Animate with CSS transition (slide down or fade in)
- DEV badge remains visible in the header (not moved into the menu)

#### 1.2 — Touch Target Improvements (Nav)
- Add `py-2 px-3` minimum padding to all nav links
- Ensure all interactive elements are ≥ 44×44px tap area

**Breakpoint**: `md` (768px) — below this, show hamburger; above, show inline nav

---

### Phase 2: App Layout — Responsive Notebook Pane

**Goal**: On mobile, the notebook pane should be a toggleable overlay/drawer instead of a fixed sidebar.

#### 2.1 — Collapsible Notebook Pane on Mobile
- Below `md` breakpoint:
  - Hide the notebook pane by default
  - Add a `☰` or folder icon toggle button in the TitleBar (left side)
  - When toggled, notebook pane slides in as a full-height overlay (left drawer) with semi-transparent backdrop
  - Tapping a file opens it AND closes the drawer
  - Tapping the backdrop closes the drawer
  - Swipe-left gesture to dismiss (stretch goal)
- Above `md` breakpoint: current behavior unchanged (persistent sidebar)

#### 2.2 — Responsive Layout Container
- The main app flex container (`flex` with sidebar + editor) needs:
  - `md:flex-row` (desktop: side by side)
  - On mobile: editor takes full width, notebook pane is an overlay
- Editor should expand to `w-full` when pane is hidden

**State management**: Add `isMobilePaneOpen` state to the layout, with a context or prop for the toggle button.

---

### Phase 3: Editor Toolbar — Compact Mobile Toolbar

**Goal**: Show a streamlined, touch-friendly toolbar on mobile.

#### 3.1 — Two-Tier Toolbar Strategy
- **Primary toolbar** (always visible on mobile): 6-7 most common actions
  - Heading dropdown, Bold, Italic, List (unordered), Checklist, Link, **⋯ More**
- **Overflow menu** ("⋯ More" button): Opens a grid/panel with remaining actions
  - Underline, Strikethrough, Code, Code Block, Ordered List, Blockquote, Table, Image, Horizontal Rule, Undo, Redo, Print
  - Displayed as a dropdown grid (3-4 columns) with icon + label
- Above `md` breakpoint: show full toolbar as-is (current behavior)

#### 3.2 — Touch-Friendly Button Sizing
- Increase toolbar button minimum size to `min-w-[44px] min-h-[44px]`
- Add `p-2` padding (up from `p-1.5`)
- Use `gap-1` between buttons to prevent accidental taps

#### 3.3 — Sticky Toolbar
- On mobile, make the toolbar `sticky top-0 z-10` so it stays visible while scrolling the document
- Ensures formatting controls are always accessible without scrolling up

---

### Phase 4: Tab Bar — Mobile-Friendly Tabs

**Goal**: Handle multiple open files gracefully on narrow screens.

#### 4.1 — Scrollable Tab Bar
- Make the tab container horizontally scrollable (`overflow-x-auto`) with hidden scrollbar
- Active tab should auto-scroll into view
- Each tab gets a minimum width so text isn't truncated to unreadable lengths

#### 4.2 — Tab Overflow Indicator (stretch goal)
- When tabs overflow, show a small `▼` dropdown at the right edge
- Dropdown lists all open files — tap to switch
- Badge on the dropdown shows count of hidden tabs

---

### Phase 5: Mobile Input — Slash Commands & Context Menus

**Goal**: Make text insertion and file management work naturally on mobile.

#### 5.1 — Floating Action Button (FAB) for Insert
- Add a small floating `+` button anchored to the bottom-right of the editor on mobile
- Tap to open the same slash command menu (headings, lists, tables, code blocks, etc.)
- Positioned above the virtual keyboard when it's open
- Hidden on desktop (`md:hidden`)

#### 5.2 — Long-Press Context Menu
- Add `onContextMenu` and `onTouchStart`/`onTouchEnd` (500ms hold) handlers to notebook tree items
- Show the same context menu (Rename, Delete, New File, New Folder) as a bottom sheet on mobile
- Bottom sheets are more natural than floating context menus on mobile

#### 5.3 — Swipe Actions on Tree Items (stretch goal)
- Swipe left on a file → Delete
- Swipe right → Rename
- Common mobile pattern (iOS Mail, etc.)

---

### Phase 6: Modal Dialogs — Responsive Modals

**Goal**: Modals should be full-screen or near-full-screen on mobile.

#### 6.1 — Full-Width Modals on Mobile
- Below `md` breakpoint:
  - Modals expand to `w-full h-full` or `w-[95vw] max-h-[90vh]`
  - Remove fixed `max-w-lg` / `max-w-sm` constraints
  - Add `rounded-none` or `rounded-t-xl` for bottom-sheet style
- Affected modals: Account, Settings, Add Notebook, Sign In/Up, Confirm dialogs

#### 6.2 — Bottom Sheet Pattern for Small Modals
- For confirmation dialogs and small option menus:
  - Slide up from bottom on mobile (bottom sheet)
  - Easier to reach with thumbs than centered modals

---

### Phase 7: Status Bar — Minimal Mobile Status

**Goal**: Reduce status bar footprint on mobile.

#### 7.1 — Condensed Status Bar
- Below `md` breakpoint:
  - Show only: word count + save status (hide line/column count, character count)
  - Reduce font size to `text-[10px]`
  - Reduce height from `h-6` to `h-5`
- Flash messages still appear in full

---

### Phase 8: General Polish

#### 8.1 — Viewport & Font Size
- Ensure `<meta name="viewport" content="width=device-width, initial-scale=1">` is set (likely already present)
- Set `font-size: 16px` on inputs to prevent iOS auto-zoom on focus

#### 8.2 — Cookie Consent Banner
- On mobile, the cookie banner takes ~15% of the viewport
- Make it more compact: single line with inline buttons, or a slim bottom bar

#### 8.3 — Safe Area Insets
- Add `env(safe-area-inset-bottom)` padding for devices with home indicator (iPhone X+)
- Prevents status bar and FAB from being hidden behind the home indicator

#### 8.4 — Orientation Change Handling
- Test that layout recalculates properly on rotate
- Notebook pane drawer should close on orientation change
- Toolbar should re-layout without flicker

---

## Implementation Priority & Order

| Priority | Phase | Effort | Impact |
|----------|-------|--------|--------|
| 🔴 P0 | Phase 1 — Mobile Nav | Small | High — currently broken, nav items overlap |
| 🔴 P0 | Phase 2 — Notebook Pane | Medium | High — unusable editor space on phones |
| 🟠 P1 | Phase 3 — Editor Toolbar | Medium | High — toolbar overwhelms on mobile |
| 🟠 P1 | Phase 6 — Responsive Modals | Small | Medium — usability improvement |
| 🟡 P2 | Phase 4 — Tab Bar | Small | Medium — needed for multi-file workflows |
| 🟡 P2 | Phase 5 — Mobile Input | Medium | Medium — alternative to slash commands |
| 🟢 P3 | Phase 7 — Status Bar | Small | Low — minor space savings |
| 🟢 P3 | Phase 8 — General Polish | Small | Low — fit and finish |

**Recommended order**: Phase 1 → Phase 2 → Phase 3 → Phase 6 → Phase 4 → Phase 5 → Phase 7 → Phase 8

---

## Breakpoint Strategy

Use Tailwind's default breakpoints (no custom config needed):

| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Default (mobile-first) | < 640px | Phone portrait — hamburger nav, drawer pane, compact toolbar, FAB |
| `sm` | ≥ 640px | Phone landscape — same as default, slightly more toolbar space |
| `md` | ≥ 768px | Tablet portrait — inline nav, persistent sidebar option, full toolbar |
| `lg` | ≥ 1024px | Tablet landscape / desktop — full desktop layout |

**Approach**: Mobile-first responsive additions using `md:` prefix. No existing desktop styles will change — we only add mobile overrides.

---

## Technical Approach

### No New Dependencies
All changes use existing Tailwind CSS responsive utilities and React state. No new libraries needed.

### Component Changes (Summary)

| Component | Changes |
|-----------|---------|
| `MarketingLayout.tsx` | Add hamburger button, mobile menu overlay, hide inline nav on mobile |
| `TitleBar.tsx` | Add notebook pane toggle button on mobile |
| `NotebookPane.tsx` | Add overlay/drawer behavior on mobile, backdrop |
| `EditorToolbar.tsx` | Split into primary + overflow, increase touch targets |
| `MarkdownEditor.tsx` | Add FAB for insert commands on mobile |
| `StatusBar.tsx` | Conditionally hide secondary stats on mobile |
| `App.tsx` / layout | Add `isMobilePaneOpen` state, pass toggle handlers |
| All modals | Add `w-full md:max-w-lg` responsive widths |

### Testing Strategy
- Playwright tests with `iPhone 14` and `iPad Pro 11` viewports
- Test: hamburger menu open/close, drawer open/close, toolbar overflow, tab scrolling
- Manual testing in Chrome DevTools device mode
- Verify no desktop regressions by running existing test suite

---

## What This Plan Does NOT Cover
- Native mobile apps (iOS/Android) — separate project
- Offline/PWA support — future enhancement
- Mobile-specific gestures beyond basic swipe-to-dismiss — stretch goals noted inline
- Drag-and-drop in notebook tree on mobile — complex, deferred
