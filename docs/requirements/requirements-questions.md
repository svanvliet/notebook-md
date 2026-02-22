# Notebook.md — Requirements Clarification Questions

These questions are organized by section of the requirements document. Answers will be incorporated into `requirements.md` as decisions are made.

---

## Authentication & Accounts

1. **Email sign-in method:** Should email sign-in use magic links (passwordless), email + password, or offer both? Magic links are simpler and more secure but require email delivery infrastructure. Email + password is more traditional but adds password storage, reset flows, etc.

2. **Account merging:** If a user signs up with Google (user@gmail.com) and later tries to sign in with email using the same address, should these automatically merge into one account? What about if two different providers have different email addresses — should the user be able to manually link them?

3. **Enterprise (M365) considerations:** For Microsoft enterprise accounts, should the app support tenant-level admin consent (so an IT admin can approve Notebook.md for all users in their org)? Or is individual user consent sufficient for V1?

4. **Session duration:** How long should user sessions last before requiring re-authentication? Options: short (1 hour), medium (24 hours), long (30 days with refresh), or "remember me" checkbox.

---

## Workspaces & Storage

5. **iCloud Drive API access:** Apple's iCloud Drive API (CloudKit) has significant limitations for third-party web apps — it's primarily designed for apps distributed through the Apple ecosystem. For the web version, iCloud support may be limited or require workarounds. Should we deprioritize iCloud for V1 and focus on OneDrive, Google Drive, and GitHub? Or is iCloud a must-have?

6. **File type support beyond .md:** Should the app display and allow opening of any other file types in the tree (e.g., `.txt`, `.mdx`, `.markdown`)? Or strictly `.md` only?

7. **File/folder management scope:** Should the app support creating, renaming, deleting, and moving files/folders within a workspace? Or is it read-existing + create-new only for V1?

8. **Image handling in Markdown:** When a user inserts an image into a document, where should the image be stored? Options:
   - Uploaded to the same workspace folder alongside the `.md` file
   - Uploaded to a designated `assets` or `images` subfolder
   - Pasted as a base64 data URI (simple but bloats the file)
   - User provides a URL (no upload)
   - Combination: allow URL or upload to workspace

9. **Multiple workspaces from same source:** Can a user add multiple workspaces from the same provider? E.g., two different OneDrive folders, or two different GitHub repos?

10. **Workspace sharing:** Should workspaces be shareable between Notebook.md users (e.g., "I've configured this GitHub repo as a workspace, here's a link for you to add it too")? Or is each user's workspace list entirely personal?

---

## GitHub-Specific

11. **GitHub save strategy preference:** The requirements document proposes a "working branch" model as the default. Do you have a preference among the options listed (working branch, direct commit, draft PR, fork-based)? Should all be available as user-configurable options, or should we pick one as the default and add others later?

12. **Commit granularity for auto-save:** When auto-save is enabled for a GitHub workspace, how granular should commits be? Options:
    - Every auto-save creates a commit (could produce many small commits)
    - Batch: accumulate changes and commit every N minutes
    - Smart: commit when the user pauses editing for a threshold period
    - Squash on publish: many small commits during editing, squashed into one when "publishing" to the base branch

13. **GitHub permissions scope:** Should the app request access to all of a user's repos, or use GitHub's fine-grained install permissions to let the user select specific repos? Fine-grained is better for security but adds a setup step.

14. **Private repos:** Should the app support private repositories, or only public ones? (This affects the OAuth scopes requested.)

15. **Non-md files in GitHub repos:** For GitHub workspaces, should the app show non-`.md` files as read-only (viewable but not editable), or completely hide them from the tree?

---

## Editor & Document Experience

16. **Markdown flavor:** Which Markdown specification should be the canonical standard? Options:
    - CommonMark (strict, widely supported)
    - GitHub Flavored Markdown (GFM) — CommonMark + tables, task lists, strikethrough, autolinks
    - Extended (GFM + footnotes, math, etc.)
    - Recommendation: GFM as base, with extensions for math and footnotes

17. **Raw Markdown toggle:** Should users be able to toggle between the WYSIWYG view and a raw Markdown source view? This is popular among technical users.

18. **Split view:** Should there be a split-pane mode showing raw Markdown on the left and rendered preview on the right (like many existing Markdown editors)?

