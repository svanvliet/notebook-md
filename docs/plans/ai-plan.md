# AI Content Generation — Implementation Plan

**Requirements:** `docs/requirements/ai-requirements.md`
**Branch:** `feature/ai`
**Date:** 2026-02-26
**Status:** Complete (all 6 phases implemented, tested, and deployed to production)

---

## Post-Launch Updates (2026-02-27)

### Production Deployment
- Added Terraform variables (`azure_ai_endpoint`, `azure_ai_api_key`, `azure_ai_model`, `ai_daily_generation_limit`) to `variables.tf` and `container_apps.tf`
- Applied `terraform apply` — all 4 AI env vars deployed to API container app
- Built and pushed `api:v0.2.7` and `web:v0.2.7` Docker images to ACR
- Deployed both container apps; migrations 012 applied; health checks passing
- `ai_content_generation` flag enabled in production
- Increased Azure OpenAI quota from 1 req/min (default) to 30 req/min / 30K TPM

### Web Search Grounding (Phase 7)
- Added optional "Use web search" checkbox to AI prompt modal (unchecked by default)
- Gated behind `ai_web_search` feature flag (migration `013_ai-web-search-flag.sql`)
- **Initial approach (Bing):** Failed — `data_sources` type `"bing"` not supported in Azure OpenAI chat completions API; `web_search_preview` tool not available on Azure endpoints; Bing Search v7 retired; Bing.Grounding only works with Agent Service
- **Final approach (Brave Search):** Manual search-augmented generation — calls Brave Search API v7 directly, injects top 5 results as system context, LLM generates content grounded in web data with citations
- Free tier: 2,000 queries/month
- Terraform: `brave_search_api_key` variable + container secret/env

### Long Response Token Increase
- Increased `long` max_tokens from 4,096 to 16,384 for substantially longer content

### Dev Debug Logging
- Added comprehensive dev-only (`NODE_ENV !== 'production'`) debug logging for AI requests:
  - Brave Search: request URL, query, response status, result count, result titles/URLs
  - Azure OpenAI: request URL, message count/roles, max_tokens, streaming status, error bodies, token count on completion
  - Web search injection: character count of injected context, missing key warnings

---

## Overview

Add an AI content generation feature to the Notebook.md editor, powered by GPT-4.1-nano via Azure AI Foundry. Users invoke "Create with AI" from a slash command, toolbar button, or mobile FAB, enter a prompt, and receive streamed Markdown content in an inline widget with accept/reject controls.

### Architecture Summary

- **Backend:** New Express route (`POST /api/ai/generate`) → Azure AI Foundry SDK → SSE stream
- **Frontend:** TipTap custom node extension (AI widget) + React node view + SSE client + prompt modal + mobile FAB
- **Infra:** Azure AI Foundry resource, env vars, feature flags, DB migration

### Approach

Build in 6 phases, each independently testable and committable:

1. **Infrastructure & feature flags** — migration, env vars, flag seeding
2. **Backend AI service & route** — Azure SDK integration, streaming endpoint, rate limiting, quota
3. **Frontend prompt modal & streaming client** — modal UI, SSE client, length toggle
4. **TipTap AI widget extension** — custom node, shimmer, streaming render, accept/reject
5. **Entry points & mobile FAB** — slash command, toolbar button, FAB, collaborative slug
6. **Legal/privacy updates & polish** — privacy policy, terms, README, marketing copy

---

## Phase 1 — Infrastructure & Feature Flags

**Goal:** Set up all infra prerequisites so the feature is flag-gated and configurable before any logic lands.

### 1.1 Database Migration (`012_ai-feature-flags.sql`)

**File:** `apps/api/migrations/012_ai-feature-flags.sql`

```sql
-- Seed AI feature flags
INSERT INTO feature_flags (key, enabled, description)
VALUES
  ('ai_content_generation', false, 'Master switch for AI content generation feature'),
  ('ai_unlimited_generations', false, 'Bypasses daily AI generation quota when enabled for a user/group via flight')
ON CONFLICT (key) DO NOTHING;
```

### 1.2 Environment Variables

**File:** `.env.example` — append:

```env
# AI Content Generation (Microsoft Azure AI Foundry)
AZURE_AI_ENDPOINT=
AZURE_AI_API_KEY=
AZURE_AI_MODEL=gpt-4.1-nano
# Daily generation quota for free-tier users (default: 10)
AI_DAILY_GENERATION_LIMIT=10
```

### 1.3 Install SDK Dependency

```bash
npm -w apps/api install @azure-rest/ai-inference
```

### Tests (Phase 1)

