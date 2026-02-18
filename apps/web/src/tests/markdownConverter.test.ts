import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, markdownToHtml, isMarkdownContent } from '../components/editor/markdownConverter';

describe('markdownConverter', () => {
  describe('markdownToHtml', () => {
    it('converts headings', () => {
      const html = markdownToHtml('# Hello World');
      expect(html).toContain('<h1>Hello World</h1>');
    });

    it('converts bullet lists', () => {
      const html = markdownToHtml('- item 1\n- item 2');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>');
    });

    it('converts blockquotes', () => {
      const html = markdownToHtml('> This is a quote');
      expect(html).toContain('<blockquote>');
      expect(html).toContain('This is a quote');
    });

    it('converts images', () => {
      const html = markdownToHtml('![alt text](https://example.com/img.png)');
      expect(html).toContain('<img');
      expect(html).toContain('alt="alt text"');
      expect(html).toContain('src="https://example.com/img.png"');
    });

    it('converts inline code', () => {
      const html = markdownToHtml('Use `const x = 1` here');
      expect(html).toContain('<code>const x = 1</code>');
    });

    it('converts fenced code blocks', () => {
      const html = markdownToHtml('```js\nconst x = 1;\n```');
      expect(html).toContain('<code');
    });
  });

  describe('task list roundtrip', () => {
    it('converts GFM task lists to Tiptap format', () => {
      const html = markdownToHtml('- [ ] unchecked\n- [x] checked');
      expect(html).toContain('data-type="taskList"');
      expect(html).toContain('data-type="taskItem"');
      expect(html).toContain('data-checked="false"');
      expect(html).toContain('data-checked="true"');
    });

    it('handles task list items with blank lines between them', () => {
      const html = markdownToHtml('- [ ] first\n    \n- [ ] second\n    \n');
      expect(html).toContain('data-type="taskList"');
      expect(html).toContain('data-type="taskItem"');
      expect(html).not.toContain('<input');
    });

    it('does not convert regular lists to task lists', () => {
      const html = markdownToHtml('- item 1\n- item 2');
      expect(html).not.toContain('data-type="taskList"');
      expect(html).not.toContain('data-type="taskItem"');
    });
  });

  describe('callout roundtrip', () => {
    it('parses multi-line callout', () => {
      const html = markdownToHtml('> [!NOTE]\n> This is a note');
      expect(html).toContain('data-callout');
      expect(html).toContain('data-callout-type="note"');
      expect(html).toContain('This is a note');
    });

    it('parses single-line callout', () => {
      const html = markdownToHtml('> [!NOTE] This is a note');
      expect(html).toContain('data-callout');
      expect(html).toContain('data-callout-type="note"');
      expect(html).toContain('This is a note');
    });

    it('parses all callout types', () => {
      for (const type of ['NOTE', 'TIP', 'INFO', 'WARNING']) {
        const html = markdownToHtml(`> [!${type}] text`);
        expect(html).toContain(`data-callout-type="${type.toLowerCase()}"`);
      }
    });

    it('does not treat regular blockquotes as callouts', () => {
      const html = markdownToHtml('> Just a regular quote');
      expect(html).not.toContain('data-callout');
      expect(html).toContain('<blockquote>');
    });

    it('keeps consecutive callouts separate', () => {
      const md = '> [!NOTE]\n> Note text\n\n> [!TIP]\n> Tip text';
      const html = markdownToHtml(md);
      const noteCount = (html.match(/data-callout-type="note"/g) || []).length;
      const tipCount = (html.match(/data-callout-type="tip"/g) || []).length;
      expect(noteCount).toBe(1);
      expect(tipCount).toBe(1);
    });
  });

  describe('htmlToMarkdown', () => {
    it('converts headings', () => {
      const md = htmlToMarkdown('<h1>Hello</h1>');
      expect(md).toBe('# Hello');
    });

    it('converts bold and italic', () => {
      const md = htmlToMarkdown('<p><strong>bold</strong> and <em>italic</em></p>');
      expect(md).toContain('**bold**');
      expect(md).toContain('*italic*');
    });

    it('converts links', () => {
      const md = htmlToMarkdown('<a href="https://example.com">link</a>');
      expect(md).toContain('[link](https://example.com)');
    });

    it('converts images', () => {
      const md = htmlToMarkdown('<img src="https://example.com/img.png" alt="alt">');
      expect(md).toContain('![alt](https://example.com/img.png)');
    });

    it('converts highlight marks', () => {
      const md = htmlToMarkdown('<mark>highlighted</mark>');
      expect(md).toBe('==highlighted==');
    });
  });

  describe('full roundtrip (MD → HTML → MD)', () => {
    it('preserves headings', () => {
      const original = '# My Heading';
      const result = htmlToMarkdown(markdownToHtml(original));
      expect(result.trim()).toContain('# My Heading');
    });

    it('preserves blockquotes', () => {
      const original = '> A quote';
      const result = htmlToMarkdown(markdownToHtml(original));
      expect(result.trim()).toContain('> A quote');
    });

    it('preserves images', () => {
      const original = '![logo](https://example.com/logo.png)';
      const result = htmlToMarkdown(markdownToHtml(original));
      expect(result.trim()).toContain('![logo](https://example.com/logo.png)');
    });

    it('preserves horizontal rules', () => {
      const original = '---';
      const result = htmlToMarkdown(markdownToHtml(original));
      expect(result.trim()).toContain('---');
    });
  });

  describe('isMarkdownContent', () => {
    it('detects headings', () => {
      expect(isMarkdownContent('# Hello')).toBe(true);
    });

    it('detects lists', () => {
      expect(isMarkdownContent('- item')).toBe(true);
      expect(isMarkdownContent('1. item')).toBe(true);
    });

    it('detects code blocks', () => {
      expect(isMarkdownContent('```\ncode\n```')).toBe(true);
    });

    it('detects HTML as non-markdown', () => {
      expect(isMarkdownContent('<h1>Hello</h1>')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isMarkdownContent('')).toBe(false);
    });

    it('treats plain text as markdown', () => {
      expect(isMarkdownContent('Just some text without HTML')).toBe(true);
    });
  });
});
