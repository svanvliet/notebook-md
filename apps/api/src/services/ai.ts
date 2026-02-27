import { isFeatureEnabled } from './featureFlags.js';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

// Lazy getters for env vars (ES module imports are hoisted before dotenv runs)
const getEndpoint = () => process.env.AZURE_AI_ENDPOINT || '';
const getApiKey = () => process.env.AZURE_AI_API_KEY || '';
const getModel = () => process.env.AZURE_AI_MODEL || 'gpt-4.1-nano';
const getDailyLimit = () => parseInt(process.env.AI_DAILY_GENERATION_LIMIT || '10', 10);
const getDemoLimit = () => parseInt(process.env.AI_DEMO_GENERATION_LIMIT || '3', 10);
const getWebSearchKey = () => process.env.BRAVE_SEARCH_API_KEY || '';
const isDev = () => process.env.NODE_ENV !== 'production';

export type AiLength = 'short' | 'medium' | 'long';

const MAX_TOKENS: Record<AiLength, number> = {
  short: 1024,
  medium: 2048,
  long: 16384,
};

const LENGTH_GUIDANCE: Record<AiLength, string> = {
  short: 'Keep the response concise — a few paragraphs at most.',
  medium: 'Provide a moderately detailed response — roughly 1–2 pages.',
  long: 'Provide a comprehensive, detailed response — up to several pages.',
};

const SYSTEM_PROMPT = `You are a content writer for a Markdown document editor called Notebook.md.
Generate well-structured content in Markdown format based on the user's prompt.

Rules:
- Use proper Markdown syntax: headings (#, ##, ###), lists (-, 1.), bold (**), italic (*), code blocks (\`\`\`), tables, blockquotes (>), and horizontal rules (---)
- Structure content with clear headings and logical sections
- Keep responses focused and relevant to the user's request
- Do not include meta-commentary about the generation process
- Do not wrap the entire response in a code block — return raw Markdown
- Use GFM (GitHub Flavored Markdown) extensions where appropriate: task lists (- [ ]), tables, strikethrough (~~)`;

const MAX_CONTEXT_LENGTH = 100_000;

// Fetch top web search results and format as context for the LLM
// Uses Brave Search API (free tier: 2,000 queries/month)
async function fetchWebSearchResults(query: string, apiKey: string): Promise<string | null> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;

  if (isDev()) {
    logger.debug('Web search request (Brave)', { url, query });
  }

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    if (isDev()) {
      logger.debug('Web search failed', { status: res.status, body: errBody.slice(0, 500) });
    }
    return null;
  }

  const data = await res.json() as {
    web?: { results: Array<{ title: string; url: string; description: string }> };
  };
  const results = data.web?.results;

  if (isDev()) {
    logger.debug('Web search results', {
      resultCount: results?.length ?? 0,
      results: results?.map(r => ({ title: r.title, url: r.url })) ?? [],
    });
  }

  if (!results || results.length === 0) return null;

  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.description}`)
    .join('\n\n');
}

export function buildMessages(
  prompt: string,
  length: AiLength,
  documentContext?: string,
  cursorContext?: string,
): Array<{ role: string; content: string }> {
  const systemContent = `${SYSTEM_PROMPT}\n\n${LENGTH_GUIDANCE[length]}`;

  let userContent = '';

  if (documentContext) {
    let context = documentContext;
    let truncated = false;
    if (context.length > MAX_CONTEXT_LENGTH) {
      // Truncate around cursor position if possible
      const markerIndex = context.indexOf('[INSERT HERE]');
      if (markerIndex >= 0) {
        const half = Math.floor(MAX_CONTEXT_LENGTH / 2);
        const start = Math.max(0, markerIndex - half);
        const end = Math.min(context.length, markerIndex + half);
        context = context.slice(start, end);
      } else {
        context = context.slice(0, MAX_CONTEXT_LENGTH);
      }
      truncated = true;
    }

    userContent += `Here is the existing document content for context. The marker [INSERT HERE] indicates where the new content will be inserted. Generate content that fits naturally at that position.\n`;
    if (truncated) {
      userContent += `Note: The document has been truncated for length.\n`;
    }
    userContent += `\n---\n<document>\n${context}\n</document>\n---\n\n`;
  }

  userContent += `User's request: ${prompt}`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