| # | Test | File | Type |
|---|------|------|------|
| 1.1 | Migration runs without errors on clean DB | Manual / CI migration runner | Integration |
| 1.2 | Both feature flags exist and are disabled after migration | `apps/api/src/tests/ai-flags.test.ts` | Integration |
| 1.3 | `requireFeature('ai_content_generation')` returns 404 when flag is disabled | `apps/api/src/tests/ai-flags.test.ts` | Integration |
| 1.4 | `requireFeature('ai_content_generation')` passes when flag is enabled | `apps/api/src/tests/ai-flags.test.ts` | Integration |

### Commit

```
feat(ai): add feature flags and env config for AI generation

- Migration 012: seed ai_content_generation and ai_unlimited_generations flags
- Add Azure AI env vars to .env.example
- Install @azure-rest/ai-inference SDK
```

---

## Phase 2 — Backend AI Service & Route

**Goal:** Implement the API endpoint that accepts a prompt, calls Azure AI Foundry, and returns streamed content via SSE. Includes rate limiting, quota tracking, input validation, and audit logging.

### 2.1 AI Service (`apps/api/src/services/ai.ts`)

Responsibilities:
- Construct the system prompt (including length guidance)
- Inject document context with `[INSERT HERE]` cursor marker
- Truncate document context at 100K characters (with truncation note)
- Call Azure AI Foundry via `@azure-rest/ai-inference` SDK with streaming
- Map `length` parameter to `max_tokens` (short=1024, medium=2048, long=4096)
- Set `temperature: 0.7`
- Return an async iterable of content chunks

Key functions:
```ts
buildMessages(prompt: string, length: Length, documentContext?: string, cursorContext?: string): ChatMessage[]
streamGeneration(messages: ChatMessage[], maxTokens: number): AsyncIterable<string>
```

### 2.2 Daily Quota Helper (`apps/api/src/services/ai.ts` or separate file)

- `checkQuota(userId: string): { allowed: boolean; remaining: number; limit: number }`
- `incrementQuota(userId: string): void`
- Uses Redis key `ai:quota:{userId}` with 24-hour TTL
- Reads limit from `AI_DAILY_GENERATION_LIMIT` env var (default 10)
- Checks `ai_unlimited_generations` flag for bypass

### 2.3 AI Route (`apps/api/src/routes/ai.ts`)

```
POST /api/ai/generate
  Middleware: requireAuth(), requireFeature('ai_content_generation'), aiRateLimit
  Body: { prompt, length?, documentContext?, cursorContext?, notebookId? }
  Response: SSE stream (text/event-stream)
    data: {"type":"token","content":"..."}
    data: {"type":"done"}
    data: {"type":"error","message":"..."}
  Headers: X-AI-Generations-Remaining, X-AI-Generations-Limit
```

**Rate limiter:** 20 requests / 15 minutes per user (separate from auth rate limiter).

**Audit logging:** Log `ai.generate` event with prompt (truncated 500 chars), length, userId, outcome.

### 2.4 Route Registration (`apps/api/src/app.ts`)

```ts
import aiRoutes from './routes/ai.js';
app.use('/api/ai', aiRoutes);
```

### Tests (Phase 2)

| # | Test | File | Type |
|---|------|------|------|
| 2.1 | Rejects unauthenticated requests (401) | `apps/api/src/tests/ai.test.ts` | Integration |
| 2.2 | Returns 404 when `ai_content_generation` flag is disabled | `apps/api/src/tests/ai.test.ts` | Integration |
| 2.3 | Validates prompt — rejects empty (400) | `apps/api/src/tests/ai.test.ts` | Integration |
| 2.4 | Validates prompt — rejects over 2000 chars (400) | `apps/api/src/tests/ai.test.ts` | Integration |
| 2.5 | Validates length — rejects invalid value (400) | `apps/api/src/tests/ai.test.ts` | Integration |
| 2.6 | Returns SSE stream with token events (mock Azure SDK) | `apps/api/src/tests/ai.test.ts` | Integration |
| 2.7 | Returns `done` event after stream completes | `apps/api/src/tests/ai.test.ts` | Integration |
| 2.8 | Returns `error` event on Azure SDK failure | `apps/api/src/tests/ai.test.ts` | Integration |
| 2.9 | Rate limiter returns 429 after 20 requests | `apps/api/src/tests/ai.test.ts` | Integration |
| 2.10 | Quota returns 429 when daily limit exhausted | `apps/api/src/tests/ai.test.ts` | Integration |
| 2.11 | Quota headers present in response | `apps/api/src/tests/ai.test.ts` | Integration |
| 2.12 | `ai_unlimited_generations` flag bypasses quota | `apps/api/src/tests/ai.test.ts` | Integration |
| 2.13 | System prompt includes length guidance for each setting | `apps/api/src/tests/ai.test.ts` | Unit |
| 2.14 | Document context is truncated at 100K chars with note | `apps/api/src/tests/ai.test.ts` | Unit |
| 2.15 | Document context includes `[INSERT HERE]` marker | `apps/api/src/tests/ai.test.ts` | Unit |
| 2.16 | Audit log entry is created on success | `apps/api/src/tests/ai.test.ts` | Integration |
| 2.17 | Audit log entry is created on error | `apps/api/src/tests/ai.test.ts` | Integration |

