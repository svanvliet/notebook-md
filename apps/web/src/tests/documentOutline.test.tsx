// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// Mock TipTap editor for testing
function createMockEditor(headings: Array<{ level: number; text: string }>) {
  const listeners = new Map<string, Set<() => void>>();
  const doc = {
    descendants: (callback: (node: { type: { name: string }; attrs: { level: number }; textContent: string }, pos: number) => void) => {
      let pos = 0;
      for (const h of headings) {
        callback(
          { type: { name: 'heading' }, attrs: { level: h.level }, textContent: h.text },
          pos,
        );
        pos += h.text.length + 2;
      }
    },
  };

  return {
    state: { doc },
    on: (event: string, handler: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    off: (event: string, handler: () => void) => {
      listeners.get(event)?.delete(handler);
    },
    _emit: (event: string) => {
      listeners.get(event)?.forEach((h) => h());
    },
    _setHeadings: (newHeadings: Array<{ level: number; text: string }>) => {
      headings.length = 0;
      headings.push(...newHeadings);
    },
  };
}

describe('useDocumentOutline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('extracts headings from editor state', async () => {
    const { useDocumentOutline } = await import('../hooks/useDocumentOutline');
    const { renderHook, act } = await import('@testing-library/react');

    const editor = createMockEditor([
      { level: 1, text: 'Introduction' },
      { level: 2, text: 'Getting Started' },
      { level: 3, text: 'Prerequisites' },
    ]);

    const { result } = renderHook(() => useDocumentOutline(editor as any));
    await act(() => { vi.runAllTimers(); });

    expect(result.current.headings).toHaveLength(3);
    expect(result.current.headings[0]).toMatchObject({ text: 'Introduction', level: 1 });
    expect(result.current.headings[1]).toMatchObject({ text: 'Getting Started', level: 2 });
    expect(result.current.headings[2]).toMatchObject({ text: 'Prerequisites', level: 3 });
  });

  it('returns empty array for null editor', async () => {
    const { useDocumentOutline } = await import('../hooks/useDocumentOutline');
    const { renderHook } = await import('@testing-library/react');

    const { result } = renderHook(() => useDocumentOutline(null));
    expect(result.current.headings).toEqual([]);
  });

  it('returns empty array when document has no headings', async () => {
    const { useDocumentOutline } = await import('../hooks/useDocumentOutline');
    const { renderHook, act } = await import('@testing-library/react');

    const editor = createMockEditor([]);
    const { result } = renderHook(() => useDocumentOutline(editor as any));
    await act(() => { vi.runAllTimers(); });

    expect(result.current.headings).toEqual([]);
  });

  it('assigns sequential IDs to headings', async () => {
    const { useDocumentOutline } = await import('../hooks/useDocumentOutline');
    const { renderHook, act } = await import('@testing-library/react');

    const editor = createMockEditor([
      { level: 1, text: 'First' },
      { level: 2, text: 'Second' },
    ]);

    const { result } = renderHook(() => useDocumentOutline(editor as any));
    await act(() => { vi.runAllTimers(); });

    expect(result.current.headings[0].id).toBe('heading-0');
    expect(result.current.headings[1].id).toBe('heading-1');
  });

  it('updates headings on editor update event', async () => {
    const { useDocumentOutline } = await import('../hooks/useDocumentOutline');
    const { renderHook, act } = await import('@testing-library/react');

    const headings = [{ level: 1, text: 'Original' }];
    const editor = createMockEditor(headings);

    const { result } = renderHook(() => useDocumentOutline(editor as any));
    await act(() => { vi.runAllTimers(); });

    expect(result.current.headings).toHaveLength(1);
    expect(result.current.headings[0].text).toBe('Original');

    // Simulate editing
    await act(() => {
      editor._setHeadings([
        { level: 1, text: 'Original' },
        { level: 2, text: 'New Section' },
      ]);
      editor._emit('update');
      vi.runAllTimers();
    });

    expect(result.current.headings).toHaveLength(2);
    expect(result.current.headings[1].text).toBe('New Section');
  });

  it('clears headings when editor becomes null', async () => {
    const { useDocumentOutline } = await import('../hooks/useDocumentOutline');
    const { renderHook, act } = await import('@testing-library/react');

    const editor = createMockEditor([{ level: 1, text: 'Test' }]);
    const { result, rerender } = renderHook(
      ({ ed }) => useDocumentOutline(ed as any),
      { initialProps: { ed: editor } },
    );
    await act(() => { vi.runAllTimers(); });

    expect(result.current.headings).toHaveLength(1);

    rerender({ ed: null as any });
    expect(result.current.headings).toEqual([]);
  });
});

describe('OutlinePane rendering', () => {
  it('shows "No headings found" for empty headings', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { default: OutlinePane } = await import('../components/layout/OutlinePane');

    render(
      <OutlinePane
        headings={[]}
        editor={null}
        width={200}
        collapsed={false}
        onToggleCollapse={() => {}}
        onResizeMouseDown={() => {}}
        hasActiveDocument={true}
      />,
    );

    expect(screen.getByText('No headings found')).toBeDefined();
  });

  it('renders heading text with correct hierarchy', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { default: OutlinePane } = await import('../components/layout/OutlinePane');

    const headings = [
      { id: 'h-0', text: 'Title', level: 1, pos: 0 },
      { id: 'h-1', text: 'Section', level: 2, pos: 10 },
      { id: 'h-2', text: 'Subsection', level: 3, pos: 20 },
    ];

    render(
      <OutlinePane
        headings={headings}
        editor={null}
        width={200}
        collapsed={false}
        onToggleCollapse={() => {}}
        onResizeMouseDown={() => {}}
        hasActiveDocument={true}
      />,
    );

    expect(screen.getByText('Title')).toBeDefined();
    expect(screen.getByText('Section')).toBeDefined();
    expect(screen.getByText('Subsection')).toBeDefined();
  });

  it('returns null when no active document', async () => {
    const { render } = await import('@testing-library/react');
    const { default: OutlinePane } = await import('../components/layout/OutlinePane');

    const { container } = render(
      <OutlinePane
        headings={[]}
        editor={null}
        width={200}
        collapsed={false}
        onToggleCollapse={() => {}}
        onResizeMouseDown={() => {}}
        hasActiveDocument={false}
      />,
    );

    expect(container.querySelector('.outline-pane')).toBeNull();
  });

  it('shows only icon when collapsed', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { default: OutlinePane } = await import('../components/layout/OutlinePane');

    render(
      <OutlinePane
        headings={[{ id: 'h-0', text: 'Title', level: 1, pos: 0 }]}
        editor={null}
        width={40}
        collapsed={true}
        onToggleCollapse={() => {}}
        onResizeMouseDown={() => {}}
        hasActiveDocument={true}
      />,
    );

    // "Outline" label should not be visible when collapsed
    expect(screen.queryByText('Outline')).toBeNull();
    // Heading text should not be visible
    expect(screen.queryByText('Title')).toBeNull();
  });

  it('calls onToggleCollapse when toggle button clicked', async () => {
    const { render, screen, fireEvent } = await import('@testing-library/react');
    const { default: OutlinePane } = await import('../components/layout/OutlinePane');

    const onToggle = vi.fn();
    render(
      <OutlinePane
        headings={[]}
        editor={null}
        width={200}
        collapsed={false}
        onToggleCollapse={onToggle}
        onResizeMouseDown={() => {}}
        hasActiveDocument={true}
      />,
    );

    fireEvent.click(screen.getByTitle('Collapse outline'));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
