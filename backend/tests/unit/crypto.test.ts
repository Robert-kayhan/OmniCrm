import { describe, expect, it } from 'vitest';
import { CryptoService } from '../../src/common/crypto/crypto.service';
import { AppConfigService } from '../../src/config/app-config.service';

/**
 * Constructed directly rather than through the container: CryptoService takes
 * only configuration, and booting Nest to exercise a pure function would make
 * the unit suite depend on a database.
 */
const crypto = new CryptoService(new AppConfigService());

describe('provider token encryption', () => {
  it('round-trips a token', () => {
    const token = 'EAAG1234567890abcdefghijklmnop';
    expect(crypto.decryptSecret(crypto.encryptSecret(token))).toBe(token);
  });

  it('produces different ciphertext each time', () => {
    const token = 'the-same-token';
    // A fresh nonce per encryption, so identical tokens do not look identical
    // in the database.
    expect(crypto.encryptSecret(token)).not.toBe(crypto.encryptSecret(token));
  });

  it('never leaks the plaintext into the ciphertext', () => {
    const token = 'super-secret-page-token';
    expect(crypto.encryptSecret(token)).not.toContain(token);
  });

  it('rejects a tampered payload', () => {
    const encrypted = crypto.encryptSecret('sensitive');
    const parts = encrypted.split(':');
    const tampered = [parts[0], parts[1], parts[2], 'Zm9yZ2Vk'].join(':');
    // GCM authentication fails rather than returning garbage.
    expect(() => crypto.decryptSecret(tampered)).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => crypto.decryptSecret('not-encrypted')).toThrow('Malformed encrypted payload');
    expect(() => crypto.decryptSecret('v2:a:b:c')).toThrow('Malformed encrypted payload');
  });

  it('passes null through unchanged', () => {
    expect(crypto.encryptOptionalSecret(null)).toBeNull();
    expect(crypto.encryptOptionalSecret('')).toBeNull();
    expect(crypto.decryptOptionalSecret(null)).toBeNull();
  });
});

describe('safeEqual', () => {
  it('compares equal and unequal values', () => {
    expect(crypto.safeEqual('token-value', 'token-value')).toBe(true);
    expect(crypto.safeEqual('token-value', 'other-value')).toBe(false);
  });

  it('handles differing lengths without throwing', () => {
    expect(crypto.safeEqual('short', 'a-much-longer-value')).toBe(false);
  });
});
