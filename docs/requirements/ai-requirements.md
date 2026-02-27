# AI Content Generation Requirements

**Date:** 2026-02-26
**Status:** Draft — v2 (all design decisions resolved)
**Author:** Co-authored with Copilot
**Depends on:** TipTap editor, slash command system, feature flag system, API route architecture

---

## 1. Problem Statement

Notebook.md currently requires users to write all document content manually. Users would benefit from the ability to generate rich, formatted content using a large language model (LLM) directly from the editor. This feature — "Create with AI" — allows users to describe what they want and receive well-formatted Markdown content that is inserted into the document at the location they invoked the command.

### Goals

1. **Inline AI generation** — Users can generate content from any position in the document via a slash command or toolbar button
2. **Rich Markdown output** — The LLM returns Markdown-formatted content that maps cleanly to the TipTap editor's supported node types (headings, lists, tables, code blocks, callouts, etc.)
3. **Preview before insertion** — Generated content appears in a visually distinct inline widget with accept/reject controls, so users can review before committing
4. **Streaming UX** — Content streams into the widget progressively (if the AI provider supports it), giving users immediate feedback
5. **Non-destructive** — Rejecting generated content restores the document to its prior state with no side effects

### Non-Goals

- Chat-based AI interaction (multi-turn conversation)
- AI-powered editing of existing content (rewrite, summarize, translate) — deferred to a future version; the extension architecture should not preclude this
- AI-generated images or media
- Offline/local LLM support
- Custom model selection by the user
- System prompt customization by users or admins (default system prompt for v1)

---

## 2. User Experience

### 2.1 Entry Points

There are two ways to invoke "Create with AI":

| Entry Point | Trigger | Behavior |
|-------------|---------|----------|
| **Slash command** | Type `/` in the editor, select "Create with AI" (first item in the list) | Opens the AI prompt modal. Insertion position = location of the `/` command. |
| **Toolbar button** | Click the sparkle (✨) icon in the editor toolbar | Opens the AI prompt modal. Insertion position = current cursor/focus position. |
| **Mobile FAB** | Tap the floating action button (FAB) on mobile | Opens a slash-command-style menu with "Create with AI" at the top, followed by all other slash commands. Selecting "Create with AI" opens the prompt modal. |

**Slash command details:**
- "Create with AI" appears as the **first item** in the slash command menu, above all existing commands
- Icon: sparkle/stars emoji or SVG (`✨` or a custom sparkle SVG)
- Title: "Create with AI"
- Description: "Generate content with AI"

**Toolbar button details:**
- Positioned after the Print button and before any overflow/mobile menu
- Uses a sparkle SVG icon consistent with the existing toolbar icon style (`w-4 h-4` viewBox)
- Tooltip: "Create with AI"
- Visible on desktop; hidden on mobile (replaced by FAB — see below)

**Mobile FAB (Floating Action Button) details:**
- A circular floating button positioned at the **bottom-right corner** of the editor viewport on mobile screens (`md:hidden`)
- Icon: sparkle/plus or a `/` glyph
- On tap: opens a bottom-sheet or popover menu that mirrors the full slash command list, with "Create with AI" as the first item
- This provides mobile users easy access to all slash commands (including AI) without needing to type `/` on a mobile keyboard
- The FAB is only visible when the editor is focused/active
- Standard FAB sizing: 56px diameter, elevated with shadow, primary brand color

### 2.2 Prompt Modal

When the user selects "Create with AI" from either entry point, a modal dialog appears:

**Layout:**
- Full-screen backdrop overlay (`fixed inset-0 z-50 bg-black/40`) — consistent with `InputModal` pattern
- Centered modal card (max-width ~480px) with rounded corners, border, dark mode support
- Title: "Create with AI"
- Subtitle/helper text: "Describe the content you'd like to generate"
- Multi-line text area (not single-line input) for the prompt — minimum 3 rows, auto-grows
- **Content length toggle:** a segmented control / pill selector below the textarea with three options:
  - **Short** — concise output (~1 paragraph to a few paragraphs)
  - **Medium** (default) — moderate output (~1–2 pages)
  - **Long** — extended output (~2–4 pages)
