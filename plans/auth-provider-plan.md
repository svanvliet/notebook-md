# Auth Provider Registration Plan

**Purpose:** Step-by-step instructions to register OAuth apps for all three providers (GitHub, Microsoft, Google) needed for Phase 3. Complete these before starting Phase 3 implementation.

**Redirect URI pattern (local dev):** `http://localhost:3001/auth/oauth/{provider}/callback`  
**Redirect URI pattern (production):** `https://api.notebookmd.io/auth/oauth/{provider}/callback`

---

## 1. GitHub OAuth App

GitHub is the simplest provider and the one we'll implement first. For Phase 3, we need **two things**: an OAuth App (for sign-in) and a GitHub App (for repo access). We'll start with the OAuth App.

### 1a. GitHub OAuth App (Sign-In)

This is used for "Sign in with GitHub" on the welcome screen.

**Steps:**

1. Go to https://github.com/settings/developers
2. Click **"OAuth Apps"** in the left sidebar
3. Click **"New OAuth App"**
4. Fill in:
   - **Application name:** `Notebook.md (Dev)`
   - **Homepage URL:** `http://localhost:5173`
   - **Authorization callback URL:** `http://localhost:3001/auth/oauth/github/callback`
   - **Enable Device Flow:** Leave unchecked
5. Click **"Register application"**
6. On the app page, note the **Client ID** (visible immediately)
7. Click **"Generate a new client secret"**
8. Copy the **Client Secret** immediately (it won't be shown again)

**Save these values:**
```
GITHUB_CLIENT_ID=<the Client ID>
GITHUB_CLIENT_SECRET=<the Client Secret>
```

### 1b. GitHub App (Repo Access — Phase 3)

This is a separate registration that enables Notebook.md to read/write files in the user's repos. GitHub Apps provide finer-grained permissions than OAuth Apps.

**Steps:**

1. Go to https://github.com/settings/apps
2. Click **"New GitHub App"**
3. Fill in:
   - **GitHub App name:** `Notebook.md` (must be globally unique — if taken, use `Notebook-md` or `NotebookMD-dev`)
   - **Description:** `Markdown notebook editor — reads and writes .md files in your repositories`
   - **Homepage URL:** `https://notebookmd.io`
   - **Callback URL:** `http://localhost:3001/auth/oauth/github/callback`
   - **Setup URL (optional):** Leave blank
   - **Webhook:**
     - **Active:** ✅ Check this
     - **Webhook URL:** `http://localhost:3001/webhooks/github` (won't work locally — we'll use a tunnel or skip for dev; change to `https://api.notebookmd.io/webhooks/github` for production)
     - **Webhook secret:** Generate a random string (e.g., run `openssl rand -hex 32` in terminal) — save this value
   - **Permissions → Repository permissions:**
     - **Contents:** Read & write (needed to read/write .md files)
     - **Metadata:** Read-only (required, auto-selected)
   - **Permissions → Account permissions:** None needed
   - **Subscribe to events:**
     - ✅ **Push** (so we can detect when files change externally)
   - **Where can this GitHub App be installed?** Select **"Any account"**
4. Click **"Create GitHub App"**
5. On the app page, note the **App ID** (a number, shown at the top)
6. Scroll down to **"Private keys"** → click **"Generate a private key"**
   - This downloads a `.pem` file — save it securely
7. Note the **Client ID** (different from the App ID — shown under "About" section)
8. Click **"Generate a new client secret"** for the GitHub App's OAuth flow
9. Copy the **Client Secret**

**Save these values:**
```
GITHUB_APP_ID=<the App ID number>
GITHUB_APP_CLIENT_ID=<the Client ID string>
GITHUB_APP_CLIENT_SECRET=<the Client Secret>
GITHUB_APP_PRIVATE_KEY_PATH=<path to the .pem file>
GITHUB_WEBHOOK_SECRET=<the webhook secret you generated>
```

**Important:** Store the `.pem` private key file at `docker/secrets/github-app-private-key.pem` (this path is gitignored). NEVER commit this file.

---

## 2. Microsoft Entra ID App (OAuth + OneDrive)

This single registration handles both "Sign in with Microsoft" and OneDrive file access.

### Steps:

1. Go to https://portal.azure.com
2. Search for **"App registrations"** in the top search bar and click it (under Microsoft Entra ID)
3. Click **"+ New registration"**
4. Fill in:
   - **Name:** `Notebook.md (Dev)`
   - **Supported account types:** Select **"Accounts in any organizational directory and personal Microsoft accounts"** (the third option). This allows both personal (MSA) and enterprise (M365/Entra ID) accounts.
   - **Redirect URI:**
     - Platform: **Web**
     - URI: `http://localhost:3001/auth/oauth/microsoft/callback`
5. Click **"Register"**
6. On the Overview page, note:
   - **Application (client) ID** — this is your Client ID
   - **Directory (tenant) ID** — you'll use `common` instead of this (for multi-tenant)

### Add a Client Secret:

7. In the left sidebar, click **"Certificates & secrets"**
8. Click **"+ New client secret"**
9. Description: `Notebook.md Dev`
10. Expiry: Choose **24 months** (you'll need to rotate before it expires)
11. Click **"Add"**
12. Copy the **Value** immediately (it's only shown once) — this is your Client Secret

### Configure API Permissions:

13. In the left sidebar, click **"API permissions"**
14. Click **"+ Add a permission"**
15. Choose **"Microsoft Graph"**
16. Choose **"Delegated permissions"**
17. Search for and add these permissions:
    - `openid` (Sign users in)
    - `profile` (View users' basic profile)
    - `email` (View users' email address)
    - `User.Read` (Sign in and read user profile)
    - `Files.ReadWrite` (Read and write to user's OneDrive files)
    - `offline_access` (Maintain access to data you have given it access to — enables refresh tokens)
18. Click **"Add permissions"**
19. **Do NOT** click "Grant admin consent" — individual users will consent when they sign in

### Configure Token Settings:

20. In the left sidebar, click **"Authentication"**
21. Under **"Implicit grant and hybrid flows"**, ensure **both are unchecked** (we use authorization code flow, not implicit)
22. Under **"Advanced settings"**, set **"Allow public client flows"** to **No**
23. Click **"Save"**

**Save these values:**
```
MICROSOFT_CLIENT_ID=<the Application (client) ID>
MICROSOFT_CLIENT_SECRET=<the client secret Value>
MICROSOFT_TENANT_ID=common
```

**Note:** We use `common` as the tenant ID to support both personal and enterprise accounts. The app already handles this in `createMicrosoftProvider()`.

---

## 3. Google Cloud OAuth App (OAuth + Google Drive)

This single registration handles both "Sign in with Google" and Google Drive file access. Google now uses the **Google Auth Platform** interface (not the old "APIs & Services → Credentials" flow).

### Step 1: Create a Google Cloud Project

1. Go to https://console.cloud.google.com
2. Click the project dropdown at the top → **"New Project"**
   - **Project name:** `notebook-md`
   - **Organization:** Leave as default (or select yours)
   - Click **"Create"**
3. Make sure the new project is selected in the top dropdown

### Step 2: Enable the Google Drive API

4. In the search bar at the top, search for **"Google Drive API"**
5. Click **"Google Drive API"** in the results
6. Click **"Enable"**

### Step 3: Configure OAuth via Google Auth Platform

7. In the search bar, search for **"Google Auth Platform"** and open it (or navigate via the hamburger menu → **"Google Auth Platform"**)
8. You'll land on the **Overview** page. If prompted, click **"Get Started"** or **"Configure"** to set up your OAuth configuration.

### Step 4: Branding

9. Click **"Branding"** in the left sidebar
10. Fill in:
    - **App name:** `Notebook.md`
    - **User support email:** Your email
    - **App logo:** Upload a notebook icon (optional for now)
    - **Application home page:** `https://notebookmd.io`
    - **Application privacy policy link:** `https://notebookmd.io/privacy` (placeholder)
    - **Application terms of service link:** `https://notebookmd.io/terms` (placeholder)
    - **Developer contact email:** Your email
11. Click **"Save"**

### Step 5: Audience

12. Click **"Audience"** in the left sidebar
13. Select **"External"** (allows any Google account to sign in)
14. While in **testing mode**, add your Google email as a test user
    - Click **"+ Add Users"**, enter your email, and save
15. Click **"Save"**

**Note:** While the app is in "Testing" mode, only test users can sign in. You'll need to submit for verification before production launch. This requires a privacy policy page and a short review process.

### Step 6: Data Access (Scopes)

16. Click **"Data Access"** in the left sidebar
17. Click **"Add or Remove Scopes"**
18. Add these scopes:
    - `openid`
    - `email`
    - `profile`
    - `https://www.googleapis.com/auth/drive.file` (allows access only to files created/opened by the app — least privilege)
19. Click **"Update"** → **"Save"**

### Step 7: Create OAuth Client

20. Click **"Clients"** in the left sidebar
21. Click **"+ Create Client"** (or use the **"Create OAuth client"** button from the Overview page)
22. Fill in:
    - **Application type:** Web application
    - **Name:** `Notebook.md (Dev)`
    - **Authorized JavaScript origins:** Add `http://localhost:5173`
    - **Authorized redirect URIs:** Add `http://localhost:3001/auth/oauth/google/callback`
23. Click **"Create"**
24. A dialog shows your **Client ID** and **Client Secret** — copy both

**Save these values:**
```
GOOGLE_CLIENT_ID=<the Client ID>
GOOGLE_CLIENT_SECRET=<the Client Secret>
```

---

## 4. Where to Store These Values

### Local Development (`.env` file)

All credentials go in a `.env` file at the repo root. This file is gitignored.

1. Copy the template: `cp .env.example .env`
2. Fill in the values:

```env
# GitHub OAuth App (Sign-In)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# GitHub App (Repo Access) — Phase 3
GITHUB_APP_ID=your_github_app_id
GITHUB_APP_CLIENT_ID=your_github_app_client_id
GITHUB_APP_CLIENT_SECRET=your_github_app_client_secret
GITHUB_APP_PRIVATE_KEY_PATH=docker/secrets/github-app-private-key.pem
GITHUB_WEBHOOK_SECRET=your_webhook_secret

# Microsoft
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_TENANT_ID=common

# Google
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

3. Store the GitHub App private key `.pem` file at:
   ```
   docker/secrets/github-app-private-key.pem
   ```
   Create the directory if it doesn't exist: `mkdir -p docker/secrets`

### Production (Phase 6 — Azure Key Vault)

In production, these values will be stored in Azure Key Vault and injected as environment variables into the Container Apps. We'll set that up during Phase 6.

### What to Add to `.gitignore`

Verify these are already gitignored (they should be):
- `.env` — credentials file
- `docker/secrets/` — private keys and sensitive files

---

## 5. Update `.env.example`

After completing the registrations, we'll update `.env.example` with the new GitHub App variables (without actual values) so future developers know what's needed.

---

## 6. Update OAuth Scopes in Code

The current OAuth providers only request identity scopes (for sign-in). Phase 3 will expand these:

| Provider | Current Scopes | Phase 3 Scopes (to add) |
|----------|---------------|------------------------|
| GitHub | `read:user user:email` | Repo access via GitHub App (separate auth flow) |
| Microsoft | `openid profile email User.Read` | `Files.ReadWrite offline_access` |
| Google | `openid email profile` | `https://www.googleapis.com/auth/drive.file` |

We'll update the code to request the expanded scopes during Phase 3 implementation.

---

## 7. Verification Checklist

After completing all registrations, verify each provider works by:

1. Start the dev server: `./dev.sh`
2. Add the credentials to `.env` and restart the API
3. Open `http://localhost:5173`
4. Click each provider's sign-in button and verify:
   - [ ] GitHub: redirects to GitHub consent page → callback → signed in
   - [ ] Microsoft: redirects to Microsoft login → consent → callback → signed in
   - [ ] Google: redirects to Google consent → callback → signed in
5. Check the database: `SELECT * FROM identity_links;` should show entries for each provider

---

## 8. Order of Operations

**Recommended order:**

1. **GitHub OAuth App** (simplest, 5 minutes) → test sign-in
2. **GitHub App** (for repo access, 10 minutes) → save credentials, test in Phase 3
3. **Microsoft Entra ID** (10 minutes, slightly more steps) → test sign-in
4. **Google Cloud** (10 minutes, consent screen setup) → test sign-in

We can do these one at a time — let me know when you're ready to start with GitHub.