19. **Drag-and-drop:** Should the editor support drag-and-drop for:
    - Reordering blocks (paragraphs, headings, etc.)?
    - Dropping images from the desktop into the editor?
    - Dragging files from the workspace tree into the editor (to insert links)?

20. **Find and replace:** Should the editor include a find-and-replace feature (`Cmd/Ctrl+F`)?

21. **Editor keyboard shortcuts:** Beyond standard text editing shortcuts, should the app support a comprehensive shortcut system (e.g., `Cmd+B` for bold, `Cmd+K` for link, etc.)? Should these be customizable?

---

## UI/UX

22. **Workspace pane behavior:** Should the workspace pane be:
    - Always visible (with a resize handle)?
    - Collapsible (toggle with a button or shortcut)?
    - Auto-hiding (slides out on hover)?

23. **Multiple document layout:** Beyond tabs, should the app support split-editor views (two documents side by side)? This is useful for reference while writing.

24. **Responsive / mobile web:** Should the web version be responsive for tablet/phone browsers, or is it desktop-only for V1? (Given native mobile apps are planned for the future.)

25. **Right-to-left (RTL) language support:** Should the editor support RTL languages (Arabic, Hebrew, etc.) for V1?

26. **Notifications:** Beyond the status bar ephemeral messages, should there be a notification system (e.g., toast notifications for errors, sync conflicts, etc.)?

---

## Settings & Preferences

27. **Settings sync:** Should user settings sync across devices (stored server-side), or be local to each browser/app instance?

28. **Per-workspace settings:** Should settings like font, margins, and display mode be configurable per workspace (overriding global defaults), or global only?

29. **Keyboard shortcut customization:** Should keyboard shortcuts be user-configurable in V1?

---

## Deployment & Infrastructure

30. **Domain and SSL:** Are you planning to manage DNS and SSL through GoDaddy, or move DNS to a cloud provider (Azure DNS, Route 53, Cloudflare)? Cloud-managed DNS is generally easier for automated cert management.

31. **Environments:** How many environments do you want? Suggestions:
    - Local development
    - Staging (for testing before production)
    - Production
    - (Optional) Preview environments for pull requests

32. **Monitoring and observability:** What level of monitoring is needed for V1?
    - Basic health checks and uptime monitoring
    - Application Performance Monitoring (APM) with traces and metrics
    - Error tracking (e.g., Sentry)
    - User analytics (e.g., Mixpanel, PostHog)

33. **Backup strategy:** Should there be automated backups of the PostgreSQL database (user metadata)? How frequently?

34. **Cost sensitivity:** Is there a target monthly infrastructure budget for production? This affects choices between managed K8s, serverless containers, etc.

---

## Business & Scope

35. **Pricing model:** Is Notebook.md intended to be free, freemium (free tier + paid), or paid? This affects architecture decisions like usage limits, workspace caps, etc.

36. **V1 scope — what's the MVP?** Of all the features described, which are essential for an initial launch vs. nice-to-have for later? Candidates for deferral:
    - iCloud support (due to API limitations)
    - Desktop apps (launch web-first?)
    - Some Markdown extensions (math, footnotes)
    - Slash commands (could launch with toolbar-only formatting)
    - Auto-save for GitHub (complex; manual save first?)
    
37. **Target users:** Who is the primary audience? 
    - Developers (who are Markdown-native)?
    - Knowledge workers (who want simple note-taking)?
    - Students?
    - Teams/enterprises?
    - This affects UI decisions, feature prioritization, and onboarding flow.

38. **Branding and design system:** Do you have a preferred color palette, design system (e.g., Tailwind, Material), or design reference (an app whose visual style you admire)?

39. **Localization / i18n:** Should the app support multiple languages for V1, or English only?

40. **Legal requirements:** Will the app need a Terms of Service, Privacy Policy, and cookie consent banner for V1? (Likely yes, especially for EU users under GDPR.)

---

*These questions are ordered roughly by impact — answers to earlier questions may significantly affect architecture and implementation decisions. Please answer as many as you'd like, and I'll update the requirements document accordingly.*

---

## Follow-Up Questions (Round 2)

Based on your answers, these additional questions have come up:

### Admin Console

