import { useState, useEffect, useCallback } from 'react';

const API_BASE = '';

export interface User {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  hasPassword?: boolean;
  twoFactorEnabled?: boolean;
  twoFactorMethod?: 'totp' | 'email' | null;
  isAdmin?: boolean;
  createdAt?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

interface TwoFactorChallenge {
  challengeToken: string;
  method: 'totp' | 'email';
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<TwoFactorChallenge | null>(null);

  // Check existing session on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setState({ user: data.user, loading: false, error: null });
        } else {
          setState({ user: null, loading: false, error: null });
        }
      } catch {
        setState({ user: null, loading: false, error: null });
      }
    })();
  }, []);

  // Periodic session validation — catches suspensions, revocations, etc.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!state.user) return;
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
        if (!res.ok) {
          setState({ user: null, loading: false, error: 'Your session has ended.' });
        }
      } catch {
        // Network error — don't log out, they may be temporarily offline
      }
    }, 30_000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [state.user]);

  const signUp = useCallback(async (email: string, password: string, displayName?: string, rememberMe?: boolean) => {
    setState(s => ({ ...s, error: null }));
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, displayName, rememberMe }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState(s => ({ ...s, error: data.error }));
        return false;
      }
      setState({ user: data.user, loading: false, error: null });
      return true;
    } catch (err) {
      setState(s => ({ ...s, error: 'Network error. Please try again.' }));
      return false;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string, rememberMe?: boolean) => {
    setState(s => ({ ...s, error: null }));
    try {
      const res = await fetch(`${API_BASE}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, rememberMe }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState(s => ({ ...s, error: data.error }));
        return false;
      }
      // Check if 2FA is required
      if (data.requires2fa) {
        setTwoFactorChallenge({ challengeToken: data.challengeToken, method: data.method });
        return false; // Not fully signed in yet
      }
      setState({ user: data.user, loading: false, error: null });
      return true;
    } catch (err) {
      setState(s => ({ ...s, error: 'Network error. Please try again.' }));
      return false;
    }
  }, []);

  const requestMagicLink = useCallback(async (email: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/magic-link/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const verifyMagicLink = useCallback(async (token: string, rememberMe?: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/auth/magic-link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, rememberMe }),
      });
      const data = await res.json();
      if (res.ok) {
        setState({ user: data.user, loading: false, error: null });
        return true;
      }
      setState(s => ({ ...s, error: data.error }));
      return false;
    } catch {
      return false;
    }
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/signout`, { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    setState({ user: null, loading: false, error: null });
  }, []);

  const updateProfile = useCallback(async (updates: { displayName?: string; avatarUrl?: string }) => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setState(s => s.user ? { ...s, user: { ...s.user, ...updates } } : s);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string, confirmPassword: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) return data.error as string;
      return null;
    } catch {
      return 'Network error';
    }
  }, []);

  const deleteAccount = useCallback(async (password?: string, confirmation?: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password, confirmation }),
      });
      if (res.ok) {
        setState({ user: null, loading: false, error: null });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  const setError = useCallback((error: string) => {
    setState(s => ({ ...s, error }));
  }, []);

  // Dev-only skip auth
  const devSkipAuth = useCallback(() => {
    setState({
      user: { id: 'dev-user', displayName: 'Dev User', email: 'dev@localhost', emailVerified: true, avatarUrl: null, hasPassword: true },
      loading: false,
      error: null,
    });
  }, []);

  // ── 2FA methods ──────────────────────────────────────────────────────────

  const verify2fa = useCallback(async (code: string, method?: 'totp' | 'email' | 'recovery') => {
    if (!twoFactorChallenge) return false;
    setState(s => ({ ...s, error: null }));
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ challengeToken: twoFactorChallenge.challengeToken, code, method }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState(s => ({ ...s, error: data.error }));
        return false;
      }
      setTwoFactorChallenge(null);
      setState({ user: data.user, loading: false, error: null });
      return true;
    } catch {
      setState(s => ({ ...s, error: 'Network error. Please try again.' }));
      return false;
    }
  }, [twoFactorChallenge]);

  const send2faEmailCode = useCallback(async () => {
    if (!twoFactorChallenge) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ challengeToken: twoFactorChallenge.challengeToken }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [twoFactorChallenge]);

  const cancel2fa = useCallback(() => {
    setTwoFactorChallenge(null);
    setState(s => ({ ...s, error: null }));
  }, []);

  const setup2fa = useCallback(async (): Promise<{ secret: string; uri: string } | null> => {
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/setup`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  const enable2fa = useCallback(async (code: string, method: 'totp' | 'email'): Promise<{ recoveryCodes: string[] } | null> => {
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, method }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      // Update local user state
      setState(s => s.user ? { ...s, user: { ...s.user, twoFactorEnabled: true, twoFactorMethod: method } } : s);
      return data;
    } catch {
      return null;
    }
  }, []);

  const disable2fa = useCallback(async (code: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        setState(s => s.user ? { ...s, user: { ...s.user, twoFactorEnabled: false, twoFactorMethod: null } } : s);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const sendDisable2faCode = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/send-disable-code`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    error: state.error,
    isSignedIn: !!state.user,
    twoFactorChallenge,
    signUp,
    signIn,
    signOut,
    requestMagicLink,
    verifyMagicLink,
    requestPasswordReset,
    updateProfile,
    changePassword,
    deleteAccount,
    clearError,
    setError,
    devSkipAuth,
    // 2FA
    verify2fa,
    send2faEmailCode,
    cancel2fa,
    setup2fa,
    enable2fa,
    disable2fa,
    sendDisable2faCode,
  };
}
