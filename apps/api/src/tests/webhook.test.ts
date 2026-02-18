import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyWebhookSignature } from '../routes/webhooks.js';

const SECRET = 'test-webhook-secret-12345';

function sign(payload: string, secret = SECRET): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
}

describe('verifyWebhookSignature', () => {
  const payload = JSON.stringify({ action: 'created', installation: { id: 1 } });

  it('accepts a valid signature', () => {
    expect(verifyWebhookSignature(payload, sign(payload), SECRET)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyWebhookSignature(payload, 'sha256=bad', SECRET)).toBe(false);
  });

  it('rejects when signature is undefined', () => {
    expect(verifyWebhookSignature(payload, undefined, SECRET)).toBe(false);
  });

  it('rejects when secret is undefined', () => {
    expect(verifyWebhookSignature(payload, sign(payload), undefined)).toBe(false);
  });

  it('rejects a signature with wrong secret', () => {
    const wrongSig = sign(payload, 'wrong-secret');
    expect(verifyWebhookSignature(payload, wrongSig, SECRET)).toBe(false);
  });

  it('rejects a signature for different payload', () => {
    const otherPayload = JSON.stringify({ action: 'deleted' });
    const sig = sign(otherPayload);
    expect(verifyWebhookSignature(payload, sig, SECRET)).toBe(false);
  });

  it('handles empty payload', () => {
    expect(verifyWebhookSignature('', sign(''), SECRET)).toBe(true);
  });

  it('rejects mismatched length signatures gracefully', () => {
    expect(verifyWebhookSignature(payload, 'sha256=short', SECRET)).toBe(false);
  });
});
