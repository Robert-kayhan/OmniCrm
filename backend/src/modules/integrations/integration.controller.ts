import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeCreatedResponse,
  ApiEnvelopeResponse,
  ApiStandardErrors,
} from '../../common/decorators/api-docs.decorators';
import type { Response } from 'express';
import { ChannelRegistryService } from '../../channels/channel-registry.service';
import { PERMISSIONS } from '../../config/permissions';
import { AppConfigService } from '../../config/app-config.service';
import {
  CurrentUser,
  Public,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import {
  Client,
  type ClientContext,
} from '../../common/decorators/client-context.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { IdParamDto } from '../../common/dto/id-param.dto';
import { AppError } from '../../common/errors/app.error';
import type { AuthContext } from '../../types/auth';
import {
  ConnectFacebookDto,
  ConnectFacebookPageDto,
  FacebookOAuthCallbackQueryDto,
  FacebookOAuthPagesQueryDto,
  ListIntegrationsQueryDto,
  UpdateIntegrationDto,
} from './dto/integration.dto';
import { IntegrationService } from './integration.service';
import { MetaOAuthService } from './meta-oauth.service';

@ApiTags('Integrations')
@ApiBearerAuth('bearer')
@ApiStandardErrors()
@Controller('integrations')
export class IntegrationController {
  private readonly logger = new Logger(IntegrationController.name);

  constructor(
    private readonly integrations: IntegrationService,
    private readonly oauth: MetaOAuthService,
    private readonly channels: ChannelRegistryService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Meta's redirect target.
   *
   * Declared first and marked @Public by necessity: the browser arrives from
   * facebook.com with no bearer token, and the signed `state` is what
   * establishes the operator. It always answers with a redirect back into the
   * app — never JSON — because a person is looking at this response, and it
   * never puts a token in the URL.
   */
  @Public()
  @RawResponse()
  @Get('facebook/oauth/callback')
  @ApiOperation({
    summary: 'Meta OAuth redirect target',
    description:
      "Meta sends the operator's browser here. Not called by API clients, and " +
      'never returns JSON — it always redirects back into the frontend, ' +
      'carrying either `fb_handoff` or `fb_error` as a query parameter.',
  })
  @ApiFoundResponse({
    description: 'Redirect to the frontend integrations settings page.',
  })
  async facebookOAuthCallback(
    @Query() callback: FacebookOAuthCallbackQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    // The operator pressed Cancel in Meta's dialog.
    if (callback.error || !callback.code) {
      const reason =
        callback.error_description ?? callback.error ?? 'The Facebook login was cancelled.';
      response.redirect(this.settingsUrl({ fb_error: reason }));
      return;
    }

    try {
      const result = await this.oauth.completeFacebookLogin(callback.code, callback.state);
      response.redirect(this.settingsUrl({ fb_handoff: result.handoffId }));
    } catch (error) {
      // A thrown error here would render the API's JSON error page in the
      // operator's browser, stranding them outside the app.
      const message =
        error instanceof AppError
          ? error.message
          : 'Could not complete the Facebook login. Please try again.';
      this.logger.warn({ err: error }, 'Facebook OAuth callback failed');
      response.redirect(this.settingsUrl({ fb_error: message }));
    }
  }

  /** Where the settings page lives, for every redirect out of the callback. */
  private settingsUrl(params: Record<string, string>): string {
    const url = new URL('/settings/integrations', this.config.frontendUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
  }

  @Get()
  @ApiOperation({ summary: 'List connected integrations' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  list(@CurrentUser() auth: AuthContext, @Query() query: ListIntegrationsQueryDto) {
    return this.integrations.list(auth.organizationId, query);
  }

  /** Powers the integrations settings screen, including not-yet-built channels. */
  @Get('catalogue')
  @ApiOperation({ summary: 'List every channel and its availability' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  catalogue(@CurrentUser() auth: AuthContext) {
    return this.integrations.getChannelCatalogue(auth.organizationId);
  }

  /**
   * Hands the browser the Meta login URL.
   *
   * Returns the URL rather than issuing a 302 so the frontend can open it in a
   * popup and keep the settings page mounted behind it.
   *
   * This and the Page picker sit above `:id` so "facebook" is never parsed as
   * an integration id.
   */
  @Get('facebook/oauth/start')
  @ApiOperation({ summary: 'Begin the Meta login' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  startFacebookOAuth(@CurrentUser() auth: AuthContext) {
    return this.oauth.startFacebookLogin(auth);
  }

  /** The Pages behind a completed login, re-read after the redirect. */
  @Get('facebook/oauth/pages')
  @ApiOperation({ summary: 'List the Pages a completed login returned' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  facebookOAuthPages(
    @CurrentUser() auth: AuthContext,
    @Query() query: FacebookOAuthPagesQueryDto,
  ) {
    return this.oauth.listHandoffPages(auth, query.handoffId);
  }

  /** Connects the inbox the operator picked and reports what the import found. */
  @Post('facebook/pages')
  @ApiOperation({ summary: 'Connect the chosen Page or Instagram inbox' })
  @ApiEnvelopeCreatedResponse()
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  connectFacebookPage(
    @CurrentUser() auth: AuthContext,
    @Body() dto: ConnectFacebookPageDto,
    @Client() client: ClientContext,
  ) {
    return this.oauth.connectPageFromHandoff(
      auth,
      dto.handoffId,
      dto.pageId,
      dto.name,
      client,
      this.channels.channelForIntegrationType(dto.channel),
    );
  }

  /** The manual paste-a-token route for Facebook. */
  @Post('facebook')
  @ApiOperation({ summary: 'Connect a Facebook Page with a pasted token' })
  @ApiEnvelopeCreatedResponse()
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  connectFacebook(
    @CurrentUser() auth: AuthContext,
    @Body() dto: ConnectFacebookDto,
    @Client() client: ClientContext,
  ) {
    return this.integrations.connectFacebook(auth, dto, client);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an integration' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  get(@CurrentUser() auth: AuthContext, @Param() { id }: IdParamDto) {
    return this.integrations.getById(auth.organizationId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename an integration or change its status' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  update(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateIntegrationDto,
    @Client() client: ClientContext,
  ) {
    return this.integrations.update(auth, id, dto, client);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Disconnect an integration and destroy its token' })
  @ApiEnvelopeResponse()
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  disconnect(
    @CurrentUser() auth: AuthContext,
    @Param() { id }: IdParamDto,
    @Client() client: ClientContext,
  ) {
    return this.integrations.disconnect(auth, id, client);
  }
}
