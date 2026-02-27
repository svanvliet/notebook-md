import { apiFetch } from './apiFetch';

export interface AiGenerateParams {
  prompt: string;
  length: 'short' | 'medium' | 'long';
  documentContext?: string;
  cursorContext?: string;
  notebookId?: string;
  webSearch?: boolean;
}

export interface AiQuotaInfo {
  remaining: number | null;
  limit: number | null;
}

export interface AiGenerateCallbacks {
  onToken: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  onQuota?: (quota: AiQuotaInfo) => void;
}

export function generateAiContent(
  params: AiGenerateParams,
  callbacks: AiGenerateCallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await apiFetch('/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify(params),
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });

      // Extract quota headers
      const remaining = res.headers.get('X-AI-Generations-Remaining');
      const limit = res.headers.get('X-AI-Generations-Limit');
      if (callbacks.onQuota) {
        callbacks.onQuota({
          remaining: remaining ? parseInt(remaining, 10) : null,
          limit: limit ? parseInt(limit, 10) : null,
        });
      }

      if (res.status === 429) {
        const body = await res.json();
        callbacks.onError(body.error || 'Rate limit exceeded');
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        callbacks.onError(body.error || `Server error (${res.status})`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError('Streaming not supported');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          try {
            const event = JSON.parse(json);
            if (event.type === 'token' && event.content) {
              callbacks.onToken(event.content);
            } else if (event.type === 'done') {
              callbacks.onDone();
              return;
            } else if (event.type === 'error') {
              callbacks.onError(event.message || 'Generation failed');
              return;
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }

      // Stream ended without a done event
      callbacks.onDone();
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      callbacks.onError(err.message || 'Network error');
    }
  })();

  return controller;
}
