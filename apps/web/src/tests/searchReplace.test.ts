import { describe, it, expect } from 'vitest';
import { findMatches } from '../components/editor/SearchReplace';

/** Mock ProseMirror doc for testing findMatches */
function mockDoc(text: string) {
  return {
    textBetween: (_from: number, _to: number, _sep?: string) => text,
    content: { size: text.length },
  };
}

describe('SearchReplace findMatches', () => {
  it('finds simple substring matches', () => {
    const results = findMatches(mockDoc('hello world hello'), 'hello', false, false);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ from: 1, to: 6 }); // +1 for ProseMirror offset
    expect(results[1]).toEqual({ from: 13, to: 18 });
  });

  it('returns empty for empty search term', () => {
    expect(findMatches(mockDoc('some text'), '', false, false)).toEqual([]);
  });

  it('returns empty when no matches', () => {
    expect(findMatches(mockDoc('hello world'), 'xyz', false, false)).toEqual([]);
  });

  it('case-insensitive by default', () => {
    const results = findMatches(mockDoc('Hello HELLO hello'), 'hello', false, false);
    expect(results).toHaveLength(3);
  });

  it('case-sensitive when enabled', () => {
    const results = findMatches(mockDoc('Hello HELLO hello'), 'hello', true, false);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ from: 13, to: 18 });
  });

  it('whole-word matching excludes partial matches', () => {
    const results = findMatches(mockDoc('cat category concatenate'), 'cat', false, true);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ from: 1, to: 4 });
  });

  it('whole-word with case-sensitive', () => {
    const results = findMatches(mockDoc('Cat cat CAT'), 'cat', true, true);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ from: 5, to: 8 });
  });

  it('finds overlapping positions (non-overlapping matches)', () => {
    const results = findMatches(mockDoc('aaa'), 'aa', false, false);
    // 'aa' at index 0 and 'aa' at index 1
    expect(results).toHaveLength(2);
  });

  it('handles special characters in search term', () => {
    const results = findMatches(mockDoc('price is $10.00'), '$10', false, false);
    expect(results).toHaveLength(1);
  });
});
