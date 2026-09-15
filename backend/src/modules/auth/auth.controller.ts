import type { Request, Response } from 'express';
import { getAuth } from '../../middleware/authenticate';
import { body } from '../../middleware/validate';
import { sendSuccess } from '../../utils/response';
import { UnauthorizedError } from '../../utils/errors';
import { auditContextFromRequest, recordAudit } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import * as authService from './auth.service';
import { clearRefreshCookie, readRefreshToken, setRefreshCookie } from './auth.cookies';
import type {
  ChangePasswordInput,
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
} from './auth.schema';

function clientContext(req: Request): authService.ClientContext {
  return auditContextFromRequest(req);
}

/**
 * The refresh token goes into an httpOnly cookie and is stripped from the JSON
 * body, so browser clients never hold it in JavaScript-reachable storage.
 */
function respondWithSession(res: Response, result: authService.AuthResult, statusCode = 200) {
  setRefreshCookie(res, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt);

  return sendSuccess(
    res,
    {
      user: result.user,
      organization: result.organization,
      permissions: result.permissions,
      accessToken: result.tokens.accessToken,
      tokenType: result.tokens.tokenType,
      expiresIn: result.tokens.expiresIn,
    },
    statusCode,
  );
}

export async function registerHandler(req: Request, res: Response) {
  const result = await authService.register(body<RegisterInput>(req), clientContext(req));
  return respondWithSession(res, result, 201);
}

export async function loginHandler(req: Request, res: Response) {
  const result = await authService.login(body<LoginInput>(req), clientContext(req));
  return respondWithSession(res, result);
}

export async function refreshHandler(req: Request, res: Response) {
  const input = body<RefreshInput>(req);
  const token = readRefreshToken(req, input.refreshToken);

  if (!token) {
    throw new UnauthorizedError('No refresh token provided', 'REFRESH_TOKEN_MISSING');
  }

  try {
    const result = await authService.refresh(token, clientContext(req));
    return respondWithSession(res, result);
  } catch (error) {
    // A rejected refresh always clears the cookie so the browser stops
    // replaying a token the server will never accept again.
    clearRefreshCookie(res);
    throw error;
  }
}

export async function logoutHandler(req: Request, res: Response) {
  const input = body<LogoutInput>(req);
  const token = readRefreshToken(req, input.refreshToken);

  await authService.logout({
    token,
    userId: req.auth?.userId,
    allDevices: input.allDevices,
  });

  if (req.auth) {
    await recordAudit({
      organizationId: req.auth.organizationId,
      userId: req.auth.userId,
      action: AUDIT_ACTIONS.AUTH_LOGOUT,
      entityType: AUDIT_ENTITIES.SESSION,
      entityId: req.auth.userId,
      ...clientContext(req),
    });
  }

  clearRefreshCookie(res);
  return sendSuccess(res, { loggedOut: true });
}

export async function meHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  const user = await authService.getCurrentUser(auth.userId);
  return sendSuccess(res, user);
}

export async function changePasswordHandler(req: Request, res: Response) {
  const auth = getAuth(req);
  await authService.changePassword(auth.userId, body<ChangePasswordInput>(req), clientContext(req));
  clearRefreshCookie(res);
  return sendSuccess(res, { passwordChanged: true });
}

