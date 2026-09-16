import crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { MetaManagedPage } from '../../channels/meta/meta.oauth';
import { CryptoService } from '../../common/crypto/crypto.service';
import { UnauthorizedError } from '../../common/errors/app.error';
import { AppConfigService } from '../../config/app-config.service';
import { RedisService } from '../../database/redis.service';

/**
 * The two pieces of short-lived state the OAuth flow needs.
 *
 * `state` is stateless on purpose: it is an HMAC over the operator's identity
 * and an expiry, so the CSRF check survives a restart and needs no store at
 * all. Only the Page tokens between the callback and the operator's choice
 * need somewhere to live, and they live encrypted with a hard TTL.
 */

const STATE_TTL_MS = 10 * 60 * 1000;
const HANDOFF_TTL_SECONDS = 10 * 60;

interface StatePayload {
  organizationId: string;
  userId: string;
  nonce: string;
  expiresAt: number;
}

/**
 * What the callback holds on to while the operator picks a Page.
 *
 * Page tokens are encrypted with the same AES-256-GCM key that protects stored
 * integration tokens, so they are never at rest in plaintext even for these ten
 * minutes.
 */
export interface PendingHandoff {
  organizationId: string;
  userId: string;
  pages: MetaManagedPage[];
}

interface StoredHandoff {
  organizationId: string;
  userId: string;
  /** Page rows with `accessToken` replaced by its ciphertext. */
  pages: Array<Omit<MetaManagedPage, 'accessToken'> & { encryptedAccessToken: string }>;
}

@Injectable()
export class MetaOAuthStore {
  private readonly logger = new Logger(MetaOAuthStore.name);

  /**
   * The single-node fallback.
   *
   * Redis is optional in this codebase, so the flow degrades to process memory
   * with the same TTL. A multi-instance deployment needs REDIS_URL — production
   * env validation already requires it — because the callback and the page
   * selection can otherwise land on different instances.
   */
  private readonly memoryStore = new Map<string, { value: StoredHandoff; expiresAt: number }>();

  constructor(
    private readonly config: AppConfigService,
    private readonly crypto: CryptoService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Derived from JWT_SECRET rather than reusing it directly, so an OAuth state
   * can never be mistaken for — or forged from — a session token.
   */
  private stateKey(): Buffer {
    return crypto
      .createHmac('sha256', this.config.get('JWT_SECRET'))
      .update('facebook-oauth-state')
      .digest();
  }

  private sign(body: string): string {
    return crypto.createHmac('sha256', this.stateKey()).update(body).digest('base64url');
  }

  /** Packs the operator's identity into the opaque `state` Meta echoes back. */
  createState(organizationId: string, userId: string): string {
    const payload: StatePayload = {
      organizationId,
      userId,
      nonce: crypto.randomBytes(16).toString('base64url'),
      expiresAt: Date.now() + STATE_TTL_MS,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  /**
   * Verifies and unpacks a returned `state`.
   *
   * Throws rather than returning null: every failure here means the callback did
   * not originate from a login this server started, which is not a case any
   * caller should be able to shrug off.
   */
  readState(state: string | undefined): StatePayload {
    const invalid = new UnauthorizedError(
      'This Facebook login link is invalid or has expired. Start the connection again.',
      'FACEBOOK_OAUTH_STATE_INVALID',
    );

    if (!state) throw invalid;
    const [body, signature] = state.split('.');
    if (!body || !signature) throw invalid;
    if (!this.crypto.safeEqual(signature, this.sign(body))) throw invalid;

    let payload: StatePayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
    } catch {
      throw invalid;
    }

    if (!payload.organizationId || !payload.userId) throw invalid;
    if (typeof payload.expiresAt !== 'number' || payload.expiresAt < Date.now()) throw invalid;

    return payload;
  }

  private sweepMemory(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryStore) {
      if (entry.expiresAt <= now) this.memoryStore.delete(key);
    }
  }

  private redisKey(handoffId: string): string {
    return `facebook:oauth:handoff:${handoffId}`;
  }

  private redisClient() {
    return this.redis.enabled ? this.redis.getClient() : null;
  }

  private encode(handoff: PendingHandoff): StoredHandoff {
    return {
      organizationId: handoff.organizationId,
      userId: handoff.userId,
      pages: handoff.pages.map(({ accessToken, ...page }) => ({
        ...page,
        encryptedAccessToken: this.crypto.encryptSecret(accessToken),
      })),
    };
  }

  private decode(stored: StoredHandoff): PendingHandoff {
    return {
      organizationId: stored.organizationId,
      userId: stored.userId,
      pages: stored.pages.map(({ encryptedAccessToken, ...page }) => ({
        ...page,
        accessToken: this.crypto.decryptSecret(encryptedAccessToken),
      })),
    };
  }

  async saveHandoff(handoff: PendingHandoff): Promise<string> {
    const handoffId = crypto.randomBytes(24).toString('base64url');
    const stored = this.encode(handoff);

    const redis = this.redisClient();
    if (redis) {
      try {
        await redis.set(
          this.redisKey(handoffId),
          JSON.stringify(stored),
          'EX',
          HANDOFF_TTL_SECONDS,
        );
        return handoffId;
      } catch (error) {
        this.logger.warn(
          { err: error },
          'Redis unavailable for OAuth handoff; using process memory',
        );
      }
    }

    this.sweepMemory();
    this.memoryStore.set(handoffId, {
      value: stored,
      expiresAt: Date.now() + HANDOFF_TTL_SECONDS * 1000,
    });
    return handoffId;
  }

  async readHandoff(handoffId: string): Promise<PendingHandoff | null> {
    const redis = this.redisClient();
    if (redis) {
      try {
        const raw = await redis.get(this.redisKey(handoffId));
        if (raw) return this.decode(JSON.parse(raw) as StoredHandoff);
      } catch (error) {
        this.logger.warn(
          { err: error },
          'Redis read failed for OAuth handoff; falling back to memory',
        );
      }
    }

    this.sweepMemory();
    const entry = this.memoryStore.get(handoffId);
    if (!entry) return null;
    return this.decode(entry.value);
  }

  /** Called once a Page is connected — the remaining tokens have no further use. */
  async discardHandoff(handoffId: string): Promise<void> {
    const redis = this.redisClient();
    if (redis) {
      try {
        await redis.del(this.redisKey(handoffId));
      } catch (error) {
        this.logger.warn({ err: error }, 'Redis delete failed for OAuth handoff');
      }
    }
    this.memoryStore.delete(handoffId);
  }
}
