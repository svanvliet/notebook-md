import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '../lib/circuit-breaker.js';

describe('Circuit Breaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker('test-provider', {
      failureThreshold: 3,
      windowMs: 1000,
      cooldownMs: 100,
    });
  });

  it('should start in closed state', () => {
    expect(cb.getState()).toBe('closed');
    expect(cb.isOpen()).toBe(false);
  });

  it('should stay closed below failure threshold', () => {
    cb.onFailure();
    cb.onFailure();
    expect(cb.getState()).toBe('closed');
    expect(cb.isOpen()).toBe(false);
  });

  it('should open after reaching failure threshold', () => {
    cb.onFailure();
    cb.onFailure();
    cb.onFailure();
    expect(cb.getState()).toBe('open');
    expect(cb.isOpen()).toBe(true);
  });

  it('should reset failure count on success', () => {
    cb.onFailure();
    cb.onFailure();
    cb.onSuccess();
    cb.onFailure();
    cb.onFailure();
    // Only 2 failures since last success — still closed
    expect(cb.getState()).toBe('closed');
  });

  it('should transition to half-open after cooldown', async () => {
    cb.onFailure();
    cb.onFailure();
    cb.onFailure();
    expect(cb.getState()).toBe('open');

    // Wait for cooldown
    await new Promise(r => setTimeout(r, 150));

    // isOpen() should transition to half-open and return false (allow probe)
    expect(cb.isOpen()).toBe(false);
    expect(cb.getState()).toBe('half-open');
  });

  it('should close on successful probe in half-open state', async () => {
    cb.onFailure();
    cb.onFailure();
    cb.onFailure();
    await new Promise(r => setTimeout(r, 150));
    cb.isOpen(); // triggers half-open

    cb.onSuccess();
    expect(cb.getState()).toBe('closed');
    expect(cb.isOpen()).toBe(false);
  });

  it('should re-open on failed probe in half-open state', async () => {
    cb.onFailure();
    cb.onFailure();
    cb.onFailure();
    await new Promise(r => setTimeout(r, 150));
    cb.isOpen(); // triggers half-open

    cb.onFailure();
    expect(cb.getState()).toBe('open');
    expect(cb.isOpen()).toBe(true);
  });

  it('should not count failures outside the time window', async () => {
    cb.onFailure();
    cb.onFailure();
    // Wait for window to expire
    await new Promise(r => setTimeout(r, 1100));
    cb.onFailure(); // only 1 failure in current window
    expect(cb.getState()).toBe('closed');
  });
});
