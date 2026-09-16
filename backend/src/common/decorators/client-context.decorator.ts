import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** The client fingerprint recorded on every audit row. */
export interface ClientContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Injects the caller's IP and user agent.
 *
 * A parameter decorator rather than a service call so audit-writing handlers
 * never reach for `@Req()` — the request object itself stays out of the
 * controller, which is what keeps the services underneath framework-free.
 */
export const Client = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ClientContext => {
    const request = context.switchToHttp().getRequest<Request>();
    return {
      ipAddress: request.ip ?? null,
      userAgent: request.get('user-agent')?.slice(0, 512) ?? null,
    };
  },
);