- Character count indicator (optional, if a limit is imposed)
- **AI disclaimer** (small muted text at bottom of modal body): "Your prompt and document content are sent to an AI service (Azure OpenAI) to generate a response."
- Footer with Cancel and Create buttons
  - **Cancel**: closes modal, no action, returns focus to editor
  - **Create**: submits the prompt, closes modal, inserts the AI widget at the target position

**Behavior:**
- Text area auto-focuses on mount
- `Enter` does **not** submit (allows multi-line prompts); `Cmd/Ctrl+Enter` submits
- `Escape` cancels
- Create button is disabled when the prompt is empty/whitespace-only
- The modal stores the target editor position (cursor `pos`) captured at the moment the command was invoked, so it can be passed to the widget after submission

### 2.3 AI Generation Widget (Inline)

After the user clicks "Create", the modal closes and a **widget** is inserted into the document at the target position. This widget is an inline, non-editable block that occupies space in the document flow.

#### 2.3.1 Loading State

While the API request is in flight or content is streaming:

- The widget displays a **shimmer/skeleton animation** — animated gradient placeholder lines that pulse, similar to content loading skeletons
- The widget has a **thin, animated gradient border** that cycles through colors (e.g., blue → purple → pink → blue) using a CSS `@keyframes` animation on `border-image` or `background` with a `linear-gradient`
- A small label at the top of the widget: "Generating with AI…" with a sparkle icon
- The widget has a minimum height (~80px) to avoid layout jump when content arrives
- The widget width spans the full content area (100% of the editor content width)

**Animated border specification:**
```
@keyframes ai-border-rotate {
  0%   { --angle: 0deg; }
  100% { --angle: 360deg; }
}
```
Use a conic or linear gradient with hue rotation for the border, creating a smooth color-cycling effect. Fallback to a static blue/purple gradient border for browsers without `@property` support.

**Shimmer animation specification:**
Animated horizontal gradient sweep (light-to-dark-to-light) across placeholder "lines" — 3–5 gray bars of varying widths to suggest text content. Similar to skeleton loading patterns.

#### 2.3.2 Streaming State

When the AI service begins returning tokens:

- The shimmer placeholder fades out and is replaced by actual rendered content
- Content streams in progressively — new tokens are appended as they arrive
- The animated gradient border remains active while streaming is in progress
- The widget grows in height as more content arrives
- A "Generating…" indicator remains visible (e.g., a small pulsing dot or spinner at the bottom of the content)

If streaming is not supported by the provider or the response arrives as a single payload:
- The shimmer plays for the full duration of the request
- When the response arrives, the shimmer fades out and the full content renders at once

#### 2.3.3 Complete State

When generation is complete:

- The animated border transitions to a static, subtle blue/purple border
- The content is fully rendered as rich HTML (converted from Markdown via the existing `markdownToHtml` pipeline)
- An **action bar** appears at the bottom of the widget:

| Button | Style | Action |
|--------|-------|--------|
| **Accept** (✓ Insert) | Primary (blue bg, white text) | Inserts the generated content into the document at the widget's position; removes the widget |
| **Reject** (✗ Discard) | Secondary (outlined/gray) | Removes the widget; restores the document to its state before the widget was inserted |

- Keyboard shortcuts: `Enter` or `Cmd+Enter` to accept, `Escape` to reject
- The content inside the widget is **read-only** (not editable) while in the widget — the user must accept first

#### 2.3.4 Error State

If the AI request fails:

- The shimmer stops
- The animated border turns red/orange
- An error message appears inside the widget: "Failed to generate content. Please try again."
- A **Retry** button and a **Dismiss** button appear in the action bar
- Retry re-sends the same prompt; Dismiss removes the widget

### 2.4 Content Insertion (Accept)

When the user accepts the generated content:

1. The widget is removed from the document
2. The generated HTML content (already converted from Markdown) is inserted at the widget's position using `editor.chain().focus().insertContent(html).run()`
3. The cursor is placed at the end of the inserted content
4. The document change triggers the normal save/sync flow (no special handling needed)

### 2.5 Content Rejection (Reject)

When the user rejects the generated content:

1. The widget is removed from the document
2. No content is inserted
3. The cursor returns to the position where the command was originally invoked
4. The document state is identical to what it was before the command was invoked

### 2.6 Collaborative Editing Behavior

When the AI feature is used in a collaborative (shared) document:

- **Initiating user:** Sees the full AI widget experience (shimmer, streaming, accept/reject)
- **Other collaborators:** See a compact **AI generation placeholder** at the widget's position — a small inline slug/badge with a sparkle icon and the text "Generating with AI…". This placeholder:
  - Is read-only and non-interactive for non-initiating users
  - Has a subtle animated sparkle icon to indicate activity
  - Disappears when the initiating user accepts or rejects the content
  - If accepted, collaborators see the new content appear at that position (normal Yjs sync)
  - If rejected, the placeholder simply disappears

This is achieved by syncing the AI widget node through the Yjs/Hocuspocus collaboration layer, with the React node view rendering differently based on whether the current user is the widget's owner (`ownerId` node attribute).

### 2.7 Audit Logging

All AI generation requests are recorded in the existing audit log:

| Field | Value |
|-------|-------|
| Action | `ai.generate` |
| User ID | Authenticated user ID |
| Prompt | The user's prompt text (truncated to 500 chars in the log) |
| Length setting | `short` / `medium` / `long` |
| Outcome | `success` / `error` / `rejected` / `accepted` |
| Timestamp | ISO 8601 |

**Not logged:** Generated content (too large), document context (privacy).

---

## 3. Technical Architecture

### 3.1 Overview

```
┌──────────────┐       POST /api/ai/generate        ┌──────────────┐
│   Frontend    │  ──────────────────────────────►   │   API Server  │
│  (TipTap +   │  ◄──── SSE stream / JSON ────────  │  (Express)    │
│   React)     │                                     │               │
└──────────────┘                                     └──────┬───────┘
                                                            │
                                                            ▼
                                                   ┌──────────────┐
                                                   │  Microsoft   │
                                                   │  Foundry     │
                                                   │  (Azure AI)  │
                                                   └──────────────┘
```

### 3.2 Backend — API Route

**New route file:** `apps/api/src/routes/ai.ts`

**Endpoint:** `POST /api/ai/generate`

**Authentication:** `requireAuth()` middleware (same as all protected routes)

**Feature flag:** `ai_content_generation` — gated via `requireFeature('ai_content_generation')` middleware

**Rate limiting:** Dedicated rate limiter for AI requests:
- Window: 15 minutes
- Max requests: 20 per window per user (AI calls are expensive)
- Uses Redis-backed store in production

**Request body:**
```json
{
  "prompt": "string (1–2000 characters, required)",
  "notebookId": "string (optional — for context/auditing)",
  "documentContext": "string (optional — full document content in Markdown for contextual generation)",
  "cursorContext": "string (optional — indicator of where in the document content is being inserted)",
  "length": "'short' | 'medium' | 'long' (default: 'medium')"
}
```

**Input validation:**
- `prompt` is required, trimmed, min 1 char, max 2000 chars
- `notebookId` is optional UUID, validated if provided
- `documentContext` is optional, max 100,000 chars (truncated from around the cursor position if longer, with a note to the AI: "Document has been truncated for length.")
- `length` must be one of: `short`, `medium`, `long` — defaults to `medium`
- Reject requests with empty/whitespace-only prompts (400)

**Response (streaming — preferred):**
- Content-Type: `text/event-stream`
- SSE (Server-Sent Events) format:
  ```
  data: {"type":"token","content":"# Getting Started\n"}

  data: {"type":"token","content":"Here is a guide..."}

  data: {"type":"done"}

  ```
- On error mid-stream: `data: {"type":"error","message":"..."}\n\n`