41. **Initial admin account:** How should the first admin account be created? Options:
    - A CLI command or database seed script that promotes an existing account to admin (e.g., `npm run admin:promote user@email.com`)
    - A special invite code or setup wizard on first deployment
    - Hardcoded admin email in environment variables

42. **Admin console auth:** Should admin console access require a stronger auth factor (e.g., require Microsoft or GitHub SSO — no email/password login for admins)? Or is the same auth flow sufficient with the `is_admin` flag?

### GitHub Integration

43. **GitHub App vs OAuth App:** Should the GitHub integration use a GitHub OAuth App (simpler, user grants access to all personal repos) or a GitHub App (more granular, user can install on specific repos)? GitHub Apps are the recommended modern approach and align with your desire to limit to personal repos initially, but they add a setup step (user must "install" the app).

44. **Working branch cleanup:** After a user publishes (squash merges) their working branch, should the working branch be automatically deleted? Or should it be kept for reference?

### Media Files

45. **Media file size limits:** Should there be a maximum file size for uploading media to a Notebook's `assets/` folder? If so, what limit? (Considerations: GitHub has a 100 MB file limit; OneDrive and Google Drive are more generous but API uploads have per-request limits.)

46. **Media preview in editor:** When a media file (image/video) is referenced in a Markdown file, should the WYSIWYG editor render it inline as a preview? Or show a placeholder with a link to view it?

### Deployment & Operations

47. **Azure region preference:** You mentioned single-region for V1. Do you have a preferred Azure region? (Recommendation: East US 2 — good pricing, broad service availability, low latency for US users.)

48. **Custom domain email:** Should transactional emails come from a custom domain (e.g., `noreply@notebookmd.io`) or is a service default (e.g., `via sendgrid.net`) acceptable for V1? Custom domain requires DNS records (SPF, DKIM, DMARC).

49. **Source code repository:** Will the Notebook.md codebase live in a public or private GitHub repository? This affects CI/CD configuration, GitHub Actions minutes (free for public repos), and whether the admin console SPA needs to be separate or can share the monorepo.

### Legal

50. **Legal entity:** Will this app be published under your personal name, or do you have (or plan to create) an LLC or other legal entity? This affects the Terms of Service and liability language.

51. **Analytics / tracking:** Do you want any user analytics for V1 (e.g., page views, feature usage, sign-up funnel)? If so, should it be privacy-respecting (e.g., Plausible, PostHog self-hosted) or is basic Azure Application Insights sufficient?

---

## Follow-Up Questions (Round 3)

Based on your round 2 answers, a few more questions:

### GitHub App

52. **GitHub App naming:** The GitHub App needs a registered name on GitHub (e.g., "Notebook.md" or "NotebookMD"). This name appears in the installation UI when users grant repo access. Do you have a preference, or should we use "Notebook.md"?

53. **GitHub App webhook:** GitHub Apps can receive webhooks for events like pushes and PR merges. Should the app listen for external changes to GitHub-backed Notebooks (e.g., if someone pushes a commit outside of Notebook.md, should the app detect the change and refresh the file tree)? This adds complexity but improves the experience for repos with multiple contributors.

### 2FA

54. **2FA for admin console — OAuth providers:** I've specified that OAuth-based logins (Microsoft, GitHub, Google, Apple) are considered inherently MFA-capable for admin console access. However, not all users enable MFA on their identity provider. Should the admin console **require** that the OAuth provider has MFA enabled (by checking the `amr` claim where available), or is the OAuth login itself sufficient?

### Analytics & Compliance

55. **PostHog deployment — data residency:** PostHog Cloud stores data in the US (or EU, if the EU region is selected). Since you'll have EU users (GDPR), should we use PostHog's EU cloud instance, or is US-hosted acceptable with proper Privacy Policy disclosures?

56. **Cookie consent implementation:** Should we use a third-party cookie consent library (e.g., CookieYes, Osano) or build a simple custom banner? Third-party tools handle the legal nuances and compliance tracking but add a dependency and may cost at scale.

### Admin Console

57. **Admin CLI distribution:** The `npx notebook-admin promote` CLI command — should this be a separate npm package, or a script bundled with the API container that's run via `docker exec`? The latter is simpler and doesn't require publishing a package, but requires SSH/container access.
