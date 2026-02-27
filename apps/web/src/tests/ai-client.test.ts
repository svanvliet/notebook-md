/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateAiContent } from '../api/ai';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to create a ReadableStream from SSE text chunks
function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]));
      } else {
        controller.close();
      }
    },
  });
}

function mockSSEResponse(chunks: string[], status = 200, headers: Record<string, string> = {}) {
  const allHeaders = {
    'Content-Type': 'text/event-stream',
    'X-AI-Generations-Remaining': '9',
    'X-AI-Generations-Limit': '10',
    ...headers,
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(allHeaders),
    body: createSSEStream(chunks),
    json: async () => ({}),
  };
}

describe('generateAiContent (SSE client)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('parses token events and calls onToken', async () => {
    const tokens: string[] = [];
    mockFetch.mockResolvedValueOnce(
      mockSSEResponse([
        'data: {"type":"token","content":"Hello"}\n\ndata: {"type":"token","content":" World"}\n\n',
        'data: {"type":"done"}\n\n',
      ]),
    );

    const done = vi.fn();
    generateAiContent(
      { prompt: 'test', length: 'short' },
      { onToken: (t) => tokens.push(t), onDone: done, onError: vi.fn() },
    );

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 100));
    expect(tokens).toEqual(['Hello', ' World']);
  });

  it('calls onDone on done event', async () => {
    mockFetch.mockResolvedValueOnce(
      mockSSEResponse([
        'data: {"type":"token","content":"Hi"}\n\n',
        'data: {"type":"done"}\n\n',
      ]),
    );

    const done = vi.fn();
    generateAiContent(
      { prompt: 'test', length: 'medium' },
      { onToken: vi.fn(), onDone: done, onError: vi.fn() },
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(done).toHaveBeenCalled();
  });

  it('calls onError on error event', async () => {
    mockFetch.mockResolvedValueOnce(
      mockSSEResponse([
        'data: {"type":"error","message":"AI service error"}\n\n',
      ]),
    );

    const onError = vi.fn();
    generateAiContent(
      { prompt: 'test', length: 'short' },
      { onToken: vi.fn(), onDone: vi.fn(), onError },
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(onError).toHaveBeenCalledWith('AI service error');
  });

  it('calls onQuota with parsed quota headers', async () => {
    mockFetch.mockResolvedValueOnce(
      mockSSEResponse(
        ['data: {"type":"done"}\n\n'],
        200,
        { 'X-AI-Generations-Remaining': '7', 'X-AI-Generations-Limit': '10' },
      ),
    );

    const onQuota = vi.fn();
    generateAiContent(
      { prompt: 'test', length: 'short' },
      { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onQuota },
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(onQuota).toHaveBeenCalledWith({ remaining: 7, limit: 10 });
  });

  it('handles 429 rate limit response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ 'X-AI-Generations-Remaining': '0', 'X-AI-Generations-Limit': '10' }),
      json: async () => ({ error: 'Rate limit exceeded' }),
    });

    const onError = vi.fn();
    generateAiContent(
      { prompt: 'test', length: 'short' },
      { onToken: vi.fn(), onDone: vi.fn(), onError },
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(onError).toHaveBeenCalledWith('Rate limit exceeded', { signUpRequired: false });
  });

  it('abort cancels the request', async () => {
    mockFetch.mockImplementation(
      () => new Promise((_, reject) => {
        // Simulate abort
        setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 50);
      }),
    );

    const onError = vi.fn();
    const controller = generateAiContent(
      { prompt: 'test', length: 'short' },
      { onToken: vi.fn(), onDone: vi.fn(), onError },
    );

    controller.abort();
    await new Promise((r) => setTimeout(r, 100));
    // AbortError should NOT call onError (it's silenced in the client)
    expect(onError).not.toHaveBeenCalled();
  });

  it('handles non-ok status with error body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers({}),
      json: async () => ({ error: 'Internal error' }),
    });

    const onError = vi.fn();
    generateAiContent(
      { prompt: 'test', length: 'short' },
      { onToken: vi.fn(), onDone: vi.fn(), onError },
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(onError).toHaveBeenCalledWith('Internal error');
  });

  it('calls /api/ai/generate/demo when demo option is set', async () => {
    mockFetch.mockResolvedValueOnce(
      mockSSEResponse([
        'data: {"type":"token","content":"Demo"}\n\n',
        'data: {"type":"done"}\n\n',
      ]),
    );

    generateAiContent(
      { prompt: 'test', length: 'short' },
      { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
      { demo: true },
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/ai/generate/demo');
  });

  it('calls /api/ai/generate when demo option is not set', async () => {
    mockFetch.mockResolvedValueOnce(
      mockSSEResponse([
        'data: {"type":"done"}\n\n',
      ]),
    );

    generateAiContent(
      { prompt: 'test', length: 'short' },
      { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
    );

    await new Promise((r) => setTimeout(r, 100));
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/ai/generate');
    expect(url).not.toContain('/demo');
  });

  it('passes signUpRequired in onError meta for 429 with signUpRequired flag', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ 'X-AI-Generations-Remaining': '0', 'X-AI-Generations-Limit': '3' }),
      json: async () => ({ error: 'Demo limit reached. Sign up!', signUpRequired: true }),
    });

    const onError = vi.fn();
    generateAiContent(
      { prompt: 'test', length: 'short' },
      { onToken: vi.fn(), onDone: vi.fn(), onError },
      { demo: true },
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(onError).toHaveBeenCalledWith('Demo limit reached. Sign up!', { signUpRequired: true });
  });
});