**Response (non-streaming fallback):**
- Content-Type: `application/json`
- Body: `{ "content": "# Full markdown response..." }`

**System prompt:**
```
You are a content writer for a Markdown document editor called Notebook.md.
Generate well-structured content in Markdown format based on the user's prompt.

Rules:
- Use proper Markdown syntax: headings (#, ##, ###), lists (-, 1.), bold (**),
  italic (*), code blocks (```), tables, blockquotes (>), and horizontal rules (---)
- Structure content with clear headings and logical sections
- Keep responses focused and relevant to the user's request
- Do not include meta-commentary about the generation process
- Do not wrap the entire response in a code block — return raw Markdown
- Use GFM (GitHub Flavored Markdown) extensions where appropriate:
  task lists (- [ ]), tables, strikethrough (~~)
```

**Document context injection:**

When document context is available, it is prepended to the user message as follows:

```
Here is the existing document content for context. The marker [INSERT HERE]
indicates where the new content will be inserted. Generate content that fits
naturally at that position.

---
<document>
{documentContext with [INSERT HERE] marker at cursor position}
</document>
---

User's request: {prompt}
```

**Length parameter mapping:**

| Length | `max_tokens` | Guidance added to system prompt |
|--------|-------------|-------------------------------|
| Short | 1024 | "Keep the response concise — a few paragraphs at most." |
| Medium | 2048 | "Provide a moderately detailed response — roughly 1–2 pages." |
| Long | 4096 | "Provide a comprehensive, detailed response — up to several pages." |

**Error handling:**
- 400: Invalid prompt (empty, too long)
- 401: Not authenticated
- 404: Feature flag disabled
- 429: Rate limit exceeded
- 500: AI service error (log details, return generic message to client)
- 503: AI service unavailable / timeout

### 3.3 Backend — Microsoft Foundry Integration

**New service file:** `apps/api/src/services/ai.ts`

**Provider:** Microsoft Azure AI Foundry (Azure AI model inference)

**Default model:** GPT-4.1-nano ($0.10/1M input tokens, $0.40/1M output tokens)

**Configuration (environment variables):**
```
AZURE_AI_ENDPOINT=https://<resource>.services.ai.azure.com
AZURE_AI_API_KEY=<api-key>
AZURE_AI_MODEL=gpt-4.1-nano
```

Alternatively, if using Entra ID (managed identity) authentication in production:
```
AZURE_AI_USE_MANAGED_IDENTITY=true
```

**Implementation details:**
- Use the `@azure-rest/ai-inference` SDK (Microsoft's official package) for Azure AI model inference
- Support streaming via the SDK's streaming API
- `max_tokens` is determined by the `length` parameter (see Length parameter mapping above): short=1024, medium=2048, long=4096
- Set `temperature` to 0.7 for creative but coherent output
- Include the system prompt (Section 3.2) as the first message in the chat completion request
- If document context is provided, inject it into the user message (see Document context injection above)
- The user's prompt (with optional document context) is the second message with role `user`

**Timeout:** 60 seconds for the full response. If streaming, the connection can stay open for up to 120 seconds.

**Retry:** No automatic retry on the backend — let the user retry via the widget's Retry button.

### 3.4 Frontend — TipTap Integration

#### 3.4.1 AI Widget (Custom Node Extension)

Create a **custom TipTap node** for the AI generation widget:

**New file:** `apps/web/src/components/editor/AiGenerationWidget.tsx` (React node view)
**New file:** `apps/web/src/components/editor/AiGenerationExtension.ts` (TipTap extension)

**Node attributes:**
- `prompt` (string) — the user's AI prompt
- `status` ('loading' | 'streaming' | 'complete' | 'error') — current state
- `content` (string) — accumulated Markdown content from the AI response
- `errorMessage` (string | null) — error text if status is 'error'
- `ownerId` (string) — the user ID of the user who initiated the generation (used for collaborative rendering)
- `length` ('short' | 'medium' | 'long') — the length setting chosen by the user

**Node behavior:**
- `atom: true` — non-editable, treated as a single unit
- `group: 'block'` — block-level element
- `selectable: true` — can be selected/deleted
- `draggable: false` — not draggable
- Rendered via a React `NodeViewWrapper` component

**Commands:**
- `insertAiWidget({ prompt })` — inserts the widget at the current cursor position and initiates the API call
- `removeAiWidget(pos)` — removes the widget and optionally inserts accepted content
- `retryAiWidget(pos)` — re-sends the prompt for the widget at `pos`

#### 3.4.2 Streaming Client

**New file:** `apps/web/src/api/ai.ts`

**Function:** `generateAiContent(params: { prompt: string; length: 'short' | 'medium' | 'long'; documentContext?: string; cursorContext?: string; notebookId?: string }, onToken: (text: string) => void, onDone: () => void, onError: (msg: string) => void): AbortController`

- Uses `fetch()` with the SSE endpoint
- Reads the response stream via `ReadableStream` / `getReader()`
- Parses SSE `data:` lines and dispatches callbacks
- Returns an `AbortController` so the request can be cancelled if the user rejects or navigates away
- Falls back to non-streaming JSON response if SSE is not available

#### 3.4.3 Prompt Modal Component

**New file:** `apps/web/src/components/editor/AiPromptModal.tsx`

- Follows the `InputModal` pattern (fixed overlay, centered card, dark mode)
- Contains a `<textarea>` instead of `<input>` for multi-line prompts
- Props: `onSubmit(prompt: string)`, `onCancel()`
- State is managed by the parent (`MarkdownEditor.tsx`) which coordinates between the modal, the editor, and the widget

#### 3.4.4 Slash Command Integration

In `SlashCommands.ts`, add a new entry at the **beginning** of the `slashCommands` array:

```ts
{
  title: 'Create with AI',
  description: 'Generate content with AI',
  icon: '✨',
  action: (editor) => {
    window.dispatchEvent(new CustomEvent('ai:open-prompt', { detail: { editor } }));
  },
}
```

The `MarkdownEditor` component listens for the `ai:open-prompt` event and opens the `AiPromptModal`, capturing the current cursor position.

#### 3.4.5 Toolbar Button Integration

In `EditorToolbar.tsx`, add a sparkle icon button:

- Position: after Print, before the mobile overflow menu trigger
- Desktop: always visible (alongside other toolbar buttons)
- Mobile: included in the overflow grid
- On click: dispatches `ai:open-prompt` event (same as slash command)

### 3.5 CSS / Animations

**New styles in:** `apps/web/src/components/editor/editor.css` or `apps/web/src/index.css`

**Animated gradient border:**
```css
.ai-widget {
  position: relative;
  border-radius: 8px;
  padding: 16px;
  margin: 8px 0;
  background: white;
  overflow: hidden;
}

