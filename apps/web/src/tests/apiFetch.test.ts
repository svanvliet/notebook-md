/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from '../api/apiFetch';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('apiFetch', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    // Clean up event listeners
    vi.restoreAllMocks();
  });

  it('includes credentials and Content-Type by default', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200, ok: true });
    await apiFetch('/api/test');

    expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      credentials: 'include',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
  });

  it('merges custom headers', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200, ok: true });
    await apiFetch('/api/test', { headers: { 'X-Custom': 'value' } });

    const call = mockFetch.mock.calls[0][1];
    expect(call.headers['Content-Type']).toBe('application/json');
    expect(call.headers['X-Custom']).toBe('value');
  });

  it('dispatches auth:session-invalid on 401', async () => {
    mockFetch.mockResolvedValueOnce({ status: 401, ok: false });
    const handler = vi.fn();
    window.addEventListener('auth:session-invalid', handler);

    await apiFetch('/api/test');

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('auth:session-invalid', handler);
  });

  it('dispatches auth:session-invalid on 403', async () => {
    mockFetch.mockResolvedValueOnce({ status: 403, ok: false });
    const handler = vi.fn();
    window.addEventListener('auth:session-invalid', handler);

    await apiFetch('/api/test');

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('auth:session-invalid', handler);
  });

  it('does NOT dispatch auth:session-invalid on 200', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200, ok: true });
    const handler = vi.fn();
    window.addEventListener('auth:session-invalid', handler);

    await apiFetch('/api/test');

    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('auth:session-invalid', handler);
  });

  it('does NOT dispatch auth:session-invalid on 400 or 500', async () => {
    const handler = vi.fn();
    window.addEventListener('auth:session-invalid', handler);

    mockFetch.mockResolvedValueOnce({ status: 400, ok: false });
    await apiFetch('/api/test');

    mockFetch.mockResolvedValueOnce({ status: 500, ok: false });
    await apiFetch('/api/test');

    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('auth:session-invalid', handler);
  });

  it('passes through method and body', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200, ok: true });
    await apiFetch('/api/test', {
      method: 'POST',
      body: JSON.stringify({ key: 'value' }),
    });

    const call = mockFetch.mock.calls[0][1];
    expect(call.method).toBe('POST');
    expect(call.body).toBe('{"key":"value"}');
  });
});
