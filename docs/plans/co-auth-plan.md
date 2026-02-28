# Public Share Link View — Improvement Plan

## Problem Statement

The public share link view (`/s/:token`) has several UX issues that make shared content look unprofessional and miss conversion opportunities:

1. **Raw HTML/Markdown displayed** — Content renders in a `<pre>` tag showing raw HTML tags (`<h2>`, `<p>`, `<strong>`, etc.) instead of beautifully formatted content. The API returns raw markdown (or TipTap HTML), but the viewer doesn't process it.
2. **Flat file sidebar** — Files are listed flat (e.g., `Exec Bios/` and `Exec Bios/Jay Parikh.md` as separate items) instead of a proper tree with folders and nested files.
3. **Excessive spacing** — `p-8` on the main area + `p-6` on the card + `max-w-4xl mx-auto` centering creates too much dead space between the document content and the page chrome.
4. **Arbitrary initial file selection** — Picks the first `.md` file found, not necessarily the most logical choice (e.g., a README or root-level file).
5. **No sign-up CTA** — This is a prime conversion surface for anonymous visitors. Should include tasteful branding and a call to action to sign up.

## Current Implementation

- **Component:** `apps/web/src/components/public/PublicDocumentViewer.tsx` (117 lines)
- **Route:** `/s/:token` → `<PublicDocumentViewer />`
- **API:** Returns `{ content, path }` where content is raw markdown or TipTap HTML
- **Rendering:** `<pre className="whitespace-pre-wrap font-mono">{document.content}</pre>`
- **Sidebar:** Flat `<ul>` iterating `shareInfo.files` with `f.path` as label
- **Existing converters:** `markdownToHtml()` and `isMarkdownContent()` in `markdownConverter.ts`

## Plan

### 1. Render Content Properly

**Goal:** Display beautifully formatted content, matching the editing experience.

- Use `isMarkdownContent()` to detect whether content is raw markdown or TipTap HTML
- If markdown: convert via `markdownToHtml()` (already exists in `markdownConverter.ts`)
- Render the resulting HTML in a styled `<div>` with prose typography classes (not `<pre>`)
- Reuse the same CSS styles the editor uses (e.g., `ProseMirror` or Tailwind `prose` classes) so headings, lists, tables, blockquotes, code blocks, links, etc. all look correct
- Ensure read-only — no editing affordances, cursor changes, or interactivity

### 2. Hierarchical File Sidebar

**Goal:** Show files grouped under their folders with expand/collapse, matching the main app's tree.

- Build a tree structure from the flat `files` array using `parentPath`-style grouping (split on `/`)
- Render folders with expand/collapse chevrons, folder icons, and indentation
- Render files with appropriate file-type icons (reuse `FileIcon` from NotebookTree or similar)
- Auto-expand the folder containing the selected file
- Sort: folders first, then files alphabetically
- Clicking a folder expands/collapses it; clicking a file selects it for viewing

### 3. Tighten Layout & Spacing

**Goal:** Reduce dead space so the content feels close to the chrome.

- Reduce main area padding from `p-8` → `p-4` or `p-6`
- Remove or widen `max-w-4xl` constraint — let content fill more of the available width
- Remove the card wrapper (`rounded-lg shadow`) or make it more subtle — the content should feel like a document, not a card floating in space
- Make the sidebar height fill the viewport (`h-[calc(100vh-header)]` with `overflow-y-auto`)

### 4. Smarter Initial File Selection

**Goal:** Show the most relevant file by default.

Priority order:
1. `README.md` (case-insensitive) at the root
2. First `.md` file at root level (no `/` in path)
3. First `.md` file in any folder
4. First file overall

### 5. Sign-Up CTA & Branding

**Goal:** Convert anonymous viewers into signed-up users.

- **Header:** Add Notebook.md logo/wordmark on the left side of the header, linking to the homepage
- **CTA banner:** Subtle banner at the bottom of the page (sticky or at end of content) with:
  - "Create your own notebooks with Notebook.md"
  - "Sign up free" button → links to `/signup` or `/` with sign-up flow
- **Header CTA:** Small "Try Notebook.md" or "Sign Up" button in the top-right corner of the header
- Keep it tasteful — the primary focus should be the shared content, not the ads
- Style the CTA to match the app's design language (blue primary buttons, etc.)

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/components/public/PublicDocumentViewer.tsx` | Major rewrite — tree sidebar, content rendering, layout, CTAs |
| `apps/web/src/components/editor/markdownConverter.ts` | No changes needed (reuse existing exports) |
| Possibly extract `PublicFileTree.tsx` | New component for the hierarchical sidebar |
| Possibly extract `PublicContentRenderer.tsx` | New component for content rendering |
| CSS/styles | Add prose styles for rendered content if not already available |

## Out of Scope

- Editing from the public view (read-only only)
- Comments or annotations on shared content
- Download/export functionality
- Co-authoring features (separate effort)