**Mocking approach:** Mock the `@azure-rest/ai-inference` SDK at the module level using `vi.mock()`. Return a fake async iterable that yields test tokens. This avoids calling the real Azure endpoint in tests.

### Commit

```
feat(ai): add AI generation service, route, quota, and audit logging

- Azure AI Foundry SDK integration with streaming
- POST /api/ai/generate with SSE response
- Daily quota tracking via Redis (configurable via AI_DAILY_GENERATION_LIMIT)
- Rate limiting (20/15min per user)
- Document context injection with [INSERT HERE] cursor marker
- Length parameter mapping (short/medium/long → max_tokens)
- Audit logging for all generation requests
- 17 integration/unit tests
```

---

## Phase 3 — Frontend Prompt Modal & Streaming Client

**Goal:** Build the prompt modal UI and the SSE streaming client. No editor integration yet — these are standalone components that can be tested in isolation.

### 3.1 SSE Streaming Client (`apps/web/src/api/ai.ts`)

```ts
export function generateAiContent(
  params: {
    prompt: string;
    length: 'short' | 'medium' | 'long';
    documentContext?: string;
    cursorContext?: string;
    notebookId?: string;
  },
  callbacks: {
    onToken: (text: string) => void;
    onDone: () => void;
    onError: (msg: string) => void;
  }
): AbortController
```

- Uses `fetch()` to `POST /api/ai/generate` with SSE streaming
- Reads response via `ReadableStream.getReader()` + `TextDecoder`
- Parses SSE `data:` lines, dispatches callbacks
- Returns `AbortController` for cancellation
- Reads `X-AI-Generations-Remaining` and `X-AI-Generations-Limit` headers

### 3.2 Prompt Modal (`apps/web/src/components/editor/AiPromptModal.tsx`)

Layout (follows `InputModal` pattern):
- Fixed overlay backdrop
- Centered card (~480px max-width)
- Title: "Create with AI"
- Subtitle: "Describe the content you'd like to generate"
- `<textarea>` with 3-row minimum, auto-grow
- **Length toggle:** 3-segment pill selector (Short / Medium / Long), default Medium
- **Remaining count:** "8 of 10 remaining today" (fetched from quota headers or a preflight check)
- **Quota exhausted state:** Create button disabled, message shown
- **Disclaimer:** Small muted text at bottom
- Footer: Cancel + Create buttons
- Keyboard: `Cmd/Ctrl+Enter` submits, `Escape` cancels

Props:
```ts
interface AiPromptModalProps {
  onSubmit: (prompt: string, length: 'short' | 'medium' | 'long') => void;
  onCancel: () => void;
  remainingQuota: number | null;
  quotaLimit: number | null;
}
```

### 3.3 i18n Strings (`apps/web/src/locales/en/translation.json`)

Add all `editor.ai.*` keys from the requirements document.

### Tests (Phase 3)

| # | Test | File | Type |
|---|------|------|------|
| 3.1 | Modal renders with title, textarea, length toggle | `apps/web/src/tests/AiPromptModal.test.tsx` | Unit |
| 3.2 | Create button disabled when textarea is empty | `apps/web/src/tests/AiPromptModal.test.tsx` | Unit |
| 3.3 | Create button disabled when quota exhausted (remaining=0) | `apps/web/src/tests/AiPromptModal.test.tsx` | Unit |
| 3.4 | Submits prompt and length on Create click | `apps/web/src/tests/AiPromptModal.test.tsx` | Unit |
| 3.5 | Submits on Cmd+Enter | `apps/web/src/tests/AiPromptModal.test.tsx` | Unit |
| 3.6 | Cancels on Escape | `apps/web/src/tests/AiPromptModal.test.tsx` | Unit |
| 3.7 | Length toggle defaults to Medium | `apps/web/src/tests/AiPromptModal.test.tsx` | Unit |
| 3.8 | Length toggle changes selected value | `apps/web/src/tests/AiPromptModal.test.tsx` | Unit |
| 3.9 | Disclaimer text is displayed | `apps/web/src/tests/AiPromptModal.test.tsx` | Unit |
| 3.10 | Remaining quota is displayed correctly | `apps/web/src/tests/AiPromptModal.test.tsx` | Unit |
| 3.11 | SSE client parses token events | `apps/web/src/tests/ai-client.test.ts` | Unit |
| 3.12 | SSE client calls onDone on done event | `apps/web/src/tests/ai-client.test.ts` | Unit |
| 3.13 | SSE client calls onError on error event | `apps/web/src/tests/ai-client.test.ts` | Unit |
| 3.14 | SSE client abort cancels the request | `apps/web/src/tests/ai-client.test.ts` | Unit |

