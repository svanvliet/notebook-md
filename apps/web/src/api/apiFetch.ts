const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Wrapper around fetch for API calls. Automatically includes credentials
 * and dispatches 'auth:session-invalid' on 401/403 responses so the app
 * can log the user out without polling.
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (res.status === 401 || res.status === 403) {
    window.dispatchEvent(new Event('auth:session-invalid'));
  }

  return res;
}
