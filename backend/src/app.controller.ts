import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
} from './common/decorators/api-docs.decorators';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './common/decorators/auth.decorators';

/**
 * The service banner at `/api`.
 *
 * It exists so that hitting the API root tells you what is running and where
 * the health endpoint is. It sits inside the global prefix rather than at `/`
 * on purpose: excluding a path from the prefix also collapses the path list
 * Nest registers middleware against, which silently stopped the request logger
 * — and with it every correlation id — from matching anything under `/api`.
 */
@Public()
@SkipThrottle()
@ApiTags('Service')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'Service banner' })
  @ApiEnvelopeResponse()
  banner() {
    return { service: 'omni-crm-api', version: '0.1.0', docs: '/api/health' };
  }
}
