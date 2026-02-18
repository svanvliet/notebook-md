/**
 * OAuth Provider Abstraction Layer
 *
 * Each provider implements this interface. The OAuth flow:
 * 1. Client calls GET /auth/oauth/:provider → redirects to provider
 * 2. Provider redirects back to /auth/oauth/:provider/callback
 * 3. Server exchanges code for tokens, fetches user profile
 * 4. Server creates/links account, issues session
 */

export interface OAuthUserProfile {
  providerId: string;       // Provider's unique user ID
  email: string | null;     // May be null for some providers
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string;
}

export interface OAuthProvider {
  /** Provider name (e.g., 'github', 'microsoft', 'google') */
  name: string;

  /** Build the authorization URL for the OAuth redirect */
  getAuthUrl(state: string, redirectUri: string): string;

  /** Exchange the authorization code for tokens */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;

  /** Fetch the user profile using the access token */
  getUserProfile(accessToken: string): Promise<OAuthUserProfile>;
}

/** Registry of configured OAuth providers */
const providers = new Map<string, OAuthProvider>();

export function registerProvider(provider: OAuthProvider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): OAuthProvider | undefined {
  return providers.get(name);
}

export function listProviders(): string[] {
  return Array.from(providers.keys());
}
