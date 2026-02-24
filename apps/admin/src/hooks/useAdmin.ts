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
  services: Record<string, { status: string; latencyMs?: number }>;
  uptimeSeconds?: number;
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
  rolloutPercentage: number;
  variants: string[] | null;
  staleAt: string | null;
  updatedAt: string;
}

interface FlagOverride {
  userId: string;
  email: string | null;
  displayName: string | null;
  enabled: boolean;
  variant: string | null;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  allowSelfEnroll: boolean;
  emailDomain: string | null;
  createdAt: string;
  memberCount: number;
}

interface GroupMember {
  userId: string;
  email: string;
  displayName: string | null;
  addedAt: string;
}

interface Flight {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  showBadge: boolean;
  badgeLabel: string;
  createdAt: string;
  flagCount: number;
  assignmentCount: number;
}

interface FlightAssignment {
  id: string;
  groupId: string | null;
  groupName: string | null;
  userId: string | null;
  email: string | null;
  assignedAt: string;
}

interface ResolvedFlag {
  enabled: boolean;
  variant: string | null;
  badge: string | null;
  source: string;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
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
        } else if (!user.twoFactorEnabled) {
          setError('Admin access requires two-factor authentication. Please enable 2FA in your account settings.');
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
    (data: { key: string; enabled: boolean; description?: string; rolloutPercentage?: number; variants?: string[] | null; staleAt?: string | null }) =>
      api<{ message: string }>('/admin/feature-flags', { method: 'POST', body: JSON.stringify(data) }),
    [],
  );

  const getFlagOverrides = useCallback(
    (key: string) => api<{ overrides: FlagOverride[] }>(`/admin/feature-flags/${key}/overrides`),
    [],
  );

  const createFlagOverride = useCallback(
    (key: string, data: { userId: string; enabled: boolean; variant?: string; reason?: string; expiresAt?: string }) =>
      api<{ message: string }>(`/admin/feature-flags/${key}/overrides`, { method: 'POST', body: JSON.stringify(data) }),
    [],
  );

  const deleteFlagOverride = useCallback(
    (key: string, userId: string) =>
      api<{ message: string }>(`/admin/feature-flags/${key}/overrides/${userId}`, { method: 'DELETE' }),
    [],
  );

  // ── Groups ────────────────────────────────────────────────────────

  const getGroups = useCallback(() => api<{ groups: UserGroup[] }>('/admin/groups'), []);

  const createGroup = useCallback(
    (data: { name: string; description?: string; allowSelfEnroll?: boolean; emailDomain?: string }) =>
      api<{ id: string; message: string }>('/admin/groups', { method: 'POST', body: JSON.stringify(data) }),
    [],
  );

  const getGroup = useCallback(
    (id: string) => api<{ group: UserGroup; members: GroupMember[] }>(`/admin/groups/${id}`),
    [],
  );

  const updateGroup = useCallback(
    (id: string, data: { name?: string; description?: string; allowSelfEnroll?: boolean; emailDomain?: string | null }) =>
      api<{ message: string }>(`/admin/groups/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    [],
  );

  const deleteGroup = useCallback(
    (id: string) => api<{ message: string }>(`/admin/groups/${id}`, { method: 'DELETE' }),
    [],
  );

  const addGroupMembers = useCallback(
    (id: string, userIds: string[]) =>
      api<{ message: string }>(`/admin/groups/${id}/members`, { method: 'POST', body: JSON.stringify({ userIds }) }),
    [],
  );

  const removeGroupMember = useCallback(
    (groupId: string, userId: string) =>
      api<{ message: string }>(`/admin/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
    [],
  );

  // ── Flights ───────────────────────────────────────────────────────

  const getFlights = useCallback(() => api<{ flights: Flight[] }>('/admin/flights'), []);

  const createFlight = useCallback(
    (data: { name: string; description?: string; flagKeys?: string[]; showBadge?: boolean; badgeLabel?: string }) =>
      api<{ id: string; message: string }>('/admin/flights', { method: 'POST', body: JSON.stringify(data) }),
    [],
  );

  const getFlight = useCallback(
    (id: string) => api<{ flight: Flight; flags: string[]; assignments: FlightAssignment[] }>(`/admin/flights/${id}`),
    [],
  );

  const updateFlight = useCallback(
    (id: string, data: { name?: string; description?: string; enabled?: boolean; showBadge?: boolean; badgeLabel?: string }) =>
      api<{ message: string }>(`/admin/flights/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    [],
  );

  const deleteFlight = useCallback(
    (id: string) => api<{ message: string }>(`/admin/flights/${id}`, { method: 'DELETE' }),
    [],
  );

  const addFlightFlags = useCallback(
    (id: string, flagKeys: string[]) =>
      api<{ message: string }>(`/admin/flights/${id}/flags`, { method: 'POST', body: JSON.stringify({ flagKeys }) }),
    [],
  );

  const removeFlightFlag = useCallback(
    (flightId: string, flagKey: string) =>
      api<{ message: string }>(`/admin/flights/${flightId}/flags/${flagKey}`, { method: 'DELETE' }),
    [],
  );

  const assignToFlight = useCallback(
    (flightId: string, data: { groupId?: string; userId?: string }) =>
      api<{ id: string; message: string }>(`/admin/flights/${flightId}/assign`, { method: 'POST', body: JSON.stringify(data) }),
    [],
  );

  const removeFlightAssignment = useCallback(
    (flightId: string, assignmentId: string) =>
      api<{ message: string }>(`/admin/flights/${flightId}/assignments/${assignmentId}`, { method: 'DELETE' }),
    [],
  );

  // ── User Flags ────────────────────────────────────────────────────

  const getUserFlags = useCallback(
    (userId: string) => api<{ flags: Record<string, ResolvedFlag> }>(`/admin/users/${userId}/flags`),
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
    await fetch(`${API_BASE}/auth/signout`, { method: 'POST', credentials: 'include' });
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
    getFlagOverrides,
    createFlagOverride,
    deleteFlagOverride,
    getGroups,
    createGroup,
    getGroup,
    updateGroup,
    deleteGroup,
    addGroupMembers,
    removeGroupMember,
    getFlights,
    createFlight,
    getFlight,
    updateFlight,
    deleteFlight,
    addFlightFlags,
    removeFlightFlag,
    assignToFlight,
    removeFlightAssignment,
    getUserFlags,
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
  FlagOverride,
  UserGroup,
  GroupMember,
  Flight,
  FlightAssignment,
  ResolvedFlag,
  Announcement,
};
