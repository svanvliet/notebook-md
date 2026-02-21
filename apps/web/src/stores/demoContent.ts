/**
 * Demo Notebook — tutorial content created when a user enters demo mode.
 * Each entry defines a file or folder to be created in the demo notebook.
 */
import { createFile, listNotebooks, upsertNotebook } from './localNotebookStore';

export const DEMO_NOTEBOOK_ID = 'demo-notebook';
const DEMO_NOTEBOOK_NAME = 'Demo Notebook';

interface DemoEntry {
  path: string;
  type: 'file' | 'folder';
  content?: string;
}

// ---------------------------------------------------------------------------
// Tutorial content
// ---------------------------------------------------------------------------

const GETTING_STARTED = `# Welcome to Notebook.md 👋

Thanks for trying Notebook.md! This quick guide will help you get oriented.

## The Interface

The app is organized into three areas:

- **Workspace Pane** (left) — Your notebooks and files live here. Click a file to open it, or right-click for options like rename and delete.
- **Document Pane** (center) — The editor where you read and write. You can have multiple files open in tabs.
- **Toolbar** (top) — Formatting controls appear here when a document is open.

## Try It Out

This demo notebook has a few short guides you can explore:

- [Markdown Essentials](./Basics/Markdown%20Essentials.md) — The building blocks of formatting
- [Keyboard Shortcuts](./Basics/Keyboard%20Shortcuts.md) — Speed up your workflow
- [Slash Commands](./Features/Slash%20Commands.md) — Quick-insert anything with \`/\`
- [Cloud Storage](./Features/Cloud%20Storage.md) — Connect GitHub, OneDrive, and Google Drive

> **Tip:** Click any link above to open it in a new tab. You can edit everything — this is your personal sandbox.

## Creating Content

To create a new file, right-click a notebook or folder in the workspace pane and choose **New File**. Give it a name ending in \`.md\` and start writing.

You can also create folders to organize your notes — right-click and choose **New Folder**.

## What's Next?

When you're ready to save your work to the cloud, create a free account and connect a storage source like GitHub or OneDrive. Any notebooks you create in demo mode will carry over to your account automatically.

Happy writing! ✍️
`;

const MARKDOWN_ESSENTIALS = `# Markdown Essentials

Markdown is a lightweight way to format text. Here's everything you need to know.

## Headings

Use \`#\` symbols to create headings. More \`#\` symbols = smaller heading.

# Heading 1
## Heading 2
### Heading 3

## Text Formatting

| Style | Syntax | Result |
|-------|--------|--------|
| Bold | \`**bold**\` | **bold** |
| Italic | \`*italic*\` | *italic* |
| Strikethrough | \`~~crossed out~~\` | ~~crossed out~~ |
| Inline code | \`\\\`code\\\`\` | \`code\` |
| Highlight | \`==highlighted==\` | ==highlighted== |

## Lists

**Bullet list:**
- First item
- Second item
  - Nested item

**Numbered list:**
1. Step one
2. Step two
3. Step three

**Task list:**
- [x] Learn markdown
- [ ] Write something great
- [ ] Share it with the world

## Links and Images

Links: \`[text](url)\`  
Images: \`![alt text](url)\`

Example: [Notebook.md](https://notebookmd.io)

## Blockquotes

> Blockquotes are great for callouts or citations.
> They can span multiple lines.

## Code Blocks

Wrap code in triple backticks and specify the language:

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

## Tables

| Feature | Supported |
|---------|-----------|
| Tables | ✅ |
| Alignment | ✅ |
| Formatting in cells | ✅ |

## Horizontal Rules

Use \`---\` to create a divider:

---

That's it! Markdown is designed to be readable even as plain text, which makes it perfect for notes, documentation, and more.
`;

const KEYBOARD_SHORTCUTS = `# Keyboard Shortcuts

These shortcuts work in the editor to speed up your workflow.

## Formatting

| Shortcut | Action |
|----------|--------|
| \`Cmd/Ctrl + B\` | **Bold** |
| \`Cmd/Ctrl + I\` | *Italic* |
| \`Cmd/Ctrl + U\` | Underline |

## Document

| Shortcut | Action |
|----------|--------|
| \`Cmd/Ctrl + S\` | Save |
| \`Cmd/Ctrl + Shift + M\` | Cycle view mode (WYSIWYG → Source → Split) |
| \`Cmd/Ctrl + P\` | Print document |

## Lists

| Shortcut | Action |
|----------|--------|
| \`Tab\` | Indent list item |
| \`Shift + Tab\` | Outdent list item |

## Editor

| Shortcut | Action |
|----------|--------|
| \`/\` (at line start) | Open slash command menu |
| \`Escape\` | Close menus and modals |

> **Tip:** Most standard text editing shortcuts (copy, paste, undo, redo, select all) work as you'd expect.
`;

