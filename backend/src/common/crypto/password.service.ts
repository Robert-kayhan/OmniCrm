import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AppConfigService } from '../../config/app-config.service';

/**
 * bcrypt via `bcryptjs`: pure JavaScript, so there is no native toolchain to
 * install on Windows or in the Alpine image. Cost 12 is ~250ms on commodity
 * hardware; tests drop to 4 so the suite is not dominated by KDF time.
 *
 * Swapping in argon2id later means changing this file only — nothing else
 * injects a hashing library.
 */
@Injectable()
export class PasswordService {
  private readonly saltRounds: number;
  /**
   * A real hash at the configured cost, computed once. Comparing against it
   * burns the same time as verifying a genuine password.
   */
  private decoyHash: Promise<string> | null = null;

  constructor(config: AppConfigService) {
    this.saltRounds = config.isTest ? 4 : 12;
  }

  async hash(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, this.saltRounds);
  }

  async verify(plaintext: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plaintext, hash);
    } catch {
      return false;
    }
  }

  /**
   * Called when the email is unknown, so a login attempt against a non-existent
   * account takes as long as one against a real account and response timing does
   * not disclose which emails are registered.
   */
  async fakeVerify(): Promise<void> {
    this.decoyHash ??= bcrypt.hash('a-password-that-is-never-valid', this.saltRounds);
    await bcrypt.compare('incorrect-password', await this.decoyHash);
  }
}
