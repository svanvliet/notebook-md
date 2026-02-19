/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettings } from '../hooks/useSettings';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const LOCAL_KEY = 'notebookmd-settings';

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch.mockReset();
    // Default: server returns empty settings
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ settings: {} }) });
  });

  it('returns default settings when localStorage is empty', () => {
    const { result } = renderHook(() => useSettings(false));
    expect(result.current.settings.fontFamily).toContain('-apple-system');
    expect(result.current.settings.fontSize).toBe(16);
    expect(result.current.settings.margins).toBe('regular');
    expect(result.current.settings.autoSave).toBe(true);
    expect(result.current.settings.spellCheck).toBe(true);
    expect(result.current.settings.lineNumbers).toBe(false);
    expect(result.current.settings.tabSize).toBe(2);
  });

  it('loads settings from localStorage on init', () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ fontSize: 20, margins: 'wide' }));
    const { result } = renderHook(() => useSettings(false));
    expect(result.current.settings.fontSize).toBe(20);
    expect(result.current.settings.margins).toBe('wide');
    // Other settings remain default
    expect(result.current.settings.spellCheck).toBe(true);
  });

  it('merges partial stored settings with defaults', () => {
    // Simulate older version missing new keys
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ fontSize: 14 }));
    const { result } = renderHook(() => useSettings(false));
    expect(result.current.settings.fontSize).toBe(14);
    expect(result.current.settings.lineNumbers).toBe(false);
    expect(result.current.settings.tabSize).toBe(2);
  });

  it('persists settings to localStorage on update', async () => {
    const { result } = renderHook(() => useSettings(false));

    await act(async () => {
      await result.current.updateSettings({ fontSize: 24 });
    });

    expect(result.current.settings.fontSize).toBe(24);
    const stored = JSON.parse(localStorage.getItem(LOCAL_KEY)!);
    expect(stored.fontSize).toBe(24);
    expect(stored.spellCheck).toBe(true); // Other settings preserved
  });

  it('resetSettings restores defaults and updates localStorage', async () => {
    const { result } = renderHook(() => useSettings(false));

    await act(async () => {
      await result.current.updateSettings({ fontSize: 24, margins: 'narrow' });
    });
    expect(result.current.settings.fontSize).toBe(24);

    act(() => {
      result.current.resetSettings();
    });

    expect(result.current.settings.fontSize).toBe(16);
    expect(result.current.settings.margins).toBe('regular');
    const stored = JSON.parse(localStorage.getItem(LOCAL_KEY)!);
    expect(stored.fontSize).toBe(16);
  });

  it('does not call server when not signed in', () => {
    renderHook(() => useSettings(false));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('syncs to server on update when signed in', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ settings: {} }) });
    const { result } = renderHook(() => useSettings(true));

    await act(async () => {
      await result.current.updateSettings({ fontSize: 20 });
    });

    // Should have called PUT /auth/settings
    const putCall = mockFetch.mock.calls.find(
      (c: [string, RequestInit?]) => c[1]?.method === 'PUT',
    );
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1]!.body as string);
    expect(body.settings.fontSize).toBe(20);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(LOCAL_KEY, 'not valid json{{{');
    const { result } = renderHook(() => useSettings(false));
    // Should fall back to defaults
    expect(result.current.settings.fontSize).toBe(16);
  });
});
