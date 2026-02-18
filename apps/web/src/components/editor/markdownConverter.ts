import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { marked } from 'marked';

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
});

turndown.use(gfm);

// Strip Tiptap's table wrapper div so GFM plugin can process <table> directly
turndown.addRule('tableWrapper', {
  filter: (node) =>
    node.nodeName === 'DIV' &&
    (node as HTMLElement).classList.contains('tableWrapper'),
  replacement: (_content, node) => {
    // Re-process the inner table HTML after stripping wrapper and cleaning attributes
    const el = node as HTMLElement;
    const table = el.querySelector('table');
    if (!table) return _content;
    return '\n' + cleanAndConvertTable(table) + '\n';
  },
});

// If a table appears without a wrapper (edge case), also handle it
turndown.addRule('tiptapTable', {
  filter: (node) => {
    if (node.nodeName !== 'TABLE') return false;
    const el = node as HTMLElement;
    // Only intercept Tiptap-style tables (have style or colgroup)
    return el.hasAttribute('style') || !!el.querySelector('colgroup');
  },
  replacement: (_content, node) => {
    return '\n' + cleanAndConvertTable(node as HTMLElement) + '\n';
  },
});

/**
 * Clean Tiptap table HTML and convert to Markdown using a fresh turndown instance.
 * Strips style attrs, colgroup, and <p> tags inside cells that confuse the GFM plugin.
 */
function cleanAndConvertTable(table: HTMLElement): string {
  const clone = table.cloneNode(true) as HTMLElement;

  // Remove style attributes from table and all children
  clone.removeAttribute('style');
  clone.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));

  // Remove colgroup elements
  clone.querySelectorAll('colgroup').forEach((el) => el.remove());

  // Remove colspan="1" and rowspan="1" (defaults that confuse some parsers)
  clone.querySelectorAll('[colspan="1"]').forEach((el) => el.removeAttribute('colspan'));
  clone.querySelectorAll('[rowspan="1"]').forEach((el) => el.removeAttribute('rowspan'));

  // Unwrap <p> tags inside th/td — Tiptap wraps cell content in <p> which adds newlines
  clone.querySelectorAll('th p, td p').forEach((p) => {
    const parent = p.parentNode;
    if (!parent) return;
    while (p.firstChild) parent.insertBefore(p.firstChild, p);
    parent.removeChild(p);
  });

  // Use a fresh turndown instance with GFM to convert the clean table
  const freshTd = new TurndownService({ headingStyle: 'atx' });
  freshTd.use(gfm);
  return freshTd.turndown(clone.outerHTML).trim();
}

// Task list items: Tiptap renders them with data attributes
turndown.addRule('taskListItem', {
  filter: (node) =>
    node.nodeName === 'LI' &&
    node.getAttribute('data-type') === 'taskItem',
  replacement: (_content, node) => {
    const checked = (node as HTMLElement).getAttribute('data-checked') === 'true';
    const text = (node as HTMLElement).querySelector('div, p')?.textContent?.trim() ?? _content.trim();
    return `- [${checked ? 'x' : ' '}] ${text}\n`;
  },
});

// Task list wrapper: don't add extra bullet markers
turndown.addRule('taskList', {
  filter: (node) =>
    node.nodeName === 'UL' &&
    node.getAttribute('data-type') === 'taskList',
  replacement: (_content) => `\n${_content}\n`,
});

// Highlight marks
turndown.addRule('highlight', {
  filter: 'mark',
  replacement: (content) => `==${content}==`,
});

// Callout blocks: convert to GitHub-style blockquote admonitions
turndown.addRule('callout', {
  filter: (node) =>
    node.nodeName === 'DIV' && (node as HTMLElement).hasAttribute('data-callout'),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const type = el.getAttribute('data-callout-type') || 'info';
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    const contentEl = el.querySelector('.callout-content');
    const inner = contentEl ? turndown.turndown(contentEl.innerHTML).trim() : _content.trim();
    const lines = inner.split('\n').map((l: string) => `> ${l}`).join('\n');
    return `\n> [!${label.toUpperCase()}]\n${lines}\n`;
  },
});

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

// Configure marked for GFM
marked.setOptions({
  gfm: true,
  breaks: true,
});

// Custom marked extension for GitHub-style admonitions: > [!NOTE], > [!TIP], etc.
const calloutExtension = {
  extensions: [{
    name: 'callout',
    level: 'block' as const,
    start(src: string) {
      return src.match(/^>\s*\[!(NOTE|TIP|INFO|WARNING)\]/im)?.index;
    },
    tokenizer(src: string) {
      const match = src.match(/^(?:>\s*\[!(NOTE|TIP|INFO|WARNING)\]\s*\n)((?:>.*(?:\n|$))*)/im);
      if (match) {
        const type = match[1].toLowerCase();
        const bodyLines = match[2]
          .split('\n')
          .map((l: string) => l.replace(/^>\s?/, ''))
          .join('\n')
          .trim();
        return {
          type: 'callout',
          raw: match[0],
          calloutType: type,
          body: bodyLines,
        };
      }
      return undefined;
    },
    renderer(token: { calloutType: string; body: string }) {
      const icons: Record<string, string> = { info: 'ℹ️', warning: '⚠️', tip: '💡', note: '📝' };
      const icon = icons[token.calloutType] || icons.info;
      const html = marked.parse(token.body, { async: false }) as string;
      return `<div data-callout data-callout-type="${token.calloutType}" class="callout callout-${token.calloutType}"><span class="callout-icon" contenteditable="false">${icon}</span><div class="callout-content">${html}</div></div>`;
    },
  }],
};
marked.use(calloutExtension);

/**
 * Convert Markdown to HTML for loading into Tiptap using marked (full GFM support).
 */
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/**
 * Detect whether content is raw Markdown (vs HTML).
 * Returns true if the content looks like Markdown rather than HTML.
 */
export function isMarkdownContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  // If it starts with an HTML tag, it's likely HTML from Tiptap
  if (/^<[a-z]/i.test(trimmed)) return false;
  // Look for common Markdown patterns
  if (/^#{1,6}\s/m.test(trimmed)) return true;
  if (/^\s*[-*+]\s/m.test(trimmed)) return true;
  if (/^\s*\d+\.\s/m.test(trimmed)) return true;
  if (/^\s*>/m.test(trimmed)) return true;
  if (/```/m.test(trimmed)) return true;
  if (/\|.*\|.*\|/m.test(trimmed)) return true;
  if (/\[.+\]\(.+\)/m.test(trimmed)) return true;
  // If no HTML tags at all, probably markdown or plain text — treat as markdown
  if (!/<[a-z][^>]*>/i.test(trimmed)) return true;
  return false;
}
