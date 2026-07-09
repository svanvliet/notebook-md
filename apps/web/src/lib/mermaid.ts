/**
 * mermaid.ts — shared Mermaid diagram detection and rendering.
 *
 * Used by both the editor node view (live, in the WYSIWYG editor / print) and the
 * public share viewer (static HTML). Mermaid itself is dynamically imported so it
 * only loads when a document actually contains a diagram.
 */

/**
 * Recognized Mermaid diagram tags mapped to their canonical Mermaid keyword.
 *
 * A fenced code block tagged with any of these keys (e.g. ```block-beta) — or the
 * generic ```mermaid tag — renders as a diagram. The value is the exact keyword
 * Mermaid expects (correct casing / `-beta` suffix), used when a direct-type fence
 * omits the keyword from its body. Keys are compared lower-cased.
 */
const CANONICAL_TYPES: Record<string, string> = {
  graph: 'graph',
  'graph-md': 'graph',
  flowchart: 'flowchart',
  sequencediagram: 'sequenceDiagram',
  classdiagram: 'classDiagram',
  statediagram: 'stateDiagram',
  'statediagram-v2': 'stateDiagram-v2',
  erdiagram: 'erDiagram',
  journey: 'journey',
  gantt: 'gantt',
  pie: 'pie',
  quadrantchart: 'quadrantChart',
  requirementdiagram: 'requirementDiagram',
  gitgraph: 'gitGraph',
  mindmap: 'mindmap',
  timeline: 'timeline',
  zenuml: 'zenuml',
  sankey: 'sankey-beta',
  'sankey-beta': 'sankey-beta',
  xychart: 'xychart-beta',
  'xychart-beta': 'xychart-beta',
  block: 'block-beta',
  'block-beta': 'block-beta',
  packet: 'packet-beta',
  'packet-beta': 'packet-beta',
  kanban: 'kanban',
  architecture: 'architecture-beta',
  'architecture-beta': 'architecture-beta',
  radar: 'radar',
  treemap: 'treemap',
  c4context: 'C4Context',
};

/** Flowchart keywords that take a leading direction token (e.g. `graph TD`). */
const FLOWCHART_KEYWORDS = new Set(['graph', 'flowchart']);
const FLOW_DIRECTIONS = new Set(['TB', 'TD', 'BT', 'RL', 'LR']);

/** Normalize a fence language tag for comparison. */
function normalize(language: string | null | undefined): string {
  return (language ?? '').trim().toLowerCase();
}

