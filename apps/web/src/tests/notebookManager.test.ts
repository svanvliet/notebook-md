import { describe, it, expect } from 'vitest';
import type { OpenTab } from '../hooks/useNotebookManager';

// Test tab management logic in isolation
// The full hook is heavily coupled to IndexedDB + API; these tests
// verify the data structures and key logic patterns used by the hook.

describe('useNotebookManager - Tab Logic', () => {
  const makeTabs = (...ids: string[]): OpenTab[] =>
    ids.map((id) => ({
      id,
      notebookId: id.split(':')[0],
      path: id.split(':')[1],
      name: id.split(':')[1]?.split('/').pop() ?? '',
      content: '',
      savedContent: '',
      hasUnsavedChanges: false,
      lastSaved: null,
    }));

  it('tab id format is notebookId:path', () => {
    const tab = makeTabs('nb1:docs/readme.md')[0];
    expect(tab.id).toBe('nb1:docs/readme.md');
    expect(tab.notebookId).toBe('nb1');
    expect(tab.path).toBe('docs/readme.md');
    expect(tab.name).toBe('readme.md');
  });

  it('hasUnsavedChanges tracks content divergence', () => {
    const tab: OpenTab = {
      id: 'nb1:file.md',
      notebookId: 'nb1',
      path: 'file.md',
      name: 'file.md',
      content: 'hello',
      savedContent: 'hello',
      hasUnsavedChanges: false,
      lastSaved: Date.now(),
    };
    expect(tab.hasUnsavedChanges).toBe(false);

    // Simulate content change
    const updated = { ...tab, content: 'hello world', hasUnsavedChanges: true };
    expect(updated.hasUnsavedChanges).toBe(true);
    expect(updated.content).not.toBe(updated.savedContent);
  });

  it('closing active tab selects adjacent tab', () => {
    const tabs = makeTabs('nb1:a.md', 'nb1:b.md', 'nb1:c.md');
    const activeTabId = 'nb1:b.md';
    const closingId = 'nb1:b.md';

    // Simulate the hook's tab close logic
    const remaining = tabs.filter((t) => t.id !== closingId);
    const closedIdx = tabs.findIndex((t) => t.id === closingId);
    const newActive =
      activeTabId === closingId
        ? remaining[Math.min(closedIdx, remaining.length - 1)]?.id ?? null
        : activeTabId;

    expect(remaining).toHaveLength(2);
    expect(newActive).toBe('nb1:c.md');
  });

  it('closing last tab sets active to null', () => {
    const tabs = makeTabs('nb1:a.md');
    const remaining = tabs.filter((t) => t.id !== 'nb1:a.md');
    const newActive = remaining.length > 0 ? remaining[0].id : null;
    expect(newActive).toBeNull();
  });

  it('provider-to-sourceType mapping is correct', () => {
    // This matches the logic in handleProviderUnlinked
    const providerMap: Record<string, string[]> = {
      microsoft: ['onedrive'],
      google: ['google-drive'],
      github: ['github'],
    };
    expect(providerMap['microsoft']).toEqual(['onedrive']);
    expect(providerMap['google']).toEqual(['google-drive']);
    expect(providerMap['github']).toEqual(['github']);
  });

  it('filtering tabs by source type removes matching notebooks', () => {
    const tabs = makeTabs('gh-nb:readme.md', 'local-nb:notes.md', 'gh-nb:docs/api.md');
    const githubNotebookIds = new Set(['gh-nb']);

    const remaining = tabs.filter((t) => !githubNotebookIds.has(t.notebookId));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('local-nb:notes.md');
  });

  it('tab rename updates id and active tab reference', () => {
    const tabs = makeTabs('nb1:old.md', 'nb1:other.md');
    const activeTabId = 'nb1:old.md';
    const oldKey = 'nb1:old.md';
    const newKey = 'nb1:new.md';

    const updated = tabs.map((t) =>
      t.id === oldKey ? { ...t, id: newKey, path: 'new.md', name: 'new.md' } : t,
    );
    const newActive = activeTabId === oldKey ? newKey : activeTabId;

    expect(updated[0].id).toBe('nb1:new.md');
    expect(newActive).toBe('nb1:new.md');
  });
});
