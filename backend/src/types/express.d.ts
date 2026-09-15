import type { AuthContext } from './auth';

declare global {
  namespace Express {
    interface Request {
      // `id` (the correlation id) is declared by pino-http as `ReqId`; it is
      // always assigned a string by the requestContext middleware. Read it
      // through `requestId(req)` when a `string` is needed.
      /** Present only after `authenticate` has run. Use `getAuth(req)` to read it. */
      auth?: AuthContext;
      /**
       * Zod output. Express 5 makes `req.query` a getter, so validated values
       * are written here instead of back onto the request.
       */
      validated: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
      /** Raw request body, captured only on webhook routes for signature checks. */
      rawBody?: Buffer;
    }
  }
}

export {};
