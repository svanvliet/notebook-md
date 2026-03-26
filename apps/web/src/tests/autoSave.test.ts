// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from '../hooks/useAutoSave';

// Mock isTauriEnvironment to false (browser mode for these tests)
vi.mock('../stores/storageAdapterFactory', () => ({
  isTauriEnvironment: () => false,
}));

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with saved state', () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ save }));
    expect(result.current.saveState).toBe('saved');
  });

  it('transitions to unsaved on markDirty', () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ save }));

    act(() => {
      result.current.markDirty();
    });

    expect(result.current.saveState).toBe('unsaved');
  });

  it('auto-saves after debounce delay', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ save, delayMs: 1000 }));

    act(() => {
      result.current.markDirty();
    });

    expect(save).not.toHaveBeenCalled();

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.saveState).toBe('saved');
  });

  it('resets debounce on repeated markDirty calls', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ save, delayMs: 1000 }));

    act(() => {
      result.current.markDirty();
    });

    // 500ms later, another edit
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      result.current.markDirty();
    });

    // 500ms after second edit — still within new debounce window
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(save).not.toHaveBeenCalled();

    // 500ms more — now 1000ms after second markDirty
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flushSave bypasses debounce', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ save, delayMs: 5000 }));

    act(() => {
      result.current.markDirty();
    });

    await act(async () => {
      await result.current.flushSave();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.saveState).toBe('saved');
  });

  it('does nothing when disabled', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutoSave({ save, delayMs: 500, enabled: false }),
    );

    act(() => {
      result.current.markDirty();
    });

    expect(result.current.saveState).toBe('saved');

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(save).not.toHaveBeenCalled();
  });

  it('reports unsaved on save failure', async () => {
    const save = vi.fn().mockRejectedValue(new Error('disk full'));
    const { result } = renderHook(() => useAutoSave({ save, delayMs: 100 }));

    act(() => {
      result.current.markDirty();
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.saveState).toBe('unsaved');
  });
});
