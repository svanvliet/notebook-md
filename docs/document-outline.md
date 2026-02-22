# Document Outline Feature — Implementation Plan

**Requirements:** `docs/requirements/requirements.md` §5.11
**Branch:** `feature/document-outline`

---

## Overview

Add a collapsible outline pane between the notebook pane and the document pane that shows a hierarchical table of contents extracted from the active document's headings. Clicking a heading scrolls the document to that position. The outline updates in real-time as the user edits.

## Architecture

### Component Hierarchy

```
App.tsx
├── NotebookPane (existing — left sidebar)
├── OutlinePane (NEW — middle panel)
│   ├── OutlinePaneHeader (collapse toggle, "Outline" label)
│   └── OutlineTree (heading list with indentation)
└── DocumentPane (existing — right main area)
```

### Data Flow

```
TipTap Editor (MarkdownEditor.tsx)
  → editor.state.doc (ProseMirror document)
  → useDocumentOutline hook (extracts headings on every update)
  → OutlinePane (renders heading tree)
  → Click handler → editor.commands.scrollIntoView / DOM scrollIntoView
```

## Implementation Steps

### Phase 1: Heading Extraction Hook

**File:** `apps/web/src/hooks/useDocumentOutline.ts` (new)

- Accept a TipTap `Editor` instance (or null when no document is open)
- On editor `update` and `create` events, walk `editor.state.doc` to extract all heading nodes:
  ```ts
  interface OutlineHeading {
    id: string;       // stable ID for React keys (e.g., `heading-{index}`)
    text: string;     // heading text content
    level: number;    // 1–6
    pos: number;      // ProseMirror document position (for scrolling)
  }
  ```
- Return `headings: OutlineHeading[]` — flat list ordered by document position
- Debounce extraction (e.g., 100ms) to avoid excessive computation during fast typing
- Memoize output — only update state when headings actually change (compare text+level)

### Phase 2: Outline Pane Component

**File:** `apps/web/src/components/layout/OutlinePane.tsx` (new)

- Renders between `NotebookPane` and `DocumentPane` in the flex layout in `App.tsx`
- **Header:** "Outline" label + collapse toggle button (chevron icon)
- **Body:** Scrollable list of headings with indentation based on level:
  - `h1` → no indent
  - `h2` → 1 level indent (e.g., `pl-4`)
  - `h3` → 2 levels indent (`pl-8`)
  - `h4`–`h6` → deeper indentation (`pl-12`, `pl-16`, `pl-20`)
- **Styling:** Match notebook pane aesthetics — same background, border, font size, hover states
- **Click handler:** On heading click, scroll document pane to that heading
- **Empty state:** "No headings" message when document has no headings
- **Hidden state:** When no document is open, hide the pane entirely

### Phase 3: Collapse & Resize

- **Collapse:** Reuse the same `useSidebarResize` hook pattern from `NotebookPane`:
  - Collapsed state persisted to `localStorage` (`notebook-md-outline-collapsed`)
  - Width persisted to `localStorage` (`notebook-md-outline-width`)
  - Default width: 200px | Min: 48px (collapsed strip) | Max: 400px
  - Drag handle on right edge of the pane
- **Keyboard shortcut:** Consider `Ctrl/Cmd+Shift+O` for toggle (check for conflicts)

### Phase 4: Scroll-to-Heading

Two approaches to scroll to a heading on click:

**Approach A — ProseMirror position (preferred):**
- Use `editor.commands.setTextSelection(pos)` to move cursor to heading position
- Then `editor.commands.scrollIntoView()` to scroll to cursor
- This integrates with the editor's scroll behavior naturally

**Approach B — DOM query (fallback):**
- Heading nodes render as `<h1>`–`<h6>` elements in the editor DOM
- Query `editor.view.dom.querySelectorAll('h1, h2, h3, h4, h5, h6')`
- Index matches `headings[i]` → call `element.scrollIntoView({ behavior: 'smooth', block: 'start' })`

**Recommended:** Start with Approach A. Fall back to B if cursor movement is visually distracting (cursor jumping to headings on click).

### Phase 5: Active Heading Highlight

- Listen to the document pane's scroll events
- Determine which heading is currently at (or nearest above) the top of the viewport
- Highlight that heading in the outline (e.g., bold text, accent background, left border indicator)
- Use `IntersectionObserver` on heading DOM elements or compare scroll position against heading offsets
- Debounce scroll handler (e.g., 50ms) for performance

### Phase 6: Integration & Polish

- **App.tsx layout:** Insert `OutlinePane` between `NotebookPane` and `DocumentPane` in the flex container
- **Tab switching:** When switching tabs, re-extract headings from the new active editor content
- **Mobile:** Hide outline pane on mobile viewports (`hidden md:flex`)
- **Dark mode:** Ensure all outline styles work in both light and dark themes
- **Demo mode:** Outline should work in demo mode — no special handling needed

## Testing

### Unit Tests (`apps/web/src/tests/documentOutline.test.ts`)

1. Extracts headings from editor state (h1–h6, correct text and levels)
2. Returns empty array for document with no headings
3. Updates headings when document content changes
4. Handles nested heading hierarchy correctly
5. Debounces rapid updates

### Component Tests (`apps/web/src/tests/OutlinePane.test.tsx`)

1. Renders heading list with correct indentation
2. Click on heading calls scroll handler
3. Shows empty state when no headings
4. Collapse/expand toggle works
5. Hidden when no active document

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `hooks/useDocumentOutline.ts` | Create | Heading extraction hook |
| `components/layout/OutlinePane.tsx` | Create | Outline pane component |
| `tests/documentOutline.test.ts` | Create | Unit tests for hook |
| `tests/OutlinePane.test.tsx` | Create | Component tests |
| `App.tsx` | Modify | Add OutlinePane to layout |
| `MarkdownEditor.tsx` | Modify | Expose editor instance or heading data to parent |

## Design Decisions

1. **Flat list vs. collapsible tree:** Start with a flat indented list (simpler, scannable). A collapsible tree adds complexity (expand/collapse state per heading) with limited benefit — most documents have <20 headings.

2. **Heading ID stability:** Use document position (`pos`) rather than text content as the identifier. Text can change during editing; position is always unique within a given document state.

3. **Outline placement:** Between notebook pane and document pane (not inside the document pane) to give it independent collapse/resize behavior and a clear spatial separation.

4. **Re-extraction strategy:** Extract on every editor update (debounced). Alternatives like parsing Markdown source were considered but rejected — the TipTap document tree is the authoritative source and already parsed.
