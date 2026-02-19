import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface SearchReplaceStorage {
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  isOpen: boolean;
  results: { from: number; to: number }[];
  currentIndex: number;
}

/** Type-safe accessor for search/replace storage on any editor instance */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSearchStorage(editor: { storage: any }): SearchReplaceStorage {
  return getSearchStorage(editor) as SearchReplaceStorage;
}

// Augment Tiptap's Commands interface so TS recognizes our commands
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchReplace: {
      openSearch: () => ReturnType;
      closeSearch: () => ReturnType;
      setSearchTerm: (term: string) => ReturnType;
      setReplaceTerm: (term: string) => ReturnType;
      toggleCaseSensitive: () => ReturnType;
      toggleWholeWord: () => ReturnType;
      findNext: () => ReturnType;
      findPrev: () => ReturnType;
      replaceCurrent: () => ReturnType;
      replaceAll: () => ReturnType;
    };
  }
}

const searchReplacePluginKey = new PluginKey('searchReplace');

interface DocLike {
  textBetween(from: number, to: number, blockSeparator?: string): string;
  content: { size: number };
}

export function findMatches(
  doc: DocLike,
  searchTerm: string,
  caseSensitive: boolean,
  wholeWord: boolean,
): { from: number; to: number }[] {
  if (!searchTerm) return [];

  const results: { from: number; to: number }[] = [];
  const text = doc.textBetween(0, doc.content.size, '\n');
  const term = caseSensitive ? searchTerm : searchTerm.toLowerCase();
  const haystack = caseSensitive ? text : text.toLowerCase();

  let pos = 0;
  while (pos < haystack.length) {
    const idx = haystack.indexOf(term, pos);
    if (idx === -1) break;

    if (wholeWord) {
      const before = idx > 0 ? haystack[idx - 1] : ' ';
      const after = idx + term.length < haystack.length ? haystack[idx + term.length] : ' ';
      if (/\w/.test(before) || /\w/.test(after)) {
        pos = idx + 1;
        continue;
      }
    }

    // +1 to convert from text offset to ProseMirror doc position
    results.push({ from: idx + 1, to: idx + term.length + 1 });
    pos = idx + 1;
  }

  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scrollToMatch(editor: any, match: { from: number; to: number }) {
  const { from } = match;
  editor.view.dispatch(
    editor.state.tr.setSelection(
      editor.state.selection.constructor.near(editor.state.doc.resolve(from)),
    ),
  );
  const dom = editor.view.domAtPos(from);
  if (dom.node instanceof HTMLElement) {
    dom.node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } else if (dom.node.parentElement) {
    dom.node.parentElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

export const SearchReplace = Extension.create<Record<string, never>, SearchReplaceStorage>({
  name: 'searchReplace',

  addStorage() {
    return {
      searchTerm: '',
      replaceTerm: '',
      caseSensitive: false,
      wholeWord: false,
      isOpen: false,
      results: [],
      currentIndex: 0,
    };
  },

  addCommands() {
    return {
      openSearch:
        () =>
        ({ editor }) => {
          getSearchStorage(editor).isOpen = true;
          editor.view.dispatch(editor.state.tr);
          return true;
        },

      closeSearch:
        () =>
        ({ editor }) => {
          getSearchStorage(editor).isOpen = false;
          getSearchStorage(editor).searchTerm = '';
          getSearchStorage(editor).results = [];
          getSearchStorage(editor).currentIndex = 0;
          editor.view.dispatch(editor.state.tr);
          return true;
        },

      setSearchTerm:
        (term: string) =>
        ({ editor }) => {
          getSearchStorage(editor).searchTerm = term;
          const results = findMatches(
            editor.state.doc,
            term,
            getSearchStorage(editor).caseSensitive,
            getSearchStorage(editor).wholeWord,
          );
          getSearchStorage(editor).results = results;
          getSearchStorage(editor).currentIndex = results.length > 0 ? 0 : -1;

          if (results.length > 0) {
            scrollToMatch(editor, results[0]);
          } else {
            editor.view.dispatch(editor.state.tr);
          }
          return true;
        },

      setReplaceTerm:
        (term: string) =>
        ({ editor }) => {
          getSearchStorage(editor).replaceTerm = term;
          return true;
        },

      toggleCaseSensitive:
        () =>
        ({ editor, commands }) => {
          getSearchStorage(editor).caseSensitive = !getSearchStorage(editor).caseSensitive;
          commands.setSearchTerm(getSearchStorage(editor).searchTerm);
          return true;
        },

      toggleWholeWord:
        () =>
        ({ editor, commands }) => {
          getSearchStorage(editor).wholeWord = !getSearchStorage(editor).wholeWord;
          commands.setSearchTerm(getSearchStorage(editor).searchTerm);
          return true;
        },

      findNext:
        () =>
        ({ editor }) => {
          const { results, currentIndex } = getSearchStorage(editor);
          if (results.length === 0) return false;
          const next = (currentIndex + 1) % results.length;
          getSearchStorage(editor).currentIndex = next;
          scrollToMatch(editor, results[next]);
          return true;
        },

      findPrev:
        () =>
        ({ editor }) => {
          const { results, currentIndex } = getSearchStorage(editor);
          if (results.length === 0) return false;
          const prev = (currentIndex - 1 + results.length) % results.length;
          getSearchStorage(editor).currentIndex = prev;
          scrollToMatch(editor, results[prev]);
          return true;
        },

      replaceCurrent:
        () =>
        ({ editor, commands }) => {
          const { results, currentIndex, replaceTerm } = getSearchStorage(editor);
          if (results.length === 0 || currentIndex < 0) return false;
          const match = results[currentIndex];
          editor.chain().focus().insertContentAt({ from: match.from, to: match.to }, replaceTerm).run();
          commands.setSearchTerm(getSearchStorage(editor).searchTerm);
          return true;
        },

      replaceAll:
        () =>
        ({ editor, commands }) => {
          const { results, replaceTerm } = getSearchStorage(editor);
          if (results.length === 0) return false;
          const sorted = [...results].sort((a, b) => b.from - a.from);
          const { tr } = editor.state;
          for (const match of sorted) {
            tr.insertText(replaceTerm, match.from, match.to);
          }
          editor.view.dispatch(tr);
          commands.setSearchTerm(getSearchStorage(editor).searchTerm);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-f': () => {
        if (getSearchStorage(this.editor).isOpen) {
          window.dispatchEvent(new CustomEvent('search-replace-focus'));
          return true;
        }
        this.editor.commands.openSearch();
        return true;
      },
      Escape: () => {
        if (getSearchStorage(this.editor).isOpen) {
          this.editor.commands.closeSearch();
          this.editor.commands.focus();
          return true;
        }
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    const extensionThis = this;
    return [
      new Plugin({
        key: searchReplacePluginKey,
        props: {
          decorations(state) {
            const { searchTerm, caseSensitive, wholeWord, isOpen } =
              extensionThis.storage;
            if (!isOpen || !searchTerm) return DecorationSet.empty;

            const results = findMatches(state.doc, searchTerm, caseSensitive, wholeWord);
            const { currentIndex } = extensionThis.storage;

            const decorations = results.map((result, i) => {
              const cls = i === currentIndex ? 'search-match search-match-current' : 'search-match';
              return Decoration.inline(result.from, result.to, { class: cls });
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
