import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { Observable, map } from 'rxjs';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';
import { MetaEnvelope, type SuccessBody } from '../http/api-response';

/**
 * Single place the success envelope is built.
 *
 * Controllers return domain data; every 2xx body on the API is
 * `{ success: true, data, meta? }`. Handlers marked @RawResponse, and 204s,
 * pass through untouched.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessBody<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessBody<T> | T> {
    if (context.getType() !== 'http') return next.handle();

    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) return next.handle();

    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((value) => {
        // 204 carries no body, and a handler that wrote to `res` itself has
        // already answered.
        if (response.statusCode === 204 || value === undefined) return value;

        if (value instanceof MetaEnvelope) {
          return { success: true, data: value.data as T, meta: value.meta };
        }
        return { success: true, data: value };
      }),
    );
  }
}
