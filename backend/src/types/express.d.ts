import type { AuthContext } from './auth';

declare global {
  namespace Express {
    interface Request {
      // `id` (the correlation id) is assigned by pino-http's genReqId, which
      // runs before any Nest middleware. It is always a string here.
      /**
       * The verified caller. Populated by JwtAuthGuard; read it in a handler
       * through the @CurrentUser() parameter decorator rather than off the
       * request, so a route that forgot to authenticate fails closed.
       */
      auth?: AuthContext;
      /** Raw request body, captured only on webhook routes for signature checks. */
      rawBody?: Buffer;
    }
  }
}

export {};