const SLASH_COMMANDS = `# Slash Commands

Type \`/\` at the beginning of a new line to open the command menu. Start typing to filter commands.

## Available Commands

### Text
| Command | Description |
|---------|-------------|
| Paragraph | Plain text block |
| Heading 1–3 | Large, medium, and small headings |
| Blockquote | Quoted text block |

### Lists
| Command | Description |
|---------|-------------|
| Bullet List | Unordered list |
| Numbered List | Ordered list |
| Task List | Checklist with checkboxes |

### Code & Math
| Command | Description |
|---------|-------------|
| Code Block | Fenced code with syntax highlighting |
| Inline Code | Code snippet within text |
| Math Block | LaTeX math expression |

### Media & Links
| Command | Description |
|---------|-------------|
| Link | Insert a hyperlink |
| Image | Insert an image |
| Video | Insert a video |

### Formatting
| Command | Description |
|---------|-------------|
| Bold | Bold text |
| Italic | Italic text |
| Strikethrough | Crossed-out text |
| Highlight | Highlighted text |

### Layout
| Command | Description |
|---------|-------------|
| Table | Insert a 3×3 table |
| Horizontal Rule | Divider line |
| Callout | Info, warning, tip, or note box |

## Try It Now

Click at the end of this line, press Enter, then type \`/\` to see the menu in action.

`;

const CLOUD_STORAGE = `# Cloud Storage

Notebook.md works with your existing cloud storage — your files stay in your accounts, not on our servers.

## Supported Sources

### GitHub
Connect any repository you have access to. Select a repo and optionally choose a specific folder as your notebook root. The app shows only \`.md\` files and creates working branches for your edits, so your main branch stays clean until you're ready to publish.

### OneDrive
Link your Microsoft account (personal or work/school) and choose a OneDrive folder as a notebook. Your markdown files sync directly to your OneDrive.

### Google Drive
Connect your Google account and pick a Drive folder. Works the same way as OneDrive — your files live in Google Drive and you edit them here.

## How to Connect

1. **Create a free account** — click "Create Account" in the menu
2. Go to **Account Settings** → **Connected Accounts**
3. Click **Connect** next to the service you want
4. Authorize Notebook.md to access your files
5. Add a new notebook and select your cloud source

## Privacy

We only access the specific folders you choose. Your credentials are handled securely via OAuth — we never see or store your passwords for these services.

> **Note:** Cloud storage requires a free account. In demo mode, notebooks are stored locally in your browser.
`;

// ---------------------------------------------------------------------------
// File/folder definitions
// ---------------------------------------------------------------------------

const DEMO_ENTRIES: DemoEntry[] = [
  { path: 'Basics', type: 'folder' },
  { path: 'Features', type: 'folder' },
  { path: 'Getting Started.md', type: 'file', content: GETTING_STARTED },
  { path: 'Basics/Markdown Essentials.md', type: 'file', content: MARKDOWN_ESSENTIALS },
  { path: 'Basics/Keyboard Shortcuts.md', type: 'file', content: KEYBOARD_SHORTCUTS },
  { path: 'Features/Slash Commands.md', type: 'file', content: SLASH_COMMANDS },
  { path: 'Features/Cloud Storage.md', type: 'file', content: CLOUD_STORAGE },
];

// ---------------------------------------------------------------------------
// Create / detect demo notebook
// ---------------------------------------------------------------------------

/**
 * Creates the demo notebook with tutorial content.
 * Returns the notebook ID, or null if it already exists.
 */
export async function createDemoNotebook(): Promise<string> {
  // Check if demo notebook already exists
  const notebooks = await listNotebooks();
  const existing = notebooks.find(n => n.id === DEMO_NOTEBOOK_ID);
  if (existing) {
    return DEMO_NOTEBOOK_ID;
  }

  // Create notebook with a stable ID via upsertNotebook
  const now = Date.now();
  await upsertNotebook({
    id: DEMO_NOTEBOOK_ID,
    name: DEMO_NOTEBOOK_NAME,
    sourceType: 'local',
    sourceConfig: {},
    sortOrder: 0, // appear first
    createdAt: now,
    updatedAt: now,
  });

  // Create all folders and files
  for (const entry of DEMO_ENTRIES) {
    const parts = entry.path.split('/');
    const name = parts.pop()!;
    const parentPath = parts.join('/');
    await createFile(
      DEMO_NOTEBOOK_ID,
      parentPath,
      name,
      entry.type,
      entry.content ?? '',
    );
  }

  return DEMO_NOTEBOOK_ID;
}

/** Path to the tutorial entry point */
export const GETTING_STARTED_PATH = 'Getting Started.md';
