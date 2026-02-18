import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

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

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

/**
 * Convert Markdown to HTML for loading into Tiptap.
 * We use a simple approach: let the browser parse basic Markdown patterns.
 * For full fidelity, Tiptap's own setContent with HTML works best,
 * so we convert Markdown → HTML using a lightweight parser.
 */
export function markdownToHtml(md: string): string {
  // Process blocks in order
  let html = md;

  // Fenced code blocks (must come before inline backtick processing)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const cls = lang ? ` class="language-${lang}"` : '';
    return `<pre><code${cls}>${escapeHtml(code.trimEnd())}</code></pre>`;
  });

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote><p>$1</p></blockquote>');

  // Task lists
  html = html.replace(
    /^- \[(x| )\]\s+(.+)$/gm,
    (_m, checked, text) =>
      `<ul data-type="taskList"><li data-type="taskItem" data-checked="${checked === 'x'}">${text}</li></ul>`,
  );

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<ul><li>$1</li></ul>');

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<ol><li>$1</li></ol>');

  // Merge adjacent list items
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  html = html.replace(/<\/ol>\s*<ol>/g, '');
  html = html.replace(/<\/ul>\s*<ul data-type="taskList">/g, '');

  // Inline formatting (order matters — process in a safe order)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
  html = html.replace(/==(.+?)==/g, '<mark>$1</mark>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" rel="noopener noreferrer nofollow" target="_blank">$1</a>',
  );

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // Wrap bare lines in paragraphs (lines that aren't already wrapped in HTML tags)
  html = html
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (/^</.test(trimmed)) return line;
      return `<p>${trimmed}</p>`;
    })
    .join('\n');

  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
