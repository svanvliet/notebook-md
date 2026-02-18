import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

const LANGUAGES = [
  { value: '', label: 'Plain text' },
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

export function CodeBlockView({ node, updateAttributes, extension }: NodeViewProps) {
  return (
    <NodeViewWrapper className="code-block-wrapper relative">
      <select
        className="code-block-lang"
        contentEditable={false}
        value={node.attrs.language ?? ''}
        onChange={(e) => updateAttributes({ language: e.target.value })}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.value} value={lang.value}>
            {lang.label}
          </option>
        ))}
      </select>
      <pre>
        <NodeViewContent className="code-node-content" />
      </pre>
    </NodeViewWrapper>
  );
}
