import { useState, useEffect, useCallback } from 'react';

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isSuspended: boolean;
  twoFactorEnabled: boolean;
  twoFactorMethod: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface HealthStatus {
  status: string;
  services: Record<string, { status: string; uptimeSeconds?: number; latencyMs?: number }>;
}

interface Metrics {
  users: { total: number; active24h: number; active7d: number; signupsToday: number };
  notebooks: Record<string, number>;
  twoFactor: { enabled: number; total: number };
}

interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  details: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  userEmail?: string;
  userName?: string;
}

interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useAdmin() {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ user: AdminUser }>('/auth/me')
      .then(({ user }) => {
        if (!user.isAdmin) {
          setError('Access denied. Admin privileges required.');
        } else {
          setCurrentUser(user);
        }
      })
      .catch(() => setError('Not authenticated'))
      .finally(() => setLoading(false));
  }, []);

  // ── Health & Metrics ─────────────────────────────────────────────────

  const getHealth = useCallback(() => api<HealthStatus>('/admin/health'), []);
  const getMetrics = useCallback(() => api<Metrics>('/admin/metrics'), []);

  // ── Users ────────────────────────────────────────────────────────────

  const getUsers = useCallback(
    (params: { page?: number; limit?: number; search?: string } = {}) => {
      const sp = new URLSearchParams();
      if (params.page) sp.set('page', String(params.page));
      if (params.limit) sp.set('limit', String(params.limit));
      if (params.search) sp.set('search', params.search);
      return api<{ users: AdminUser[]; pagination: Pagination }>(`/admin/users?${sp}`);
    },
    [],
  );

  const getUser = useCallback(
    (id: string) =>
      api<{ user: AdminUser; notebookCount: number; activeSessions: number; linkedProviders: { provider: string; email: string }[] }>(
        `/admin/users/${id}`,
      ),
    [],
  );

  const updateUser = useCallback(
    (id: string, data: { isSuspended?: boolean }) =>
      api<{ message: string }>(`/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    [],
  );

  const deleteUser = useCallback(
    (id: string) => api<{ message: string }>(`/admin/users/${id}`, { method: 'DELETE' }),
    [],
  );

  // ── Feature Flags ──────────────────────────────────────────────────

  const getFeatureFlags = useCallback(() => api<{ flags: FeatureFlag[] }>('/admin/feature-flags'), []);

  const saveFeatureFlag = useCallback(
    (data: { key: string; enabled: boolean; description?: string }) =>
      api<{ message: string }>('/admin/feature-flags', { method: 'POST', body: JSON.stringify(data) }),
    [],
  );

  // ── Announcements ──────────────────────────────────────────────────

  const getAnnouncements = useCallback(() => api<{ announcements: Announcement[] }>('/admin/announcements'), []);

  const createAnnouncement = useCallback(
    (data: { title: string; body: string }) =>
      api<{ id: string }>('/admin/announcements', { method: 'POST', body: JSON.stringify(data) }),
    [],
  );

  const updateAnnouncement = useCallback(
    (id: string, data: { title?: string; body?: string; active?: boolean }) =>
      api<{ message: string }>(`/admin/announcements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    [],
  );

  const deleteAnnouncement = useCallback(
    (id: string) => api<{ message: string }>(`/admin/announcements/${id}`, { method: 'DELETE' }),
    [],
  );

  // ── Audit Log ──────────────────────────────────────────────────────

  const getAuditLog = useCallback(
    (params: { page?: number; limit?: number; action?: string; userId?: string } = {}) => {
      const sp = new URLSearchParams();
      if (params.page) sp.set('page', String(params.page));
      if (params.limit) sp.set('limit', String(params.limit));
      if (params.action) sp.set('action', params.action);
      if (params.userId) sp.set('userId', params.userId);
      return api<{ entries: AuditEntry[]; pagination: Pagination }>(`/admin/audit-log?${sp}`);
    },
    [],
  );

  // ── Sign out ───────────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    await fetch('/auth/signout', { method: 'POST', credentials: 'include' });
    setCurrentUser(null);
    setError('Not authenticated');
  }, []);

  return {
    currentUser,
    loading,
    error,
    getHealth,
    getMetrics,
    getUsers,
    getUser,
    updateUser,
    deleteUser,
    getFeatureFlags,
    saveFeatureFlag,
    getAnnouncements,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    getAuditLog,
    signOut,
  };
}

export type {
  AdminUser,
  Pagination,
  HealthStatus,
  Metrics,
  AuditEntry,
  FeatureFlag,
  Announcement,
};
