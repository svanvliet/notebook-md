const API_BASE = '/api';

/**
 * Wrapper around fetch for API calls. Automatically includes credentials
 * and dispatches 'auth:session-invalid' on 401/403 responses so the app
 * can log the user out without polling.
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const url = path.startsWith('/') ? path : `${API_BASE}/${path}`;
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
