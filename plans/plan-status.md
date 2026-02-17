# Notebook.md — Plan Status & Session Context

**Purpose:** This document is the running register of implementation progress, decisions made, and context needed for any agent session to continue the work. If a session ends, a new agent should read this file first to understand where we left off.

**Last Updated:** 2026-02-17

---

## Instructions for Future Agent Sessions

1. **Read these files first** (in this order):
   - `plans/plan-status.md` (this file) — understand what's been done and current state
   - `plans/initial-plan.md` — the phased implementation plan with checkboxes
   - `requirements/requirements.md` — the living requirements document (v1.4)

2. **When making changes:**
   - Update the checklist in `plans/initial-plan.md` as tasks are completed (change `- [ ]` to `- [x]`)
   - Update this file (`plans/plan-status.md`) with a summary of what was done after each subphase
   - If a significant architectural or requirements change is discovered during implementation, update `requirements/requirements.md` — increment the version number and add a changelog note at the top

3. **Development environment:**
   - All work runs locally via `docker compose up`
   - The monorepo is at `/Users/svanvliet/repos/notebook-md`
   - GitHub repo: `svanvliet/notebook-md` (private)
   - Production deployment is deferred to Phase 6

4. **Key decisions made during requirements:**
   - "Workspace" was renamed to "Notebook" — use "Notebook" everywhere
   - iCloud and Apple Sign-In are deferred
   - GitHub integration uses a GitHub App (not OAuth App), named "Notebook.md"
   - Backend proxy model: OAuth tokens never reach the browser; API proxies all source system calls
   - Local notebooks use IndexedDB in the browser
   - Dev mode is a build-time flag (`NODE_ENV`), not a runtime env var
   - Admin promotion is CLI-only (`docker exec`)
   - Working branch naming: `notebook-md/<random-uuid>` (no username leak)
   - Repo is private; CI/CD triggers on `v*` tags
   - Legal entity: Van Vliet Ventures, LLC
   - Tailwind CSS for styling; react-i18next for i18n
   - GFM + footnotes + KaTeX math
   - DOMPurify for Markdown sanitization

5. **Commit conventions:**
   - Always include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer
   - Use descriptive commit messages

---

## Progress Log

### Phase 1: Foundation & Local Editor

#### 1.1 Project Setup
- **Status:** In Progress
- **Started:** 2026-02-17

*(Details will be added as work completes)*

---

## Iteration Notes

*(Record any feedback from the user, design pivots, or technical discoveries here)*

---

## Open Questions

*(Any unresolved questions that need user input)*
