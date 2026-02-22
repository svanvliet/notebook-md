# Security Review Discussion: OAuth Tokens & Browser Architecture

**Context:** Security Review Finding #2 (Critical) — "OAuth Tokens Sent to the Browser"  
**Date:** 2026-02-17

---

## The Issue

The current architecture in §8.2 states that the browser client communicates **directly** with source system APIs (OneDrive, Google Drive, GitHub) using OAuth tokens obtained via the backend. This means the user's OAuth access tokens — which grant read/write access to their cloud storage — are transmitted to and held in the browser's JavaScript runtime.

The security risk: if any XSS vulnerability exists in the app (or in any dependency — Tiptap, ProseMirror, a syntax highlighter, etc.), an attacker could steal those tokens and gain full access to the user's OneDrive, Google Drive, or GitHub repos. The blast radius extends far beyond Notebook.md.

## What You're Asking For

You want:
1. The user authenticates with the source provider (e.g., Microsoft) via standard OAuth
2. The **user's token** (not an app-specific token) is the credential used for file operations
3. You don't want a separate "app token" layer — the user's identity with the provider is what matters

This is a completely reasonable and correct design goal. The question is: **where does that user token live and who uses it?**

## The Key Insight: "User's Token" ≠ "Token in the Browser"

Your user's OAuth token can absolutely be the credential used for all file operations — the security concern is only about **where that token is stored and who makes the API calls with it**. There are three approaches:

### Approach A: Token in Browser (Current Design) ❌

```
Browser ──[user's token]──► OneDrive API
```

- Token lives in browser memory/storage
- Browser makes direct API calls to OneDrive/Google/GitHub
- **Pro:** Lower latency, no backend load for file ops
- **Con:** Any XSS = token theft = full cloud storage compromise

### Approach B: Backend Proxy with User's Token ✅ (Recommended)

```
Browser ──[session cookie]──► Notebook.md API ──[user's token]──► OneDrive API
```

- Token lives **only** on the backend, encrypted at rest
- Browser authenticates to the Notebook.md API with a session cookie (HttpOnly, Secure)
- The Notebook.md API uses **the user's own OAuth token** (not an app token) to call OneDrive/Google/GitHub on the user's behalf
- **Pro:** XSS can't steal the OAuth token (it never reaches the browser). The session cookie is HttpOnly so JavaScript can't access it either.
- **Con:** All file operations go through your backend (added latency, added backend load)

**This is still the user's token** — it's just held server-side. The user authorized your app via OAuth, your app received their token, and your backend uses it to act on their behalf. This is the standard pattern used by apps like Notion, Figma, and VS Code Web when they integrate with GitHub/Google/etc.

### Approach C: Hybrid with Short-Lived Scoped Tokens ✅ (Advanced)

```
Browser ──[session cookie]──► Notebook.md API ──[user's token]──► Source API
                                    │
                                    ├──► Returns pre-signed download URL for file content
                                    │
Browser ──[pre-signed URL]──► Source API (direct download, no token needed)
```

- Token still lives only on the backend
- For **read** operations: the backend can generate short-lived, pre-authenticated URLs that the browser uses to download file content directly from the source (OneDrive and Google Drive both support this natively)
- For **write** operations: always proxied through the backend (writes are less frequent and more security-sensitive)
- **Pro:** Reduces backend bandwidth for reads (which are the majority); token never in browser; pre-signed URLs expire in minutes and are scoped to a single file
- **Con:** More complex to implement; not all sources support pre-signed URLs equally

## My Recommendation

**Approach B (Backend Proxy)** for V1, with an eye toward **Approach C** as an optimization later.

Here's why:
- It fully addresses the security concern — the OAuth token never reaches the browser
- It still uses the **user's own token**, exactly as you want — no app-specific token layer
- The latency impact is minimal for a WYSIWYG editor (you're loading one document at a time, not streaming video)
- The backend load is manageable — file operations are mostly reading one file on open and writing one file on save, not continuous streaming
- Approach C is a natural optimization you can add later for large files or heavy-read scenarios without changing the security model

### What About Backend Load at Scale?

At the WAU tiers from the cost estimates:
- **100–1,000 WAU:** Negligible. Your API containers easily handle proxying file reads/writes.
- **100,000 WAU:** You'd want to consider Approach C (pre-signed URLs for reads) to offload bandwidth.
- **1,000,000 WAU:** Approach C strongly recommended; may also want CDN-level caching for public/shared content.

The good news: the API endpoint structure in §9.3 (`/api/notebooks/:id/files/*path`) already looks like a proxy pattern. Switching from "browser calls source directly" to "browser calls our API which calls source" doesn't change the client API at all — it's just a backend implementation detail.

## Impact on the Requirements

If we go with Approach B, the following sections need updates:
1. **§8.2** — Architecture diagram: remove the direct browser→source arrow; all traffic flows through the API
2. **§8.2** — Key architectural decision: change from "client communicates directly" to "API proxies all source system operations"
3. **§8.3** — Container strategy: API containers may need slightly more resources to handle file proxy traffic (but nothing dramatic)
4. **§8.13** — Cost estimates: minor increase in API compute at higher WAU tiers due to proxy bandwidth
5. **§11.1** — Performance: add a note about proxy latency budgets

## Questions for You

1. **Are you comfortable with Approach B (backend proxy using the user's own token)?** This gives you exactly the UX you want (user logs in with Microsoft, authorizes the app, their identity is what accesses their files) while keeping the token safe on the backend.

2. **Do you want me to also spec out Approach C (pre-signed URLs for reads) as a documented future optimization in §12?** This would note that at higher scale, read operations can be offloaded to direct source-to-browser downloads using short-lived URLs, without exposing the full OAuth token.

3. **One trade-off to be aware of:** With backend proxy, if the Notebook.md API goes down, users can't access their files (even though the files are in their own OneDrive/Google Drive). With the direct-to-source approach, the browser could still access files even if the API is down (as long as tokens are cached locally). Is this acceptable? For a web app that requires authentication anyway, this is generally fine — if the API is down, the user can't log in to get to the editor regardless.
