/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModalHistory } from '../hooks/useModalHistory';

describe('useModalHistory', () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>;
  let backSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pushStateSpy = vi.spyOn(window.history, 'pushState');
    backSpy = vi.spyOn(window.history, 'back');
  });

  afterEach(() => {
    pushStateSpy.mockRestore();
    backSpy.mockRestore();
  });

  it('pushes history entry when modal opens', () => {
    const onClose = vi.fn();
    renderHook(() => useModalHistory(true, onClose));
    expect(pushStateSpy).toHaveBeenCalledWith({ modal: true }, '');
  });

  it('does not push history when modal is closed', () => {
    const onClose = vi.fn();
    renderHook(() => useModalHistory(false, onClose));
    expect(pushStateSpy).not.toHaveBeenCalled();
  });

  it('calls onClose when popstate fires (back button)', () => {
    const onClose = vi.fn();
    renderHook(() => useModalHistory(true, onClose));

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closeModal calls history.back()', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useModalHistory(true, onClose));

    act(() => {
      result.current(); // closeModal
    });

    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('does not respond to popstate when modal is closed', () => {
    const onClose = vi.fn();
    renderHook(() => useModalHistory(false, onClose));

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('cleans up popstate listener when modal closes', () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(
      ({ isOpen }) => useModalHistory(isOpen, onClose),
      { initialProps: { isOpen: true } },
    );

    // Close modal
    rerender({ isOpen: false });

    // popstate should not trigger onClose
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