### Commit

```
feat(ai): add prompt modal, SSE streaming client, and i18n strings

- AiPromptModal with textarea, length toggle, quota display, disclaimer
- SSE streaming client with abort support
- i18n strings for all AI UI text
- 14 unit tests
```

---

## Phase 4 — TipTap AI Widget Extension

**Goal:** Create the custom TipTap node that renders the AI generation widget in the document — shimmer loading, streaming content, accept/reject controls, error state.

### 4.1 Extension (`apps/web/src/components/editor/AiGenerationExtension.ts`)

Custom TipTap node definition:
- `name: 'aiGeneration'`
- `group: 'block'`, `atom: true`, `selectable: true`, `draggable: false`
- Attributes: `prompt`, `status`, `content`, `errorMessage`, `ownerId`, `length`
- Rendered via `ReactNodeViewRenderer` → `AiGenerationWidget`
- Commands: `insertAiWidget({ prompt, length, ownerId })`, `removeAiWidget(pos)`, `retryAiWidget(pos)`

### 4.2 Widget Component (`apps/web/src/components/editor/AiGenerationWidget.tsx`)

React node view with 4 states:

**Loading state:**
- Shimmer skeleton (3–5 animated gradient bars of varying widths)
- Animated rotating gradient border (blue→violet→pink→blue)
- "Generating with AI…" label with sparkle icon

**Streaming state:**
- Content fades in, replacing shimmer
- Animated border continues
- Pulsing dot at bottom while streaming

**Complete state:**
- Static subtle border
- Rendered content (Markdown→HTML via `markdownToHtml` + `DOMPurify.sanitize`)
- Action bar: Accept (✓ Insert) + Reject (✗ Discard)
- Keyboard: Enter to accept, Escape to reject

**Error state:**
- Red/orange border
- Error message
- Retry + Dismiss buttons

**Collaborative view (non-owner):**
- Compact slug: sparkle icon + "Generating with AI…"
- No action buttons
- Subtle animated border

### 4.3 CSS Animations (`apps/web/src/components/editor/editor.css`)

- `@property --angle` + `@keyframes ai-border-rotate` — rotating gradient border
- `@keyframes ai-shimmer` — horizontal gradient sweep for skeleton lines
- `.ai-widget`, `.ai-widget::before` — border gradient mask technique
- `.ai-shimmer-line` — skeleton bar styling
- Dark mode variants
- `prefers-reduced-motion` fallback (static border, no shimmer animation)

### 4.4 Register Extension (`apps/web/src/components/editor/extensions.ts`)

Add `AiGenerationExtension` to `getEditorExtensions()`.

### Tests (Phase 4)

| # | Test | File | Type |
|---|------|------|------|
| 4.1 | Widget renders loading state with shimmer | `apps/web/src/tests/AiGenerationWidget.test.tsx` | Unit |
| 4.2 | Widget renders streaming state with content | `apps/web/src/tests/AiGenerationWidget.test.tsx` | Unit |
| 4.3 | Widget renders complete state with accept/reject | `apps/web/src/tests/AiGenerationWidget.test.tsx` | Unit |
| 4.4 | Widget renders error state with retry/dismiss | `apps/web/src/tests/AiGenerationWidget.test.tsx` | Unit |
| 4.5 | Widget renders collaborative slug for non-owner | `apps/web/src/tests/AiGenerationWidget.test.tsx` | Unit |
| 4.6 | Accept inserts content and removes widget | `apps/web/src/tests/AiGenerationWidget.test.tsx` | Unit |
| 4.7 | Reject removes widget without inserting content | `apps/web/src/tests/AiGenerationWidget.test.tsx` | Unit |
| 4.8 | Retry re-sends the same prompt | `apps/web/src/tests/AiGenerationWidget.test.tsx` | Unit |
| 4.9 | Extension registers as block node with correct attrs | `apps/web/src/tests/AiGenerationExtension.test.ts` | Unit |
| 4.10 | insertAiWidget command creates node at cursor | `apps/web/src/tests/AiGenerationExtension.test.ts` | Unit |
| 4.11 | Keyboard Enter accepts, Escape rejects | `apps/web/src/tests/AiGenerationWidget.test.tsx` | Unit |
| 4.12 | prefers-reduced-motion disables animations | `apps/web/src/tests/AiGenerationWidget.test.tsx` | Unit |