/** True when the given fenced-code language should render as a Mermaid diagram. */
export function isMermaidLanguage(language: string | null | undefined): boolean {
  const lang = normalize(language);
  return lang === 'mermaid' || lang in CANONICAL_TYPES;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build valid Mermaid source from a fenced block.
 *
 * For a ```mermaid block the content already starts with the diagram type. For a
 * direct-type fence (```block-beta, ```graph, …) the canonical keyword is prepended
 * to the content unless the content already begins with it.
 */
export function buildMermaidSource(language: string | null | undefined, content: string): string {
  const lang = normalize(language);
  if (lang === 'mermaid') return content;

  const keyword = CANONICAL_TYPES[lang] ?? lang;
  const trimmed = content.replace(/^\s+/, '');

  // Content already carries the keyword — use as-is.
  if (new RegExp(`^${escapeRegExp(keyword)}\\b`, 'i').test(trimmed)) return content;

  // Flowcharts expect a direction on the same line: `graph TD`.
  if (FLOWCHART_KEYWORDS.has(keyword)) {
    const firstToken = trimmed.split(/\s|\n/)[0]?.toUpperCase() ?? '';
    if (FLOW_DIRECTIONS.has(firstToken)) return `${keyword} ${content}`;
  }

  return `${keyword}\n${content}`;
}

/** True when the app is in dark mode (the `.dark` class on <html>). */
export function isDarkMode(): boolean {
  return typeof document !== 'undefined'
    && document.documentElement.classList.contains('dark');
}

let mermaidModule: typeof import('mermaid').default | null = null;

async function getMermaid(dark: boolean, fontSize: number): Promise<typeof import('mermaid').default> {
  if (!mermaidModule) {
    mermaidModule = (await import('mermaid')).default;
  }
  // Re-initialize each render so the theme and font size track the app settings.
  mermaidModule.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: dark ? 'dark' : 'default',
    fontFamily: 'inherit',
    fontSize,
    themeVariables: {
      fontFamily: 'inherit',
      fontSize: `${fontSize}px`,
    },
  });
  return mermaidModule;
}

let renderSeq = 0;

export interface MermaidRenderResult {
  svg?: string;
  error?: string;
}

/**
 * Render the SVG at its natural pixel size.
 *
 * Mermaid emits `width="100%"` + `style="max-width: <natural>px"` (its useMaxWidth
 * behavior), which lets the container scale the whole SVG — shrinking the text on
 * wide diagrams. We pin the width to the natural size and drop the cap so the text
 * always renders at the configured font size; oversized diagrams scroll instead.
 */
function toNaturalSize(svg: string): string {
  const styleMatch = svg.match(/<svg\b[^>]*\sstyle="([^"]*)"/);
  const widthMatch = styleMatch?.[1].match(/max-width:\s*([\d.]+)px/);
  if (!widthMatch) return svg;
  const naturalWidth = widthMatch[1];

  let out = svg.replace(/(<svg\b[^>]*?)\swidth="[^"]*"/, `$1 width="${naturalWidth}px"`);
  out = out.replace(/(<svg\b[^>]*\sstyle=")([^"]*)(")/, (_m, p1, style, p3) => {
    const cleaned = style.replace(/max-width:\s*[\d.]+px;?/, '').trim();
    return `${p1}${cleaned}${p3}`;
  });
  return out;
}

/** Render Mermaid source to an SVG string, returning an error message on failure. */
export async function renderMermaid(
  source: string,
  dark: boolean,
  fontSize: number,
): Promise<MermaidRenderResult> {
  const trimmed = source.trim();
  if (!trimmed) return { error: 'Empty diagram' };

  const id = `mmd-${Date.now()}-${renderSeq++}`;
  try {
    const mermaid = await getMermaid(dark, fontSize);
    const { svg } = await mermaid.render(id, trimmed);
    return { svg: toNaturalSize(svg) };
  } catch (err) {
    // Mermaid may leave an orphaned element behind on parse failure.
    if (typeof document !== 'undefined') {
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

/** Read the `language-xxx` tag from a `<code>` element's class list. */
function codeLanguage(code: Element): string {
  for (const cls of Array.from(code.classList)) {
    if (cls.startsWith('language-')) return cls.slice('language-'.length);
  }
  return '';
}

/**
 * Replace Mermaid code blocks inside a static HTML container with rendered SVGs.
 * Used by the public share viewer, which renders documents as raw HTML (no node
 * views). Pass the container element directly — callers must not rely on the global
 * `document` (it may be shadowed).
 */
export async function enhanceMermaidBlocks(root: HTMLElement): Promise<void> {
  const codes = Array.from(root.querySelectorAll('pre > code[class*="language-"]'));
  const targets = codes
    .map((code) => ({ code, lang: codeLanguage(code) }))
    .filter(({ lang }) => isMermaidLanguage(lang));
  if (targets.length === 0) return;

  const dark = isDarkMode();
  const fontSize = parseFloat(root.ownerDocument.defaultView?.getComputedStyle(root).fontSize ?? '16') || 16;
  for (const { code, lang } of targets) {
    const pre = code.closest('pre');
    if (!pre) continue;
    const source = buildMermaidSource(lang, code.textContent ?? '');
    const { svg, error } = await renderMermaid(source, dark, fontSize);

    const wrapper = root.ownerDocument.createElement('div');
    wrapper.className = 'mermaid-rendered';
    if (error) {
      wrapper.classList.add('mermaid-error');
      wrapper.textContent = `Diagram error: ${error}`;
    } else if (svg) {
      wrapper.innerHTML = svg;
    }
    pre.replaceWith(wrapper);
  }
}