.ai-widget::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 8px;
  padding: 2px;
  background: linear-gradient(
    var(--angle, 0deg),
    #3b82f6,  /* blue-500 */
    #8b5cf6,  /* violet-500 */
    #ec4899,  /* pink-500 */
    #3b82f6   /* blue-500 */
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: ai-border-rotate 3s linear infinite;
}

@property --angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

@keyframes ai-border-rotate {
  to { --angle: 360deg; }
}
```

**Shimmer/skeleton animation:**
```css
.ai-shimmer-line {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    #e5e7eb 25%,
    #f3f4f6 50%,
    #e5e7eb 75%
  );
  background-size: 200% 100%;
  animation: ai-shimmer 1.5s ease-in-out infinite;
}

.dark .ai-shimmer-line {
  background: linear-gradient(
    90deg,
    #374151 25%,
    #4b5563 50%,
    #374151 75%
  );
  background-size: 200% 100%;
}

@keyframes ai-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

**Dark mode:** All widget styles must include `dark:` variants for background, text, and border colors.

---

## 4. Feature Flagging & Quotas

### 4.1 Feature Flags

The AI generation feature is gated behind two feature flags:

| Flag Key | Purpose | Default |
|----------|---------|---------|
| `ai_content_generation` | Master switch — enables/disables the entire AI feature | `disabled` |
| `ai_unlimited_generations` | Bypasses the daily generation quota when enabled for a user/group via flight | `disabled` |

