import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
} from '../common/decorators/api-docs.decorators';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { Public } from '../common/decorators/auth.decorators';
import { RawResponse } from '../common/decorators/raw-response.decorator';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../database/redis.service';

/**
 * Container probes. Public and unthrottled: an orchestrator polling readiness
 * must never be rate limited into reporting a healthy API as down.
 */
@Public()
@SkipThrottle()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  /** Liveness: answers as long as the process is up. */
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiEnvelopeResponse()
  live() {
    return { status: 'alive', uptime: process.uptime() };
  }

  /**
   * Readiness: reports dependency state and fails the request when the DB is
   * down.
   *
   * Written directly rather than through the response interceptor because this
   * is the one endpoint where `success` tracks something other than "the
   * request worked": a degraded probe still returns a full body describing
   * which dependency is broken, with `success: false` alongside it.
   */
  @Get()
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({
    status: 200,
    description: 'Every dependency the API needs is reachable.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'degraded'] },
            environment: { type: 'string', example: 'production' },
            uptime: { type: 'number', example: 4213 },
            dependencies: {
              type: 'object',
              properties: {
                database: { type: 'string', enum: ['ok', 'error'] },
                redis: { type: 'string', enum: ['ok', 'disabled', 'error'] },
              },
            },
            integrations: {
              type: 'object',
              properties: {
                facebook: { type: 'string', enum: ['configured', 'not_configured'] },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description:
      'The database is unreachable. The body is the same shape with ' +
      '`success: false` and `status: "degraded"`, so the failing dependency is ' +
      'named rather than guessed at.',
  })
  @RawResponse()
  async ready(@Res() response: Response): Promise<void> {
    const [database, redis] = await Promise.all([
      this.prisma.checkHealth(),
      this.redis.checkHealth(),
    ]);
    const healthy = database;

    response.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
      success: healthy,
      data: {
        status: healthy ? 'ok' : 'degraded',
        environment: this.config.nodeEnv,
        uptime: Math.round(process.uptime()),
        dependencies: {
          database: database ? 'ok' : 'error',
          redis,
        },
        integrations: {
          facebook: this.config.isMetaConfigured ? 'configured' : 'not_configured',
        },
      },
    });
  }
}
