import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeCreatedResponse,
  ApiEnvelopeResponse,
  ApiStandardErrors,
} from '../../common/decorators/api-docs.decorators';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  Client,
  type ClientContext,
} from '../../common/decorators/client-context.decorator';
import {
  CurrentUser,
  OptionalAuth,
  OptionalUser,
  Public,
} from '../../common/decorators/auth.decorators';
import { UnauthorizedError } from '../../common/errors/app.error';
import { THROTTLERS } from '../../common/throttler/throttler.constants';
import type { AuthContext } from '../../types/auth';
import { AuthCookieService } from './auth-cookie.service';
import { AuthService, type AuthResult } from './auth.service';
import {
  ChangePasswordDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
} from './dto/auth.dto';

/**
 * Credential endpoints.
 *
 * Every route here carries the tight `auth` throttle on top of the global one,
 * which is what blunts password spraying: a global budget sized for ordinary
 * API chatter is far too generous for a login form.
 */
@Throttle({ [THROTTLERS.AUTH]: {} })
@ApiTags('Auth')
@ApiStandardErrors()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}

  /**
   * The refresh token goes into an httpOnly cookie and is stripped from the JSON
   * body, so browser clients never hold it in JavaScript-reachable storage.
   */
  private session(response: Response, result: AuthResult) {
    this.cookies.set(response, result.tokens.refreshToken, result.tokens.refreshTokenExpiresAt);

    return {
      user: result.user,
      organization: result.organization,
      permissions: result.permissions,
      accessToken: result.tokens.accessToken,
      tokenType: result.tokens.tokenType,
      expiresIn: result.tokens.expiresIn,
    };
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new organization and its first administrator' })
  @ApiEnvelopeCreatedResponse()
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Client() client: ClientContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.session(response, await this.auth.register(dto, client));
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Exchange credentials for an access token' })
  @ApiEnvelopeResponse()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Client() client: ClientContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.session(response, await this.auth.login(dto, client));
  }

  /**
   * Deliberately public: the access token is expected to be expired by the time
   * a client calls this, so requiring one would make refresh unusable.
   */
  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate the refresh token for a new access token' })
  @ApiEnvelopeResponse()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Client() client: ClientContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = this.cookies.read(request, dto.refreshToken);

    if (!token) {
      throw new UnauthorizedError('No refresh token provided', 'REFRESH_TOKEN_MISSING');
    }

    try {
      return this.session(response, await this.auth.refresh(token, client));
    } catch (error) {
      // A rejected refresh always clears the cookie so the browser stops
      // replaying a token the server will never accept again.
      this.cookies.clear(response);
      throw error;
    }
  }

  /**
   * Optional auth so logging out still clears the cookie when the access token
   * has already expired.
   */
  @OptionalAuth()
  @Post('logout')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Revoke the current session, or every session',
    description:
      'Accepts a token but does not require one, so logging out still clears ' +
      'the refresh cookie after the access token has expired.',
  })
  @ApiEnvelopeResponse()
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: LogoutDto,
    @OptionalUser() auth: AuthContext | undefined,
    @Client() client: ClientContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = this.cookies.read(request, dto.refreshToken);

    await this.auth.logout({
      token,
      userId: auth?.userId,
      allDevices: dto.allDevices,
    });

    if (auth) {
      await this.auth.recordLogout(auth, client);
    }

    this.cookies.clear(response);
    return { loggedOut: true };
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get the authenticated caller' })
  @ApiEnvelopeResponse()
  me(@CurrentUser() auth: AuthContext) {
    return this.auth.getCurrentUser(auth.userId);
  }

  @Post('change-password')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Change the caller’s password' })
  @ApiEnvelopeResponse()
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
    @Client() client: ClientContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.changePassword(auth.userId, dto, client);
    this.cookies.clear(response);
    return { passwordChanged: true };
  }
}