| Aspect | Detail |
|--------|--------|
| Backend gating | `requireFeature('ai_content_generation')` on `POST /api/ai/generate` |
| Frontend gating | `useFlag('ai_content_generation')` — hides the slash command entry, toolbar button, and mobile FAB AI option when disabled |
| Admin control | Toggleable via the admin feature flags UI |
| Flight support | Both flags can be assigned to beta flights for staged rollout |

**Frontend behavior when `ai_content_generation` is disabled:**
- The "Create with AI" slash command is not included in the command list
- The sparkle toolbar button is not rendered
- The mobile FAB does not include the AI option
- No AI-related code is loaded (lazy-load the AI widget and modal via dynamic `import()`)

### 4.2 Daily Generation Quota

Free-tier users are limited to **10 AI generations per day** (rolling 24-hour window).

| Aspect | Detail |
|--------|--------|
| Default limit | 10 generations per 24 hours |
| Configurable | Yes — stored as an environment variable (`AI_DAILY_GENERATION_LIMIT`, default: 10). Requires redeploy to change. |
| Bypass flag | Users/groups with `ai_unlimited_generations` enabled (via flight) have no daily limit |
| Tracking | Per-user generation count stored in Redis with a 24-hour TTL |
| API response | Include `X-AI-Generations-Remaining` and `X-AI-Generations-Limit` headers |
| Quota exceeded | Return 429 with a clear message: "Daily AI generation limit reached. Try again tomorrow." |
| Frontend UX | Show remaining generations count in the prompt modal (e.g., "8 of 10 remaining today"). When quota is exhausted, disable the Create button and show the quota message. |
---

## 5. Security & Privacy

### 5.1 Data Handling

- **Prompt content** is sent to the Microsoft Foundry AI endpoint (Azure OpenAI)
- **Document content** is sent as context to improve generation quality — the full document (in Markdown) is included in the request so the AI can generate contextually relevant content. Users are informed of this via the disclaimer in the prompt modal.
- **No prompt storage** — prompts are not persisted in the database (stateless request/response)
- **No AI response storage** — generated content is only stored when the user accepts it (as part of the normal document save flow)
- **No document content logging** — the document context sent with the request is not logged or stored beyond the API request lifecycle

### 5.2 Input Sanitization

- The user's prompt is trimmed and length-validated on both client and server
- The AI response (Markdown) is converted to HTML via `markdownToHtml()` and then sanitized via `DOMPurify.sanitize()` before insertion into the editor — same pipeline as all other content
- No raw AI output is injected into the DOM unsanitized

### 5.3 Rate Limiting

- 20 requests per 15-minute window per authenticated user
- Rate limiter is Redis-backed in production
- Rate limit headers (`X-RateLimit-Remaining`, `Retry-After`) are included in responses

### 5.4 Abuse Prevention

- Only authenticated users can use the feature
- Feature flag gating allows disabling the feature globally or per-user if abuse is detected
- Server-side prompt length limit (2000 chars) prevents excessively large payloads
- Document context is capped at 100,000 chars to limit input token cost
- AI model `max_tokens` limit (1024–4096, depending on length setting) caps response size

### 5.5 Cost Controls

- Daily generation quota (10/day for free tier) bounds per-user spend
- Rate limiting (20/15min) prevents burst abuse
- `max_tokens` caps per-request cost
- `ai_unlimited_generations` flag allows controlled upgrade to unlimited for specific users/groups
- Feature flag allows immediate global shutoff if costs spike
- Document context truncation (100K chars) caps input token cost

---

## 6. Environment Configuration

### New Environment Variables

Add to `.env.example`:

