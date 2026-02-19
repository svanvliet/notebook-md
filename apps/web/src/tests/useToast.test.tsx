/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../hooks/useToast';
import type { ReactNode } from 'react';
import React from 'react';

function wrapper({ children }: { children: ReactNode }) {
  return React.createElement(ToastProvider, null, children);
}

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a toast and exposes it', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => result.current.addToast('Hello', 'success'));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Hello');
    expect(result.current.toasts[0].type).toBe('success');
  });

  it('auto-dismisses success toasts after 4s', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => result.current.addToast('Done', 'success'));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(4100));
    expect(result.current.toasts).toHaveLength(0);
  });

  it('auto-dismisses warning toasts after 6s', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => result.current.addToast('Watch out', 'warning'));
    act(() => vi.advanceTimersByTime(4100));
    expect(result.current.toasts).toHaveLength(1); // not yet
    act(() => vi.advanceTimersByTime(2100));
    expect(result.current.toasts).toHaveLength(0);
  });

  it('does not auto-dismiss error toasts', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => result.current.addToast('Oops', 'error'));
    act(() => vi.advanceTimersByTime(30000));
    expect(result.current.toasts).toHaveLength(1);
  });

  it('manually dismisses a toast', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => result.current.addToast('Error', 'error'));
    const id = result.current.toasts[0].id;
    act(() => result.current.dismissToast(id));
    expect(result.current.toasts).toHaveLength(0);
  });

  it('stacks newest first', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => result.current.addToast('First', 'error'));
    act(() => result.current.addToast('Second', 'error'));
    expect(result.current.toasts[0].message).toBe('Second');
    expect(result.current.toasts[1].message).toBe('First');
  });

  it('limits to 5 visible toasts', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      for (let i = 0; i < 7; i++) {
        result.current.addToast(`Toast ${i}`, 'error');
      }
    });
    expect(result.current.toasts).toHaveLength(5);
  });

  it('defaults to info type', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => result.current.addToast('Default'));
    expect(result.current.toasts[0].type).toBe('info');
  });
});
