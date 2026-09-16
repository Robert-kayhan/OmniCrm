import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthContextService } from '../auth/auth-context.service';
import {
  IS_OPTIONAL_AUTH_KEY,
  IS_PUBLIC_KEY,
} from '../decorators/auth.decorators';
import { UnauthorizedError } from '../errors/app.error';

function extractBearerToken(request: Request): string | null {
  const header = request.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/**
 * Authenticates every HTTP request unless the handler opts out.
 *
 * Registered globally in AppModule, which inverts the old Express arrangement
 * where each router remembered to mount `authenticate`. Here a route is
 * protected by default and has to be marked @Public to escape.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authContext: AuthContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Socket authentication happens once at handshake time in the gateway, not
    // per message.
    if (context.getType() !== 'http') return true;

    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    if (isPublic) return true;

    const isOptional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, targets);
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);

    if (!token) {
      if (isOptional) return true;
      throw new UnauthorizedError('Missing bearer token', 'TOKEN_MISSING');
    }

    try {
      request.auth = await this.authContext.fromToken(token);
    } catch (error) {
      if (isOptional) return true;
      throw error;
    }

    return true;
  }
}