```env
# AI Content Generation (Microsoft Azure AI Foundry)
AZURE_AI_ENDPOINT=
AZURE_AI_API_KEY=
AZURE_AI_MODEL=gpt-4.1-nano
# Optional: use Entra ID managed identity instead of API key (production)
# AZURE_AI_USE_MANAGED_IDENTITY=true
# Daily generation quota for free-tier users (default: 10)
AI_DAILY_GENERATION_LIMIT=10
```

**Production deployment:**
- Store `AZURE_AI_API_KEY` in Azure Key Vault or Container App secrets (never in source control)
- Prefer managed identity (`AZURE_AI_USE_MANAGED_IDENTITY=true`) in production to avoid key rotation burden
- `AZURE_AI_ENDPOINT` and `AZURE_AI_MODEL` can be set as plain Container App environment variables

---

## 7. Accessibility

- The prompt modal is keyboard-navigable (Tab, Escape, Cmd+Enter)
- The AI widget has appropriate ARIA roles (`role="region"`, `aria-label="AI generated content"`, `aria-busy="true"` during loading)
- Accept/Reject buttons are keyboard-focusable with clear labels
- The shimmer animation respects `prefers-reduced-motion` (falls back to static placeholder)
- Screen readers announce: "Generating content with AI" on widget insertion, "Content generated, review and accept or reject" on completion

---

## 8. Internationalization (i18n)

All user-facing strings should use the existing `useTranslation` / `t()` pattern:

| Key | English Default |
|-----|-----------------|
| `editor.ai.slashCommand.title` | Create with AI |
| `editor.ai.slashCommand.description` | Generate content with AI |
| `editor.ai.toolbar.title` | Create with AI |
| `editor.ai.modal.title` | Create with AI |
| `editor.ai.modal.subtitle` | Describe the content you'd like to generate |
| `editor.ai.modal.placeholder` | e.g., "Write an introduction to machine learning" |
| `editor.ai.modal.length.short` | Short |
| `editor.ai.modal.length.medium` | Medium |
| `editor.ai.modal.length.long` | Long |
| `editor.ai.modal.disclaimer` | Your prompt and document content are sent to an AI service (Azure OpenAI) to generate a response. |
| `editor.ai.modal.remaining` | {{count}} of {{limit}} remaining today |
| `editor.ai.modal.quotaExceeded` | Daily AI generation limit reached. Try again tomorrow. |
| `editor.ai.modal.create` | Create |
| `editor.ai.modal.cancel` | Cancel |
| `editor.ai.widget.generating` | Generating with AI… |
| `editor.ai.widget.accept` | Insert |
| `editor.ai.widget.reject` | Discard |
| `editor.ai.widget.retry` | Retry |
| `editor.ai.widget.dismiss` | Dismiss |
| `editor.ai.widget.error` | Failed to generate content. Please try again. |
| `editor.ai.fab.title` | Insert block |
| `editor.ai.collab.generating` | Generating with AI… |

---

## 9. Testing Strategy

### 9.1 Unit Tests (Vitest)

| Area | Tests |
|------|-------|
| `ai.ts` service | System prompt construction, input validation, response parsing, document context injection, length mapping |
| `ai.ts` route | Auth, feature flag gating, rate limiting, daily quota, request validation, error responses, audit logging |
| AI widget extension | Node creation, attribute handling, command execution |
| `AiPromptModal` | Render, submit, cancel, keyboard shortcuts, validation |

### 9.2 Integration Tests

| Area | Tests |
|------|-------|
| API → Foundry | Mock Azure AI endpoint, verify streaming SSE format, verify non-streaming fallback |
| Widget lifecycle | Insert widget → receive content → accept → verify document content |
| Widget lifecycle | Insert widget → reject → verify document unchanged |
| Widget lifecycle | Insert widget → error → retry → success |

### 9.3 E2E Tests (Playwright)

