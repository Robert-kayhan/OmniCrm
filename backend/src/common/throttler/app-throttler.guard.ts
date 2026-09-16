import { ExecutionContext, Injectable } from '@nestjs/common';
import {
  ThrottlerException,
  ThrottlerGuard,
  type ThrottlerRequest,
} from '@nestjs/throttler';
import type { Request } from 'express';
import { TooManyRequestsError } from '../errors/app.error';
import { THROTTLERS, THROTTLER_MESSAGES } from './throttler.constants';

/**
 * The project's throttling policy on top of Nest's guard.
 *
 * Two deviations from the stock behaviour, both of them things the Express
 * limiters did before: outbound messages are counted per user rather than per
 * IP, and a breach raises the API's own error shape so clients keep branching
 * on `code` rather than on a framework message. Skipping under test is
 * configured as `skipIf` on the module instead of here.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    // Socket traffic is not routed through this guard.
    if (context.getType() !== 'http') return true;
    return super.shouldSkip(context);
  }

  protected override async getTracker(request: Record<string, unknown>): Promise<string> {
    const req = request as unknown as Request;
    return req.ip ?? 'unknown';
  }

  /**
   * Which bucket a request is counted into.
   *
   * Two deviations from the library's default, which keys every bucket by
   * controller *and* handler:
   *
   *   - the baseline budget is one shared allowance across the whole API, as
   *     the Express limiter it replaces was. Keyed per handler it would let a
   *     client spend the full budget again on every endpoint it can reach.
   *   - the message budget is per authenticated user: it exists to stop one
   *     agent from burning through a paid provider quota, and several agents
   *     behind one office NAT must not share a single allowance.
   */
  protected override generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    if (name === THROTTLERS.GLOBAL) {
      return `throttle:${name}:${suffix}`;
    }
    if (name === THROTTLERS.MESSAGE) {
      const userId = context.switchToHttp().getRequest<Request>().auth?.userId;
      if (userId) return `throttle:${name}:user:${userId}`;
    }
    return super.generateKey(context, suffix, name);
  }

  /**
   * Which named budget was exhausted is only known here — `ThrottlerLimitDetail`
   * does not carry the throttler name, and the key it does carry is hashed. So
   * the breach is caught at the one point that still has `throttler.name` and
   * re-thrown with the matching code.
   */
  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    try {
      return await super.handleRequest(requestProps);
    } catch (error) {
      if (!(error instanceof ThrottlerException)) throw error;

      const name = requestProps.throttler.name ?? THROTTLERS.GLOBAL;
      const mapped = THROTTLER_MESSAGES[name] ?? THROTTLER_MESSAGES[THROTTLERS.GLOBAL]!;
      throw new TooManyRequestsError(mapped.message, mapped.code);
    }
  }
}