### Commit

```
feat(ai): add TipTap AI widget extension with shimmer and streaming

- AiGenerationExtension: custom block node with prompt/status/content attrs
- AiGenerationWidget: 4-state React node view (loading, streaming, complete, error)
- Collaborative view: compact sparkle slug for non-owners
- CSS animations: rotating gradient border, shimmer skeleton
- 12 unit tests
```

---

## Phase 5 — Entry Points & Integration

**Goal:** Wire everything together — slash command, toolbar button, mobile FAB, and the MarkdownEditor orchestration that connects modal → widget → streaming → insert.

### 5.1 Slash Command (`apps/web/src/components/editor/SlashCommands.ts`)

Add as first entry in `slashCommands` array:
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

Gate behind feature flag: filter the command list based on `useFlag('ai_content_generation')` in `SlashCommandMenu.tsx`.

### 5.2 Toolbar Button (`apps/web/src/components/editor/EditorToolbar.tsx`)

Add sparkle icon button after Print, before mobile overflow:
- Desktop: always visible (when flag enabled)
- Dispatches `ai:open-prompt` event
- Gated behind `useFlag('ai_content_generation')`

### 5.3 Mobile FAB (`apps/web/src/components/editor/MobileCommandFab.tsx`)

New component:
- `md:hidden` — only visible on mobile
- 56px circular button, bottom-right, elevated shadow
- On tap: opens popover/bottom-sheet with full slash command list
- "Create with AI" is first item (when flag enabled)
- Selecting any command executes it and closes the menu
- Only visible when editor is focused

### 5.4 MarkdownEditor Orchestration (`apps/web/src/components/editor/MarkdownEditor.tsx`)

Coordinate the full flow:
1. Listen for `ai:open-prompt` event → capture cursor position
2. Open `AiPromptModal` with current quota info
3. On submit → insert AI widget at cursor position via `editor.commands.insertAiWidget()`
4. Widget component calls `generateAiContent()` SSE client
5. Stream tokens into widget via node attribute updates
6. On accept → `editor.commands.removeAiWidget()` + insert HTML content
7. On reject → `editor.commands.removeAiWidget()` (no content)
8. Extract document context: `htmlToMarkdown(editor.getHTML())` with cursor position marker

### Tests (Phase 5)

| # | Test | File | Type |
|---|------|------|------|
| 5.1 | "Create with AI" appears first in slash command list | `apps/web/src/tests/SlashCommands.test.ts` | Unit |
| 5.2 | "Create with AI" hidden when flag disabled | `apps/web/src/tests/SlashCommands.test.ts` | Unit |
| 5.3 | Toolbar sparkle button dispatches ai:open-prompt | `apps/web/src/tests/EditorToolbar.test.tsx` | Unit |
| 5.4 | Toolbar sparkle button hidden when flag disabled | `apps/web/src/tests/EditorToolbar.test.tsx` | Unit |
| 5.5 | Mobile FAB renders on small screens | `apps/web/src/tests/MobileCommandFab.test.tsx` | Unit |
| 5.6 | Mobile FAB opens command menu with AI first | `apps/web/src/tests/MobileCommandFab.test.tsx` | Unit |
| 5.7 | Mobile FAB hidden on desktop | `apps/web/src/tests/MobileCommandFab.test.tsx` | Unit |
| 5.8 | Full flow: slash cmd → modal → widget → accept → content inserted | `apps/web/src/tests/ai-integration.test.tsx` | Integration |
| 5.9 | Full flow: toolbar → modal → widget → reject → no content | `apps/web/src/tests/ai-integration.test.tsx` | Integration |
| 5.10 | Document context extracted with cursor marker | `apps/web/src/tests/ai-integration.test.tsx` | Integration |

### E2E Tests (Playwright)

| # | Test | File |
|---|------|------|
| E2E.1 | Slash command → Create with AI → prompt → accept | `e2e/ai.spec.ts` |
| E2E.2 | Toolbar button → prompt → reject → no content | `e2e/ai.spec.ts` |
| E2E.3 | Length toggle: Short vs Long generates different lengths | `e2e/ai.spec.ts` |
| E2E.4 | Error state → retry → success | `e2e/ai.spec.ts` |
| E2E.5 | Feature flag disabled → no AI UI elements | `e2e/ai.spec.ts` |
| E2E.6 | Quota exhausted → Create button disabled | `e2e/ai.spec.ts` |
| E2E.7 | Mobile FAB → command menu → AI option | `e2e/ai.spec.ts` |

**E2E mocking:** For E2E tests, mock the Azure AI endpoint at the API level (intercept in test setup or use a test-only env var `AI_MOCK_RESPONSES=true` that returns canned responses).

