/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../hooks/useAuth';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const testUser = {
  id: 'u1',
  displayName: 'Test User',
  email: 'test@example.com',
  emailVerified: true,
  avatarUrl: null,
  hasPassword: true,
};

describe('useAuth', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('starts in loading state and resolves user from /auth/me', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ user: testUser }) });
    const { result } = renderHook(() => useAuth());
    expect(result.current.loading).toBe(true);

    // Wait for useEffect to complete
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.user?.id).toBe('u1');
  });

  it('sets user to null when /auth/me returns non-ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('sets user to null on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useAuth());
    await act(async () => {});
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('signUp sets user on success', async () => {
    // Initial /auth/me
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    // Sign up
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ user: testUser }) });
    let success: boolean;
    await act(async () => {
      success = await result.current.signUp('test@example.com', 'password123');
    });
    expect(success!).toBe(true);
    expect(result.current.user?.email).toBe('test@example.com');
  });

  it('signUp sets error on failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Email taken' }) });
    await act(async () => {
      await result.current.signUp('test@example.com', 'password123');
    });
    expect(result.current.error).toBe('Email taken');
    expect(result.current.user).toBeNull();
  });

  it('signIn sets user on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ user: testUser }) });
    let success: boolean;
    await act(async () => {
      success = await result.current.signIn('test@example.com', 'password123');
    });
    expect(success!).toBe(true);
    expect(result.current.user?.id).toBe('u1');
  });

  it('signIn sets error on wrong credentials', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Invalid credentials' }) });
    await act(async () => {
      await result.current.signIn('test@example.com', 'wrong');
    });
    expect(result.current.error).toBe('Invalid credentials');
  });

  it('signOut clears user state', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ user: testUser }) });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});
    expect(result.current.user).toBeTruthy();

    mockFetch.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.user).toBeNull();
  });

  it('changePassword sends confirmPassword', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ user: testUser }) });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await act(async () => {
      await result.current.changePassword('old', 'new12345', 'new12345');
    });

    const putCall = (mockFetch.mock.calls as [string, RequestInit?][]).find(
      (c) => c[0].includes('/auth/password'),
    );
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1]!.body as string);
    expect(body.confirmPassword).toBe('new12345');
  });

  it('deleteAccount sends confirmation for OAuth-only users', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ user: testUser }) });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    mockFetch.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      await result.current.deleteAccount(undefined, 'DELETE');
    });

    const deleteCall = (mockFetch.mock.calls as [string, RequestInit?][]).find(
      (c) => c[1]?.method === 'DELETE',
    );
    expect(deleteCall).toBeTruthy();
    const body = JSON.parse(deleteCall![1]!.body as string);
    expect(body.confirmation).toBe('DELETE');
    expect(body.password).toBeUndefined();
  });

  it('devSkipAuth creates fake user', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    act(() => {
      result.current.devSkipAuth();
    });
    expect(result.current.user?.id).toBe('dev-user');
    expect(result.current.user?.hasPassword).toBe(true);
  });

  it('clearError resets error state', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Oops' }) });
    await act(async () => {
      await result.current.signIn('x', 'y');
    });
    expect(result.current.error).toBe('Oops');

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });

  it('signIn handles network error gracefully', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    await act(async () => {
      await result.current.signIn('x', 'y');
    });
    expect(result.current.error).toContain('Network error');
  });

  it('logs out when auth:session-invalid event is dispatched', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ user: testUser }) });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});
    expect(result.current.user).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new Event('auth:session-invalid'));
    });
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBe('Your session has ended.');
  });

  it('re-validates session on visibility change', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ user: testUser }) });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});
    expect(result.current.user).toBeTruthy();

    // Simulate tab becoming visible with invalid session
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      // Allow the async handler to complete
      await new Promise(r => setTimeout(r, 10));
    });
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBe('Your session has ended.');
  });
});
