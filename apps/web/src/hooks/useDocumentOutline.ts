import { useState, useEffect, useRef, useMemo } from 'react';
import type { Editor } from '@tiptap/react';

export interface OutlineHeading {
  id: string;
  text: string;
  level: number;
  pos: number;
}

function extractHeadings(editor: Editor): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  let index = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({
        id: `heading-${index++}`,
        text: node.textContent,
        level: node.attrs.level as number,
        pos,
      });
    }
  });
  return headings;
}

function headingsEqual(a: OutlineHeading[], b: OutlineHeading[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].text !== b[i].text || a[i].level !== b[i].level || a[i].pos !== b[i].pos) {
      return false;
    }
  }
  return true;
}

export function useDocumentOutline(editor: Editor | null) {
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const prevHeadingsRef = useRef<OutlineHeading[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor) {
      setHeadings([]);
      prevHeadingsRef.current = [];
      return;
    }

    const update = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const next = extractHeadings(editor);
        if (!headingsEqual(next, prevHeadingsRef.current)) {
          prevHeadingsRef.current = next;
          setHeadings(next);
        }
      }, 100);
    };

    // Initial extraction
    update();

    editor.on('update', update);
    return () => {
      editor.off('update', update);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editor]);

  return useMemo(() => ({ headings }), [headings]);
}