### Commit

```
feat(ai): wire up slash command, toolbar, mobile FAB, and full flow

- "Create with AI" slash command (first in list, flag-gated)
- Sparkle toolbar button (desktop, flag-gated)
- MobileCommandFab: floating action button with slash command menu
- MarkdownEditor orchestration: modal → widget → stream → insert
- 10 unit/integration tests + 7 E2E tests
```

---

## Phase 6 — Legal, Privacy & Polish

**Goal:** Update legal and marketing copy to reflect the new AI data handling, and add final polish.

### 6.1 Privacy Policy (`apps/web/src/components/legal/PrivacyPage.tsx`)

Add a new section (or update existing) disclosing:
- When using the AI generation feature, the user's prompt text **and** document content are sent to Azure OpenAI (Microsoft) for processing
- This data is not stored by the AI service beyond the request lifecycle
- Users can opt out by not using the AI feature
- The feature is opt-in (flag-gated)

### 6.2 Terms of Service (`apps/web/src/components/legal/TermsPage.tsx`)

Add:
- AI-generated content is provided as-is; users are responsible for reviewing
- Third-party AI service (Microsoft Azure OpenAI) processes data per their terms
- Usage limits may apply

### 6.3 Marketing Copy

**`apps/web/src/components/marketing/FeaturesPage.tsx`:**
- Update or caveat the "never sends your content" claim — when AI feature is used, document context is sent to Azure OpenAI
- Add AI generation as a feature highlight

**`apps/web/src/components/marketing/AboutPage.tsx`:**
- Similar update to data handling claims

### 6.4 README.md

Update the data handling claims in the project README.

### 6.5 Polish

- Review all dark mode styling
- Test `prefers-reduced-motion` fallback
- Review mobile responsive layout
- Verify screen reader announcements
- Performance check: lazy-load AI components behind `React.lazy()` + `Suspense`

### Tests (Phase 6)

| # | Test | File | Type |
|---|------|------|------|
| 6.1 | Privacy page mentions AI/Azure OpenAI | `apps/web/src/tests/legal.test.tsx` | Unit |
| 6.2 | Terms page mentions AI-generated content | `apps/web/src/tests/legal.test.tsx` | Unit |

### Commit

```
docs(ai): update privacy, terms, and marketing for AI data handling

- Privacy policy: disclose AI service data sharing
- Terms: AI content disclaimer, third-party processing
- Marketing: update data handling claims, add AI feature
- README: update data handling section
```

---

## Test Summary

### Total Test Count

| Phase | Unit | Integration | E2E | Total |
|-------|------|-------------|-----|-------|
| 1 | 0 | 4 | 0 | 4 |
| 2 | 3 | 14 | 0 | 17 |
| 3 | 14 | 0 | 0 | 14 |
| 4 | 12 | 0 | 0 | 12 |
| 5 | 7 | 3 | 7 | 17 |
| 6 | 2 | 0 | 0 | 2 |
| **Total** | **38** | **21** | **7** | **66** |

### Test Files

| File | Phase | Runner |
|------|-------|--------|
| `apps/api/src/tests/ai-flags.test.ts` | 1 | Vitest (API) |
| `apps/api/src/tests/ai.test.ts` | 2 | Vitest (API) |
| `apps/web/src/tests/AiPromptModal.test.tsx` | 3 | Vitest (Web) |
| `apps/web/src/tests/ai-client.test.ts` | 3 | Vitest (Web) |
| `apps/web/src/tests/AiGenerationWidget.test.tsx` | 4 | Vitest (Web) |
| `apps/web/src/tests/AiGenerationExtension.test.ts` | 4 | Vitest (Web) |
| `apps/web/src/tests/SlashCommands.test.ts` | 5 | Vitest (Web) |
| `apps/web/src/tests/EditorToolbar.test.tsx` | 5 | Vitest (Web) |
| `apps/web/src/tests/MobileCommandFab.test.tsx` | 5 | Vitest (Web) |
| `apps/web/src/tests/ai-integration.test.tsx` | 5 | Vitest (Web) |
| `apps/web/src/tests/legal.test.tsx` | 6 | Vitest (Web) |
| `e2e/ai.spec.ts` | 5 | Playwright |

---

## Local Testing Instructions

### Prerequisites

1. Docker running (for PostgreSQL, Redis, Mailpit)
2. Azure AI Foundry resource provisioned with GPT-4.1-nano deployment
3. Valid `.env` with Azure AI credentials

### Step-by-Step

#### 1. Start local environment

```bash
./dev.sh start
```

This starts PostgreSQL, Redis, Mailpit, API server (3001), collab server (3002), web (5173), and admin (5174).

#### 2. Run the new migration

