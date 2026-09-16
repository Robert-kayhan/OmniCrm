import { CanActivate, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { NotFoundError } from '../../common/errors/app.error';

/**
 * The first of two independent gates on the simulation endpoints.
 *
 * It answers 404 rather than 403 when the feature is off, so a production
 * deployment does not advertise that these routes exist. The second gate is the
 * DEV_TOOLS permission on the controller; environment validation separately
 * forces ENABLE_DEV_TOOLS to false whenever NODE_ENV=production.
 */
@Injectable()
export class DevToolsGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(): boolean {
    if (!this.config.devToolsEnabled) {
      throw new NotFoundError('Route', 'NOT_FOUND');
    }
    return true;
  }
}