| Scenario | Steps |
|----------|-------|
| Slash command flow | Type `/`, select "Create with AI", enter prompt, verify widget appears, accept |
| Toolbar button flow | Click sparkle button, enter prompt, verify widget appears, reject, verify no content |
| Length toggle | Select "Long", generate, verify longer output than "Short" |
| Error handling | Trigger error (mock), verify error state, retry |
| Feature flag disabled | Verify slash command, toolbar button, and mobile FAB AI option are hidden |
| Daily quota exhausted | Mock quota at limit, verify Create button disabled with message |
| Collaborative slug | In shared doc, verify other user sees sparkle slug during generation |
| Mobile FAB | On mobile viewport, verify FAB appears, opens command menu, AI is first item |

---

## 10. New Files Summary

| File | Purpose |
|------|---------|
| `apps/api/src/routes/ai.ts` | Express route: `POST /api/ai/generate` |
| `apps/api/src/services/ai.ts` | Azure AI Foundry client, prompt construction, streaming |
| `apps/web/src/api/ai.ts` | Frontend SSE streaming client |
| `apps/web/src/components/editor/AiPromptModal.tsx` | Prompt input modal component (textarea, length toggle, disclaimer) |
| `apps/web/src/components/editor/AiGenerationExtension.ts` | TipTap custom node extension for the AI widget |
| `apps/web/src/components/editor/AiGenerationWidget.tsx` | React node view for the AI widget (shimmer, streaming, collab slug, actions) |
| `apps/web/src/components/editor/MobileCommandFab.tsx` | Floating action button for mobile slash command access |

---

## 11. Modified Files Summary

| File | Change |
|------|--------|
| `apps/api/src/app.ts` | Register `aiRoutes` at `/api/ai` |
| `apps/web/src/components/editor/SlashCommands.ts` | Add "Create with AI" as first slash command |
| `apps/web/src/components/editor/EditorToolbar.tsx` | Add sparkle toolbar button |
| `apps/web/src/components/editor/MarkdownEditor.tsx` | Add AI prompt modal state, event listener, widget coordination, document context extraction |
| `apps/web/src/components/editor/extensions.ts` | Register `AiGenerationExtension` |
| `apps/web/src/components/editor/editor.css` (or `index.css`) | AI widget animations (border, shimmer), collab slug styles |
| `apps/web/src/locales/en/translation.json` | i18n strings for AI feature |
| `.env.example` | Azure AI environment variables |
| DB migration (new) | Seed `ai_content_generation` and `ai_unlimited_generations` feature flags |
| `apps/web/src/components/legal/PrivacyPage.tsx` | Update privacy policy to disclose AI service data sharing (prompt + document context sent to Azure OpenAI) |
| `apps/web/src/components/legal/TermsPage.tsx` | Update terms of service to cover AI-generated content and third-party AI processing |
| `apps/web/src/components/marketing/FeaturesPage.tsx` | Update marketing copy — can no longer claim "never stores/sends document content"; add AI feature highlights |
| `apps/web/src/components/marketing/AboutPage.tsx` | Update about page to reflect AI capabilities and data handling |
| `README.md` | Update claims about data handling to reflect AI feature's document context sharing |

---

## 12. Resolved Design Decisions

> All open questions have been resolved. Answers are incorporated into the requirements above.

| # | Question | Decision |
|---|----------|----------|
| 1 | Model selection | GPT-4.1-nano via Azure AI Foundry |
| 2 | Cost & quotas | 10 generations/day for free tier (configurable). `ai_unlimited_generations` flag to bypass. |
| 3 | Prompt context | Full document sent as context with `[INSERT HERE]` cursor marker |
| 4 | User consent | Small disclaimer text at bottom of prompt modal |
| 5 | Content length | Short/Medium/Long toggle in prompt modal (1024/2048/4096 max_tokens) |
| 6 | Edit after generation | Deferred to future version; extension architecture should not preclude it |
| 7 | Collaborative editing | Compact sparkle slug visible to other collaborators; full widget for initiator |
| 8 | Mobile experience | Floating Action Button (FAB) on mobile replicates slash command menu |
| 9 | Audit logging | Yes — log prompt (truncated), outcome, user ID, timestamp; NOT content or document context |
| 10 | System prompt customization | Default system prompt for v1; no user/admin customization |