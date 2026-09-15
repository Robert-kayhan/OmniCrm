import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { authRateLimiter } from '../../middleware/rate-limit';
import { asyncHandler } from '../../utils/async-handler';
import * as controller from './auth.controller';
import {
  changePasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from './auth.schema';

export const authRouter = Router();

const credentialLimiter = authRateLimiter();

authRouter.post(
  '/register',
  credentialLimiter,
  validate({ body: registerSchema }),
  asyncHandler(controller.registerHandler),
);

authRouter.post(
  '/login',
  credentialLimiter,
  validate({ body: loginSchema }),
  asyncHandler(controller.loginHandler),
);

// Deliberately not behind `authenticate`: the access token is expected to be
// expired by the time a client calls this.
authRouter.post(
  '/refresh',
  credentialLimiter,
  validate({ body: refreshSchema }),
  asyncHandler(controller.refreshHandler),
);

// Optional auth so logging out still clears the cookie when the access token
// has already expired.
authRouter.post(
  '/logout',
  optionalAuthenticate,
  validate({ body: logoutSchema }),
  asyncHandler(controller.logoutHandler),
);

authRouter.get('/me', authenticate, asyncHandler(controller.meHandler));

authRouter.post(
  '/change-password',
  authenticate,
  credentialLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(controller.changePasswordHandler),
);
