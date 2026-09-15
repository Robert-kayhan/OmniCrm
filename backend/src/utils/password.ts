import bcrypt from 'bcryptjs';
import { isTest } from '../config/env';

/**
 * bcrypt via `bcryptjs`: pure JavaScript, so there is no native toolchain to
 * install on Windows or in the Alpine image. Cost 12 is ~250ms on commodity
 * hardware; tests drop to 4 so the suite is not dominated by KDF time.
 *
 * Swapping in argon2id later means changing this file only — nothing else
 * imports a hashing library.
 */
const SALT_ROUNDS = isTest ? 4 : 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}

/**
 * A real hash at the production cost, computed once. Comparing against it burns
 * the same time as verifying a genuine password.
 */
let decoyHash: Promise<string> | null = null;

/**
 * Called when the email is unknown, so a login attempt against a non-existent
 * account takes as long as one against a real account and response timing does
 * not disclose which emails are registered.
 */
export async function fakeVerify(): Promise<void> {
  decoyHash ??= bcrypt.hash('a-password-that-is-never-valid', SALT_ROUNDS);
  await bcrypt.compare('incorrect-password', await decoyHash);
}
