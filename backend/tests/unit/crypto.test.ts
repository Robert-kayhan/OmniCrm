import { describe, expect, it } from 'vitest';
import {
  decryptOptionalSecret,
  decryptSecret,
  encryptOptionalSecret,
  encryptSecret,
  safeEqual,
} from '../../src/utils/crypto';

describe('provider token encryption', () => {
  it('round-trips a token', () => {
    const token = 'EAAG1234567890abcdefghijklmnop';
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it('produces different ciphertext each time', () => {
    const token = 'the-same-token';
    // A fresh nonce per encryption, so identical tokens do not look identical
    // in the database.
    expect(encryptSecret(token)).not.toBe(encryptSecret(token));
  });

  it('never leaks the plaintext into the ciphertext', () => {
    const token = 'super-secret-page-token';
    expect(encryptSecret(token)).not.toContain(token);
  });

  it('rejects a tampered payload', () => {
    const encrypted = encryptSecret('sensitive');
    const parts = encrypted.split(':');
    const tampered = [parts[0], parts[1], parts[2], 'Zm9yZ2Vk'].join(':');
    // GCM authentication fails rather than returning garbage.
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => decryptSecret('not-encrypted')).toThrow('Malformed encrypted payload');
    expect(() => decryptSecret('v2:a:b:c')).toThrow('Malformed encrypted payload');
  });

  it('passes null through unchanged', () => {
    expect(encryptOptionalSecret(null)).toBeNull();
    expect(encryptOptionalSecret('')).toBeNull();
    expect(decryptOptionalSecret(null)).toBeNull();
  });
});

describe('safeEqual', () => {
  it('compares equal and unequal values', () => {
    expect(safeEqual('token-value', 'token-value')).toBe(true);
    expect(safeEqual('token-value', 'other-value')).toBe(false);
  });

  it('handles differing lengths without throwing', () => {
    expect(safeEqual('short', 'a-much-longer-value')).toBe(false);
  });
});