export async function* streamGeneration(
  prompt: string,
  length: AiLength,
  documentContext?: string,
  cursorContext?: string,
  webSearch?: boolean,
): AsyncGenerator<{ type: 'token'; content: string } | { type: 'done' } | { type: 'error'; message: string }> {
  const endpoint = getEndpoint();
  const apiKey = getApiKey();
  const model = getModel();

  if (!endpoint || !apiKey) {
    yield { type: 'error', message: 'AI service is not configured' };
    return;
  }

  if (isDev()) {
    logger.debug('AI generation started', { prompt: prompt.slice(0, 200), length, model, webSearch: !!webSearch });
  }

  const messages = buildMessages(prompt, length, documentContext, cursorContext);
  const maxTokens = MAX_TOKENS[length];

  // If web search is enabled, fetch search results and inject into messages
  const webSearchKey = getWebSearchKey();
  if (webSearch && webSearchKey) {
    try {
      const searchResults = await fetchWebSearchResults(prompt, webSearchKey);
      if (searchResults) {
        // Inject web results as a system message before the user prompt
        messages.splice(1, 0, {
          role: 'system',
          content: `The following web search results may help you provide accurate, up-to-date information. Use them if relevant, and cite sources where appropriate using [Source Title](URL) format.\n\n${searchResults}`,
        });
        if (isDev()) {
          logger.debug('Web search results injected into messages', { charCount: searchResults.length });
        }
      } else if (isDev()) {
        logger.debug('Web search returned no results');
      }
    } catch (err: any) {
      if (isDev()) {
        logger.debug('Web search failed (continuing without)', { error: err?.message });
      }
    }
  } else if (webSearch && !webSearchKey && isDev()) {
    logger.debug('Web search requested but BRAVE_SEARCH_API_KEY not set');
  }

  const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${model}/chat/completions?api-version=2024-10-21`;

  const body = {
    messages,
    max_tokens: maxTokens,
    temperature: 0.7,
    stream: true,
  };

  if (isDev()) {
    logger.debug('Azure OpenAI request', {
      url,
      messageCount: messages.length,
      messageRoles: messages.map(m => m.role),
      max_tokens: maxTokens,
    });
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      if (isDev()) {
        logger.debug('Azure OpenAI error response', { status: response.status, body: errBody.slice(0, 500) });
      }
      yield { type: 'error', message: `AI service returned status ${response.status}: ${errBody.slice(0, 200)}` };
      return;
    }

    if (isDev()) {
      logger.debug('Azure OpenAI streaming started', { status: response.status });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', message: 'Streaming not supported' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let tokenCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          if (isDev()) {
            logger.debug('Azure OpenAI stream complete', { tokenCount });
          }
          yield { type: 'done' };
          return;
        }
        if (!data) continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            tokenCount++;
            yield { type: 'token', content: delta };
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }

    if (isDev()) {
      logger.debug('Azure OpenAI stream ended (no DONE event)', { tokenCount });
    }
    yield { type: 'done' };
  } catch (err: any) {
    const message = err?.message || 'AI service error';
    yield { type: 'error', message };
  }
}

// --- Quota management ---

function quotaKey(userId: string): string {
  return `ai:quota:${userId}`;
}

export async function checkQuota(userId: string): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  // Check if unlimited flag is enabled for this user
  const unlimited = await isFeatureEnabled('ai_unlimited_generations', userId);
  const limit = getDailyLimit();

  if (unlimited) {
    return { allowed: true, remaining: limit, limit };
  }

  const current = await redis.get(quotaKey(userId));
  const used = current ? parseInt(current, 10) : 0;
  const remaining = Math.max(0, limit - used);

  return { allowed: remaining > 0, remaining, limit };
}

export async function incrementQuota(userId: string): Promise<void> {
  const key = quotaKey(userId);
  const exists = await redis.exists(key);
  await redis.incr(key);
  if (!exists) {
    // Set 24-hour TTL on first use
    await redis.expire(key, 24 * 60 * 60);
  }
}

// --- Demo quota management ---

const DEMO_QUOTA_TTL = 30 * 24 * 60 * 60; // 30 days

function demoQuotaKey(token: string): string {
  return `ai:demo:${token}`;
}

export async function checkDemoQuota(token: string): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const limit = getDemoLimit();
  const current = await redis.get(demoQuotaKey(token));
  const used = current ? parseInt(current, 10) : 0;
  const remaining = Math.max(0, limit - used);
  return { allowed: remaining > 0, remaining, limit };
}

export async function incrementDemoQuota(token: string): Promise<void> {
  const key = demoQuotaKey(token);
  const exists = await redis.exists(key);
  await redis.incr(key);
  if (!exists) {
    await redis.expire(key, DEMO_QUOTA_TTL);
  }
}

// Re-export for testing
export { SYSTEM_PROMPT, MAX_TOKENS, LENGTH_GUIDANCE, MAX_CONTEXT_LENGTH };
