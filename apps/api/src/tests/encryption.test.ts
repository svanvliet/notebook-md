import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt, encryptOptional, decryptOptional } from '../lib/encryption.js';

// Ensure ENCRYPTION_KEY is set for tests
beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32bytes!!!!';
});

describe('Encryption', () => {
  describe('encrypt / decrypt round-trip', () => {
    it('should encrypt and decrypt a string', () => {
      const plaintext = 'gho_abc123_my_secret_token';
      const encrypted = encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(':'); // iv:authTag:ciphertext format
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('should produce different ciphertexts for same input (random IV)', () => {
      const plaintext = 'same-token';
      const a = encrypt(plaintext);
      const b = encrypt(plaintext);
      expect(a).not.toBe(b); // different IVs
      expect(decrypt(a)).toBe(plaintext);
      expect(decrypt(b)).toBe(plaintext);
    });

    it('should handle empty string', () => {
      const encrypted = encrypt('');
      expect(decrypt(encrypted)).toBe('');
    });

    it('should handle unicode content', () => {
      const plaintext = 'tøken with ünïcödé 🔐';
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    });

    it('should handle very long tokens', () => {
      const plaintext = 'x'.repeat(10000);
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    });
  });

  describe('tamper detection', () => {
    it('should reject tampered ciphertext', () => {
      const encrypted = encrypt('secret');
      const parts = encrypted.split(':');
      // Flip a character in the ciphertext
      parts[2] = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'a' ? 'b' : 'a');
      expect(() => decrypt(parts.join(':'))).toThrow();
    });

    it('should reject tampered auth tag', () => {
      const encrypted = encrypt('secret');
      const parts = encrypted.split(':');
      parts[1] = '0'.repeat(parts[1].length);
      expect(() => decrypt(parts.join(':'))).toThrow();
    });

    it('should reject invalid format (missing parts)', () => {
      expect(() => decrypt('just-a-string')).toThrow('Invalid encrypted format');
    });

    it('should reject invalid format (too many parts)', () => {
      expect(() => decrypt('a:b:c:d')).toThrow();
    });
  });

  describe('encryptOptional / decryptOptional', () => {
    it('should return null for null input', () => {
      expect(encryptOptional(null)).toBeNull();
      expect(encryptOptional(undefined)).toBeNull();
      expect(decryptOptional(null)).toBeNull();
      expect(decryptOptional(undefined)).toBeNull();
    });

    it('should encrypt and decrypt non-null values', () => {
      const encrypted = encryptOptional('token123');
      expect(encrypted).not.toBeNull();
      expect(decryptOptional(encrypted)).toBe('token123');
    });

    it('should return raw value when decryption fails (plaintext fallback)', () => {
      // Simulates pre-encryption token stored as plaintext
      const result = decryptOptional('gho_plaintext_token_from_before_encryption');
      expect(result).toBe('gho_plaintext_token_from_before_encryption');
    });
  });
});
