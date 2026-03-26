# Notebook.md

A web application for creating, editing, and organizing Markdown notebooks through an intuitive WYSIWYG canvas interface. Connect your existing cloud storage (OneDrive, Google Drive, GitHub), or use Cloud notebooks for real-time co-authoring with encrypted storage you control.

## Features

-   **WYSIWYG Markdown editor** — Tiptap/ProseMirror with full GFM support, slash commands, floating table toolbar, and raw markdown toggle
    
-   **Bring your own storage** — connect OneDrive, Google Drive, or GitHub repos as notebook sources (local browser storage available too)

-   **Cloud notebooks** — hosted encrypted storage with real-time co-authoring, sharing, and public links
    
-   **Real-time co-authoring** — write together with live cursors, presence indicators, and zero merge conflicts

-   **Sharing & permissions** — invite collaborators as Owner, Editor, or Viewer; create public view-only links
    
-   **Multi-provider auth** — email + password, magic link, or OAuth (Microsoft, GitHub, Google)
    
-   **Tabbed editor** — multiple documents open simultaneously
    
-   **AI content generation** — generate formatted Markdown content with GPT-4.1-nano via slash command or toolbar button
    
-   **Notebook tree** — hierarchical file/folder browser with drag-and-drop import
    
-   **Settings sync** — display mode, font, margins, and preferences persist across sessions
    
-   **Account management** — profile editing, password change, linked accounts, account deletion
    

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Tailwind CSS, Tiptap |
| Backend | Express 5, TypeScript, node-pg-migrate |
| Database | PostgreSQL 16 (account metadata + Cloud notebook content, encrypted) |
| Cache | Redis 7 (sessions, rate limiting) |
| Email | Nodemailer (Mailpit for local dev) |
| Infrastructure | Docker Compose (local), containers (production) |

## Project Structure

```
notebook-md/
├── apps/
│   ├── web/          # React frontend (Vite, port 5173)
│   ├── api/          # Express API server (port 3001)
│   ├── admin/        # Admin console (React, separate deploy)
│   └── collab/       # WebSocket collaboration server
├── packages/
│   └── shared/       # Shared types and utilities
├── docker/           # Docker configuration
├── docs/             # Requirements, plans, and documentation
├── infra/            # Terraform infrastructure-as-code
├── e2e/              # Playwright end-to-end tests
├── dev.sh            # Development startup script
└── docker-compose.yml
```

## Prerequisites

-   **Node.js** ≥ 20
    
-   **Docker Desktop** (for PostgreSQL, Redis, Mailpit)
    

## Getting Started

Clone the repo and install dependencies:

```sh
git clone https://github.com/svanvliet/notebook-md.git
cd notebook-md
npm install
```

Start all services with the dev script:

```sh
./dev.sh
```

This single command will:

1.  Start Docker services (PostgreSQL, Redis, Mailpit)
    
2.  Run database migrations (dev + test databases)
    
3.  Start the API server (port 3001)
    
4.  Start the Vite dev server (port 5173)
    
5.  Start the webhook proxy (smee.io → localhost, if configured)
    
6.  Print all service URLs
    
7.  Tail logs (Ctrl+C to detach — services keep running)
    

### Dev Script Commands

| Command | Description |
| --- | --- |
| `./dev.sh` | Start everything and tail logs |
| `./dev.sh stop` | Stop all services |
| `./dev.sh status` | Check health of each service |
| `./dev.sh logs` | Tail API and web server logs |

### Service URLs

| Service | URL |
| --- | --- |
| Web App | [http://localhost:5173](http://localhost:5173) |
| API Health | [http://localhost:3001/api/health](http://localhost:3001/api/health) |
| Mailpit (email inbox) | [http://localhost:8025](http://localhost:8025) |
| Mock OAuth | [http://localhost:3001/auth/oauth/mock](http://localhost:3001/auth/oauth/mock) |

### Dev Accounts

| Account | Credentials |
| --- | --- |
| Admin | `admin@localhost` / `admin123` |
| Mock OAuth | Use the mock provider form to simulate any profile |

> **Tip:** On the welcome screen, click **Skip to app (dev)** to bypass auth during development.

### Webhook Proxy (GitHub)

GitHub can't deliver webhooks to `localhost`. We use [smee.io](https://smee.io) to proxy them in dev:

1.  Create a channel at [https://smee.io/new](https://smee.io/new) (or reuse an existing one)
    
2.  Set `WEBHOOK_PROXY_URL=https://smee.io/YOUR_CHANNEL` in `.env`
    
3.  Use the same URL as the **Webhook URL** in your GitHub App settings
    

`dev.sh` auto-starts the smee proxy when `WEBHOOK_PROXY_URL` is set. Events are forwarded to `http://localhost:3001/webhooks/github`.

## Status

🚀 **Live at [www.notebookmd.io](https://www.notebookmd.io)** — Cloud notebooks, co-authoring, AI generation, and BYO storage all available. See `docs/plans/` for roadmap.

## License

Copyright © Van Vliet Ventures, LLC. All rights reserved.

This is the final test to see if the PR closure works correctly.