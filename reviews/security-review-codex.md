# Security Review: requirements/requirements.md

## 1) Admin console allows OAuth admins without enforced MFA
**Severity:** High  
**Where:** `requirements/requirements.md:52-55`, `687-689`, `1083`  
**Concern:** The spec explicitly treats OAuth logins as sufficient for admin access and defers MFA enforcement (`amr`/MFA check) to the future. That means a compromised single-factor OAuth session (or provider account without MFA) can reach full admin capabilities (`/admin/users`, `/admin/feature-flags`, `/admin/announcements`, etc.).  
**Recommendation:** Require strong MFA for **all** admin logins now (email/password and OAuth). Enforce via IdP policy/claims (`amr`, `acr`, or provider-specific equivalent), and fail closed when MFA assurance is absent.

## 2) Automatic cross-provider account merging by email enables takeover paths
**Severity:** High  
**Where:** `requirements/requirements.md:71-73`  
**Concern:** The spec auto-merges accounts when emails match across providers. Email equality alone is not a safe identity proof across IdPs (reassigned enterprise emails, provider verification differences, edge-case aliasing/normalization). This creates a potential account-linking takeover if an attacker can authenticate to a provider presenting the same email string.  
**Recommendation:** Replace automatic merge with a step-up verification flow (existing-session confirmation, re-auth with existing factor, or signed email challenge to the already-linked account) before link/merge is finalized.

## 3) Provider OAuth tokens are intended for direct browser use
**Severity:** High  
**Where:** `requirements/requirements.md:539-541`, `82-83`, `897-903`  
**Concern:** Architecture states clients call source APIs directly using tokens obtained via backend. Exposing provider access tokens in browser context materially increases theft/exfiltration risk (XSS, malicious extensions, compromised client runtime). For GitHub/Drive/OneDrive scopes, token compromise grants direct data access at provider side.  
**Recommendation:** Keep long-lived/refresh credentials server-side only. Use backend as a strict proxy or issue narrowly-scoped, short-lived delegated tokens bound to specific operations/resources; combine with robust CSP and token non-persistence in browser storage.

## 4) Production “account-level dev mode” can expose sensitive internals
**Severity:** High  
**Where:** `requirements/requirements.md:603-610`  
**Concern:** The spec enables dev-mode behavior in production for flagged users, including verbose logging/debug behavior and (dev-mode definition includes) detailed errors/stack traces. In production, this meaningfully expands information disclosure risk and can leak internals or sensitive operational metadata.  
**Recommendation:** Disallow verbose stack traces/debug payloads in production entirely. If diagnostic access is required, gate it through audited admin-only tooling with redaction, time-limited elevation, and explicit break-glass controls.

## 5) GitHub webhook validation lacks replay protection requirements
**Severity:** Medium  
**Where:** `requirements/requirements.md:911`  
**Concern:** The webhook requirement mentions signature verification only. Without replay defenses (delivery ID dedupe + timestamp window), a valid captured webhook can be replayed to retrigger processing or state changes.  
**Recommendation:** Require HMAC verification **and** replay controls: validate event freshness, persist `X-GitHub-Delivery` IDs for idempotency, reject duplicates, and log suspicious repeats.

## 6) CI/CD supply-chain integrity controls are incomplete
**Severity:** Medium  
**Where:** `requirements/requirements.md:850-855`, `838-841`  
**Concern:** Vulnerability scanning is specified, but no hard requirement for signed/provenance-attested images or digest-pinned deployments. Also, using `latest` as a production pointer is mutable and weakens deployment integrity/forensics.  
**Recommendation:** Enforce immutable digest deployments, require image signing + provenance attestations (e.g., Sigstore/cosign + SLSA-aligned provenance), and treat scan findings as policy gates for release.

## 7) Cookie consent model is likely insufficient for GDPR/ePrivacy expectations
**Severity:** Medium  
**Where:** `requirements/requirements.md:1147-1151`  
**Concern:** Banner explicitly provides “Accept” + “Manage Preferences” but no equivalent one-click “Reject non-essential” action; consent is described as stored per user, which may not cover anonymous/pre-login visitors appropriately. This creates compliance risk around freely-given, symmetric choice and consent state handling.  
**Recommendation:** Add explicit “Reject non-essential” at first layer, store consent state for anonymous users as needed, record consent evidence (timestamp/version), and block analytics until explicit opt-in.

## 8) “No document content stored centrally” lacks enforceable controls for transit/logging
**Severity:** Medium  
**Where:** `requirements/requirements.md:18`, `87`, `539-541`, `897-903`, `1042`  
**Concern:** Spec asserts no centralized content storage, but API includes file-content proxy endpoints and optional backend proxying for CORS. Without explicit controls, document content can leak into request/response logs, error traces, monitoring payloads, or debug tooling.  
**Recommendation:** Add hard requirements for content-data minimization: no body logging on file endpoints, structured log redaction, telemetry scrubbing, short retention for transient buffers, and tests/controls to prove content never persists outside intended transient processing.