The migration runs automatically on `./dev.sh start` (it runs all pending migrations). Verify:

```bash
psql postgresql://notebookmd:localdev@localhost:5432/notebookmd \
  -c "SELECT key, enabled FROM feature_flags WHERE key LIKE 'ai_%';"
```

Expected: two rows, both `enabled = false`.

#### 3. Enable the feature flag

Via admin UI (`http://localhost:5174`) → Feature Flags → toggle `ai_content_generation` to enabled.

Or via CLI:

```bash
./dev.sh flighting   # if flighting helper supports it
# Or directly:
curl -X POST http://localhost:3001/api/admin/feature-flags \
  -H 'Content-Type: application/json' \
  -b '<admin-cookie>' \
  -d '{"key":"ai_content_generation","enabled":true}'
```

#### 4. Set Azure AI credentials

Add to `.env`:

```env
AZURE_AI_ENDPOINT=https://<your-resource>.services.ai.azure.com
AZURE_AI_API_KEY=<your-key>
AZURE_AI_MODEL=gpt-4.1-nano
AI_DAILY_GENERATION_LIMIT=10
```

Restart the API server to pick up new env vars:

```bash
./dev.sh stop && ./dev.sh start
# Or just restart the API process
```

#### 5. Run backend tests

```bash
npm -w apps/api run test -- ai
```

This runs all test files matching "ai" (ai-flags.test.ts, ai.test.ts).

#### 6. Run frontend tests

```bash
npm -w apps/web run test -- ai
npm -w apps/web run test -- AiPromptModal
npm -w apps/web run test -- AiGeneration
npm -w apps/web run test -- MobileCommandFab
```

#### 7. Run all tests

```bash
npm test                    # API tests
npm -w apps/web run test    # Web tests
```

#### 8. Manual smoke test

1. Open `http://localhost:5173` and sign in
2. Open or create a notebook → open a document
3. Type `/` — verify "Create with AI" appears first in the slash command menu
4. Select it → verify prompt modal opens
5. Type a prompt (e.g., "Write an introduction to TypeScript")
6. Select "Medium" length → click Create
7. Verify: widget appears with shimmer animation and animated border
8. Verify: content streams in progressively
9. Verify: accept/reject buttons appear when done
10. Click Accept → verify content is inserted into the document
11. Repeat with Reject → verify no content is inserted
12. Test the toolbar sparkle button (same flow)
13. Resize browser to mobile → verify FAB appears at bottom-right
14. Tap FAB → verify command menu with AI at top
15. Test quota: generate 10 times → verify 11th shows quota exhausted

#### 9. Run E2E tests

```bash
# Start production-like environment
docker compose -f docker-compose.prod.yml up -d

# Run AI E2E tests
npx playwright test e2e/ai.spec.ts

# View report on failure
npx playwright show-report
```

#### 10. Lint and typecheck

```bash
npm run lint
npm run typecheck
```

---

## Production Deployment

### Pre-Deployment Checklist

- [x] Azure AI Foundry resource created with GPT-4.1-nano deployment
- [x] `AZURE_AI_ENDPOINT` set in Container App secrets
- [x] `AZURE_AI_API_KEY` stored as Container App secret
- [x] `AZURE_AI_MODEL` set to `gpt-4.1-nano`
- [x] `AI_DAILY_GENERATION_LIMIT` set to `10`
- [x] `BRAVE_SEARCH_API_KEY` stored as Container App secret (for web grounding)
- [x] Feature flags seeded (migrations 012 + 013 applied)
- [x] `ai_content_generation` enabled in production
- [x] `ai_web_search` seeded as disabled (enable when ready)
- [x] Azure OpenAI quota increased to 30 req/min / 30K TPM
- [x] CI pipeline passes (all tests green)
- [x] Privacy policy and terms updated
- [x] README and marketing copy updated
- [x] API + Web images built, pushed to ACR, and deployed (v0.2.7)

### Deployment Steps

#### 1. Provision Azure AI Foundry

```bash
# In Azure portal or via CLI:
# 1. Create an Azure AI Services resource (or use existing)
# 2. Deploy GPT-4.1-nano model
# 3. Note the endpoint URL and API key
```

#### 2. Add secrets to Azure Key Vault

```bash
az keyvault secret set \
  --vault-name <vault-name> \
  --name AZURE-AI-API-KEY \
  --value "<api-key>"
```

#### 3. Update Terraform (if managing Container App env vars via Terraform)

Add to the API container app environment variables in `infra/terraform/container_apps.tf`:

```hcl
env {
  name  = "AZURE_AI_ENDPOINT"
  value = "https://<resource>.services.ai.azure.com"
}
env {
  name  = "AZURE_AI_MODEL"
  value = "gpt-4.1-nano"
}
env {
  name        = "AZURE_AI_API_KEY"
  secret_name = "azure-ai-api-key"
}
env {
  name  = "AI_DAILY_GENERATION_LIMIT"
  value = "10"
}
```

#### 4. Deploy via tagged release

```bash
git tag v<next-version>
git push origin v<next-version>
```

This triggers the deploy workflow which:
1. Detects changes vs. previous tag
2. Runs CI gate (verifies Build & Test passed)
3. Builds Docker images (API, Web, Admin, Collab) → pushes to ACR
4. Deploys Container Apps with new images
5. Runs API health check

#### 5. Run migration in production

The API container runs pending migrations on startup. Verify:

```bash
# Check Container App logs
az containerapp logs show --name api --resource-group <rg> --follow
# Look for: "Migration 012_ai-feature-flags.sql applied"
```

#### 6. Staged rollout

1. **Initial state:** Both flags disabled → no users see AI features
2. **Internal testing:** Create a flight targeting internal users/testers:
   - Admin UI → Flights → create "ai-beta" flight
   - Add `ai_content_generation` flag to the flight
   - Assign internal user group
3. **Beta rollout:** Add `ai_content_generation` flag to a broader beta flight with rollout percentage (e.g., 10%)
4. **GA:** Enable `ai_content_generation` globally (100% rollout)
5. **Unlimited users:** Assign `ai_unlimited_generations` via flights to specific users/groups as needed

### Post-Deployment Monitoring

- **Azure AI metrics:** Monitor token usage, request count, latency, errors in Azure portal
- **Application logs:** Monitor `ai.generate` audit log entries for error rate
- **Redis:** Monitor `ai:quota:*` key count for active users
- **Cost:** Set up Azure cost alerts on the AI Services resource
- **Rate limit 429s:** Monitor for spikes indicating abuse

### Rollback

If issues arise:
1. **Quick:** Disable `ai_content_generation` flag via admin UI → instantly hides all AI features
2. **Full:** Redeploy previous tagged version (the migration is additive — it only adds flags, no schema changes to roll back)

---

## File Inventory

### New Files (14)

| File | Phase |
|------|-------|
| `apps/api/migrations/012_ai-feature-flags.sql` | 1 |
| `apps/api/migrations/013_ai-web-search-flag.sql` | 7 |
| `apps/api/src/services/ai.ts` | 2 |
| `apps/api/src/routes/ai.ts` | 2 |
| `apps/api/src/tests/ai-flags.test.ts` | 1 |
| `apps/api/src/tests/ai.test.ts` | 2 |
| `apps/web/src/api/ai.ts` | 3 |
| `apps/web/src/components/editor/AiPromptModal.tsx` | 3 |
| `apps/web/src/components/editor/AiGenerationExtension.ts` | 4 |
| `apps/web/src/components/editor/AiGenerationWidget.tsx` | 4 |
| `apps/web/src/components/editor/MobileCommandFab.tsx` | 5 |
| `apps/web/src/tests/AiPromptModal.test.tsx` | 3 |
| `apps/web/src/tests/ai-client.test.ts` | 3 |
| `apps/web/src/tests/legal.test.tsx` | 6 |
| `e2e/ai.spec.ts` | 5 |

### Modified Files (18)

| File | Phase | Change |
|------|-------|--------|
| `.env.example` | 1 | Azure AI + Brave Search env vars |
| `apps/api/src/app.ts` | 2 | Register AI routes |
| `apps/web/src/components/editor/SlashCommands.ts` | 5 | Add "Create with AI" command |
| `apps/web/src/components/editor/SlashCommandMenu.tsx` | 5 | Feature flag filtering |
| `apps/web/src/components/editor/EditorToolbar.tsx` | 5 | Add sparkle button |
| `apps/web/src/components/editor/MarkdownEditor.tsx` | 5, 7 | AI orchestration + webSearch param |
| `apps/web/src/components/editor/extensions.ts` | 4 | Register AI extension |
| `apps/web/src/components/editor/editor.css` | 4 | AI animations |
| `apps/web/src/locales/en/translation.json` | 3 | i18n strings |
| `apps/web/src/components/legal/PrivacyPage.tsx` | 6 | AI disclosure |
| `apps/web/src/components/legal/TermsPage.tsx` | 6 | AI terms |
| `apps/web/src/components/marketing/FeaturesPage.tsx` | 6 | Update claims |
| `apps/web/src/components/marketing/AboutPage.tsx` | 6 | Update claims |
| `README.md` | 6 | Update data handling |
| `infra/terraform/variables.tf` | 7 | AI + Brave Search variables |
| `infra/terraform/container_apps.tf` | 7 | AI env vars + secrets on API container |
