import { registerProvider } from './types.js';
import { mockProvider } from './mock-provider.js';
import { createGitHubProvider } from './github.js';
import { createMicrosoftProvider } from './microsoft.js';
import { createGoogleProvider } from './google.js';
import { logger } from '../../lib/logger.js';

export function initializeOAuthProviders(): void {
  const registered: string[] = [];

  // Mock provider (dev only)
  if (process.env.NODE_ENV !== 'production') {
    registerProvider(mockProvider);
    registered.push('mock');
  }

  // GitHub
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    registerProvider(createGitHubProvider(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET));
    registered.push('github');
  }

  // Microsoft
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    registerProvider(
      createMicrosoftProvider(
        process.env.MICROSOFT_CLIENT_ID,
        process.env.MICROSOFT_CLIENT_SECRET,
        process.env.MICROSOFT_TENANT_ID ?? 'common',
      ),
    );
    registered.push('microsoft');
  }

  // Google
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    registerProvider(createGoogleProvider(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET));
    registered.push('google');
  }

  logger.info('OAuth providers initialized', { providers: registered });
}

export { getProvider, listProviders } from './types.js';
