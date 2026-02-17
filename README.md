# Notebook.md

A web application for creating, editing, and organizing Markdown notebooks through an intuitive WYSIWYG canvas interface. Notebooks are stored in your existing cloud storage and version control systems — OneDrive, Google Drive, and GitHub — so your content stays where you control it.

## Key Features (Planned)

- **WYSIWYG Markdown editing** — rich-text experience powered by Tiptap/ProseMirror with GFM support, slash commands, and split view
- **Bring your own storage** — connect OneDrive, Google Drive, or GitHub repos as notebook sources
- **Multi-provider authentication** — sign in with Microsoft, GitHub, Google, Apple, or email
- **Tabbed editor** — work on multiple documents simultaneously
- **GitHub-native workflows** — working branch model with squash-on-publish for clean commit history

## Tech Stack

- **Frontend:** React + TypeScript + Tailwind CSS + Tiptap
- **Backend:** Node.js + TypeScript (Express/Fastify)
- **Database:** PostgreSQL (metadata only — no document content stored)
- **Infrastructure:** Docker, Azure Container Apps, GitHub Actions CI/CD

## Status

🚧 **In development** — see [`requirements/`](requirements/) for the full product requirements document.

## License

Copyright © Van Vliet Ventures, LLC. All rights reserved.
