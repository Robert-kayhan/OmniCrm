import crypto from 'node:crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, the GCM standard
const AUTH_TAG_LENGTH = 16;
const VERSION = 'v1';

const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');

/**
 * Encrypts provider secrets (page access tokens, refresh tokens) before they
 * touch the database. Format: `v1:<iv>:<authTag>:<ciphertext>`, all base64url.
 * The version prefix leaves room to rotate the algorithm without a data migration.
 */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed encrypted payload');
  }
  const [, ivPart, tagPart, dataPart] = parts as [string, string, string, string];
  const iv = Buffer.from(ivPart, 'base64url');
  const authTag = Buffer.from(tagPart, 'base64url');
  const ciphertext = Buffer.from(dataPart, 'base64url');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function encryptOptionalSecret(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  return encryptSecret(plaintext);
}

export function decryptOptionalSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  return decryptSecret(payload);
}

/** SHA-256, hex encoded. Used for refresh-token lookups — not for passwords. */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Constant-time comparison that tolerates differing lengths. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    // Still burn a comparison so length is the only thing timing can reveal.
    crypto.timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

export function randomToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}
