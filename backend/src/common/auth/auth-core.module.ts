import { Global, Module } from '@nestjs/common';
import { AuthContextService } from './auth-context.service';
import { TokenService } from './token.service';

/**
 * Token verification and caller resolution, separated from the auth feature
 * module that owns login and registration.
 *
 * It is global because the pieces that need it are not feature code: the
 * globally-registered JwtAuthGuard and the Socket.IO gateway both resolve a
 * caller, and neither should have to import the module that happens to own
 * `POST /auth/login`. Keeping them apart also avoids a cycle, since AuthModule
 * itself depends on TokenService.
 */
@Global()
@Module({
  providers: [TokenService, AuthContextService],
  exports: [TokenService, AuthContextService],
})
export class AuthCoreModule {}
