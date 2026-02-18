import { logger } from './logger.js';

interface CircuitBreakerOptions {
  failureThreshold?: number;  // Failures before opening (default: 5)
  windowMs?: number;          // Time window for counting failures (default: 60s)
  cooldownMs?: number;        // Time in open state before half-open probe (default: 30s)
}

type State = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker per provider to prevent cascading failures.
 * 
 * States:
 * - closed: normal operation, requests pass through
 * - open: all requests fail immediately with 503
 * - half-open: one probe request allowed; success → closed, failure → open
 */
export class CircuitBreaker {
  private state: State = 'closed';
  private failures: number[] = []; // timestamps of recent failures
  private lastFailure = 0;
  private readonly provider: string;
  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;

  constructor(provider: string, opts: CircuitBreakerOptions = {}) {
    this.provider = provider;
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.windowMs = opts.windowMs ?? 60_000;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
  }

  /** Check if a request should be allowed through. */
  isOpen(): boolean {
    if (this.state === 'closed') return false;

    if (this.state === 'open') {
      // Check if cooldown has elapsed → transition to half-open
      if (Date.now() - this.lastFailure >= this.cooldownMs) {
        this.state = 'half-open';
        logger.info('Circuit breaker half-open', { provider: this.provider });
        return false; // allow one probe
      }
      return true; // still open
    }

    // half-open: allow the probe request
    return false;
  }

  /** Record a successful request. */
  onSuccess(): void {
    if (this.state === 'half-open') {
      logger.info('Circuit breaker closed', { provider: this.provider });
    }
    this.state = 'closed';
    this.failures = [];
  }

  /** Record a failed request. */
  onFailure(): void {
    const now = Date.now();
    this.lastFailure = now;

    // Remove failures outside the window
    this.failures = this.failures.filter(t => now - t < this.windowMs);
    this.failures.push(now);

    if (this.state === 'half-open') {
      // Probe failed — back to open
      this.state = 'open';
      logger.warn('Circuit breaker re-opened (probe failed)', { provider: this.provider });
      return;
    }

    if (this.failures.length >= this.failureThreshold) {
      this.state = 'open';
      logger.warn('Circuit breaker opened', {
        provider: this.provider,
        failures: this.failures.length,
        threshold: this.failureThreshold,
      });
    }
  }

  getState(): State {
    return this.state;
  }
}

// Per-provider circuit breaker instances
const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(provider: string): CircuitBreaker {
  let cb = breakers.get(provider);
  if (!cb) {
    cb = new CircuitBreaker(provider);
    breakers.set(provider, cb);
  }
  return cb;
}
