import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { isMermaidLanguage } from '../../lib/mermaid';
import { MermaidView } from './MermaidView';

const LANGUAGES = [
  { value: '', label: 'Plain text' },
  { value: 'mermaid', label: 'Mermaid' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'yaml', label: 'YAML' },
  { value: 'sql', label: 'SQL' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'xml', label: 'XML' },
];

export function CodeBlockView(props: NodeViewProps) {
  const { node, updateAttributes } = props;
  const language = node.attrs.language ?? '';
  const isKnown = LANGUAGES.some((l) => l.value === language);

  const languageSelect = (
    <select
      className="code-block-lang"
      contentEditable={false}
      value={language}
      onChange={(e) => updateAttributes({ language: e.target.value })}
    >
      {/* Keep a direct-type tag (e.g. block-beta) selectable in the dropdown. */}
      {!isKnown && language && <option value={language}>{language}</option>}
      {LANGUAGES.map((lang) => (
        <option key={lang.value} value={lang.value}>
          {lang.label}
        </option>
      ))}
    </select>
  );

  // Mermaid diagram types render as a live diagram instead of plain code.
  if (isMermaidLanguage(language)) {
    return <MermaidView {...props} languageSelect={languageSelect} />;
  }

  return (
    <NodeViewWrapper className="code-block-wrapper relative">
      {languageSelect}
      <pre data-language={language || undefined}>
        <NodeViewContent className="code-node-content" />
      </pre>
    </NodeViewWrapper>
  );
}
