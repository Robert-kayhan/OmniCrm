import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeCreatedResponse,
  ApiEnvelopeResponse,
  ApiStandardErrors,
} from '../../common/decorators/api-docs.decorators';
import { PERMISSIONS } from '../../config/permissions';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import type { AuthContext } from '../../types/auth';
import { DevToolsGuard } from './dev-tools.guard';
import { DevToolsService } from './dev-tools.service';
import { SeedSampleDataDto, SimulateInboundDto } from './dto/dev-tools.dto';

/** Simulation endpoints, isolated from production code behind two gates. */
@UseGuards(DevToolsGuard)
@RequirePermissions(PERMISSIONS.DEV_TOOLS)
@ApiTags('Dev tools')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('dev/simulate')
export class DevToolsController {
  constructor(private readonly devTools: DevToolsService) {}

  @Post('inbound-message')
  @ApiOperation({ summary: 'Simulate an inbound customer message' })
  @ApiEnvelopeCreatedResponse()
  @HttpCode(HttpStatus.CREATED)
  simulateInbound(@CurrentUser() auth: AuthContext, @Body() dto: SimulateInboundDto) {
    return this.devTools.simulateInboundMessage(auth, dto);
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed the inbox with sample conversations' })
  @ApiEnvelopeCreatedResponse()
  @HttpCode(HttpStatus.CREATED)
  seed(@CurrentUser() auth: AuthContext, @Body() dto: SeedSampleDataDto) {
    return this.devTools.seedSampleConversations(auth, dto);
  }

  @Post('reset')
  @ApiOperation({ summary: 'Delete everything the simulator created' })
  @ApiEnvelopeResponse()
  @HttpCode(HttpStatus.OK)
  reset(@CurrentUser() auth: AuthContext) {
    return this.devTools.resetSimulatedData(auth);
  }
}
