import { Injectable, Logger } from '@nestjs/common';
import {
  buildAuthorizeUrl,
  exchangeCodeForUserToken,
  extendUserToken,
  listManagedPages,
  subscribePageToApp,
  type MetaManagedPage,
} from '../../channels/meta/meta.oauth';
import { ChannelRegistryService } from '../../channels/channel-registry.service';
import type { ClientContext } from '../../common/decorators/client-context.decorator';
import {
  BadRequestError,
  IntegrationConfigurationError,
} from '../../common/errors/app.error';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../database/prisma.service';
import { Channel, IntegrationStatus, IntegrationType } from '../../generated/prisma/enums';
import type { AuthContext } from '../../types/auth';
import { IntegrationService, type IntegrationDto } from './integration.service';
import { MetaImportService, type ImportSummary } from './meta-import.service';
import { MetaOAuthStore } from './meta-oauth.store';

/**
 * The "Connect Facebook" button, server side.
 *
 * Three calls, in the order the operator experiences them:
 *
 *   start    -> the URL to send the browser to
 *   complete -> the callback: code for tokens, then the Pages to choose from
 *   connect  -> subscribe the chosen Page, store it, import recent history
 *
 * Page access tokens never reach the browser. They live encrypted in the
 * handoff store between `complete` and `connect`, and encrypted in the
 * database after that.
 */

/** Whether a given inbox can be claimed by the workspace doing the login. */
interface Availability {
  /** Connected to a different workspace, so this operator cannot claim it. */
  unavailable: boolean;
  /** Already connected to *this* workspace. */
  connectedHere: boolean;
}

/**
 * The Instagram account linked to a Page, as the picker shows it.
 *
 * Availability is tracked separately from the Page's: the same login can offer
 * a Messenger inbox this workspace already owns next to an Instagram inbox it
 * does not, and the two are independent integration rows.
 */
export interface SelectableInstagram extends Availability {
  id: string;
  username: string | null;
  name: string | null;
  pictureUrl: string | null;
}

/** A Page as the picker shows it. Note the absence of any token field. */
export interface SelectablePage extends Availability {
  id: string;
  name: string;
  category: string | null;
  pictureUrl: string | null;
  /** Already delivering to this app's webhook. Reconnecting is still allowed. */
  alreadySubscribed: boolean;
  /** Null when no Professional Instagram account is linked to this Page. */
  instagram: SelectableInstagram | null;
}

export interface MetaLoginResult {
  handoffId: string;
  pages: SelectablePage[];
}

/** @deprecated Use {@link MetaLoginResult}; kept so callers need not churn. */
export type FacebookLoginResult = MetaLoginResult;

export interface ConnectPageResult {
  integration: IntegrationDto;
  import: ImportSummary;
}

@Injectable()
export class MetaOAuthService {
  private readonly logger = new Logger(MetaOAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly channels: ChannelRegistryService,
    private readonly store: MetaOAuthStore,
    private readonly integrations: IntegrationService,
    private readonly imports: MetaImportService,
  ) {}

  /**
   * Guards the whole flow.
   *
   * The provider's own check covers the webhook credentials; this adds the OAuth
   * pair, so a half-configured server names the exact missing variable instead of
   * failing at Meta's dialog.
   */
  private assertConnectable(): void {
    const provider = this.channels.get(this.channels.channelForIntegrationType(IntegrationType.FACEBOOK));
    if (!provider.isConfigured() || !this.config.get('META_APP_ID') || !this.config.get('META_APP_SECRET')) {
      throw new IntegrationConfigurationError(
        'Facebook is not configured on this server. Set META_APP_ID, META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN, then restart the API.',
        'FACEBOOK_NOT_CONFIGURED',
      );
    }
  }

  /** Step one: where to send the operator's browser. */
  startFacebookLogin(actor: AuthContext): { authorizeUrl: string } {
    this.assertConnectable();
    const state = this.store.createState(actor.organizationId, actor.userId);
    return { authorizeUrl: buildAuthorizeUrl(state) };
  }

  /**
   * Step two: Meta has sent the browser back with a code.
   *
   * Runs unauthenticated — the browser arrives from facebook.com with no bearer
   * token — so the signed `state` is the only thing establishing who this is.
   * It is verified before the code is spent.
   */
  async completeFacebookLogin(
    code: string,
    state: string | undefined,
  ): Promise<FacebookLoginResult & { organizationId: string; userId: string }> {
    this.assertConnectable();

    const identity = this.store.readState(state);

    const shortLived = await exchangeCodeForUserToken(code);
    const userToken = await extendUserToken(shortLived);
    const pages = await listManagedPages(userToken);

    if (pages.length === 0) {
      throw new BadRequestError(
        'That Facebook account does not administer any Pages. Create a Page, or log in with an account that manages one.',
        'FACEBOOK_NO_PAGES',
      );
    }

    const handoffId = await this.store.saveHandoff({
      organizationId: identity.organizationId,
      userId: identity.userId,
      pages,
    });

    return {
      organizationId: identity.organizationId,
      userId: identity.userId,
      handoffId,
      pages: await this.toSelectablePages(identity.organizationId, pages),
    };
  }

  /**
   * Re-reads the Pages behind a handoff.
   *
   * The callback runs in the browser's redirect and cannot return a body to the
   * app, so the frontend lands on the settings page and asks for the list again
   * over an authenticated request. Ownership is recomputed rather than cached,
   * because another workspace may have claimed a Page in between.
   */
  async listHandoffPages(
    actor: AuthContext,
    handoffId: string,
  ): Promise<FacebookLoginResult> {
    const handoff = await this.store.readHandoff(handoffId);
    if (!handoff || handoff.organizationId !== actor.organizationId) {
      throw new BadRequestError(
        'This Facebook login has expired. Start the connection again.',
        'FACEBOOK_OAUTH_HANDOFF_EXPIRED',
      );
    }

    return {
      handoffId,
      pages: await this.toSelectablePages(actor.organizationId, handoff.pages),
    };
  }

  /**
   * Annotates raw Pages with what this workspace may do with them.
   *
   * One query answers "can this operator claim it" for every Page at once, so
   * the picker can disable the ones another workspace already owns rather than
   * failing on click.
   */
  private async toSelectablePages(
    organizationId: string,
    pages: MetaManagedPage[],
  ): Promise<SelectablePage[]> {
    const pageIds = pages.map((page) => page.id);
    const instagramIds = pages
      .map((page) => page.instagram?.id)
      .filter((id): id is string => Boolean(id));

    // One query covers both channels. Type and inbox id together are what the
    // unique index is on, so a Page id and an IG account id can never collide.
    const claimed = await this.prisma.integration.findMany({
      where: {
        OR: [
          { type: IntegrationType.FACEBOOK, externalPageId: { in: pageIds } },
          { type: IntegrationType.INSTAGRAM, externalPageId: { in: instagramIds } },
        ],
      },
      select: { type: true, externalPageId: true, organizationId: true, status: true },
    });
    const claimedBy = new Map(claimed.map((row) => [`${row.type}:${row.externalPageId}`, row]));

    const availability = (type: IntegrationType, inboxId: string): Availability => {
      const owner = claimedBy.get(`${type}:${inboxId}`);
      const ownedElsewhere = Boolean(owner && owner.organizationId !== organizationId);
      return {
        unavailable: ownedElsewhere,
        connectedHere:
          Boolean(owner) && !ownedElsewhere && owner?.status === IntegrationStatus.CONNECTED,
      };
    };

    return pages.map((page) => ({
      id: page.id,
      name: page.name,
      category: page.category,
      pictureUrl: page.pictureUrl,
      alreadySubscribed: page.alreadySubscribed,
      ...availability(IntegrationType.FACEBOOK, page.id),
      instagram: page.instagram
        ? {
            id: page.instagram.id,
            username: page.instagram.username,
            name: page.instagram.name,
            pictureUrl: page.instagram.pictureUrl,
            ...availability(IntegrationType.INSTAGRAM, page.instagram.id),
          }
        : null,
    }));
  }

  /**
   * Step three: the operator picked an inbox.
   *
   * `channel` selects which of the Page's two inboxes is being connected. Both
   * are authorised by the same Page token and both are delivered by the same
   * Page subscription — what differs is which id identifies the inbox, and so
   * which id a webhook resolves back to an integration.
   *
   * Ordered so a failure leaves nothing half-built: the webhook subscription is
   * established first, because a stored integration that Meta is not delivering
   * to looks connected in the UI while being inert. Only once Meta has accepted
   * the subscription is the token persisted.
   */
  async connectPageFromHandoff(
    actor: AuthContext,
    handoffId: string,
    pageId: string,
    displayName: string | undefined,
    context: ClientContext,
    channel: Channel = Channel.FACEBOOK,
  ): Promise<ConnectPageResult> {
    this.assertConnectable();

    const handoff = await this.store.readHandoff(handoffId);
    if (!handoff) {
      throw new BadRequestError(
        'This Facebook login has expired. Start the connection again.',
        'META_OAUTH_HANDOFF_EXPIRED',
      );
    }

    // The handoff records who logged in; a token minted for one workspace must
    // not be spendable by another.
    if (handoff.organizationId !== actor.organizationId) {
      throw new BadRequestError(
        'This Facebook login does not belong to your workspace.',
        'META_OAUTH_HANDOFF_FOREIGN',
      );
    }

    const page = handoff.pages.find((candidate) => candidate.id === pageId);
    if (!page) {
      throw new BadRequestError(
        'That Page was not part of this Facebook login.',
        'META_PAGE_NOT_IN_HANDOFF',
      );
    }

    const isInstagram = channel === Channel.INSTAGRAM;

    if (isInstagram && !page.instagram) {
      throw new BadRequestError(
        'That Page has no Instagram Professional account linked to it. Link one in the Page settings, then try again.',
        'INSTAGRAM_NOT_LINKED',
      );
    }

    // The inbox id is what a webhook carries and what resolves the tenant: the
    // Page id for Messenger, the Instagram account id for Instagram Direct.
    const inboxId = isInstagram ? (page.instagram as { id: string }).id : page.id;
    const defaultName = isInstagram
      ? `@${page.instagram?.username ?? page.instagram?.name ?? inboxId}`
      : page.name;

    // Subscribing the *Page* is what starts delivery for both inboxes; Instagram
    // has no subscription of its own.
    await subscribePageToApp(page.id, page.accessToken);

    const integration = await this.integrations.connectMetaInbox(
      actor,
      {
        type: isInstagram ? IntegrationType.INSTAGRAM : IntegrationType.FACEBOOK,
        name: displayName?.trim() || defaultName,
        inboxId,
        accessToken: page.accessToken,
        // Instagram records the Page it hangs off, so a reconnect or a token
        // refresh knows where to go without another login.
        externalAccountId: isInstagram ? page.id : null,
        metadata: isInstagram
          ? { instagramUsername: page.instagram?.username ?? null, pageName: page.name }
          : { pageName: page.name, category: page.category },
      },
      context,
    );

    // History is a convenience, not part of a successful connect — a rate limit
    // here must not undo an inbox that is now correctly subscribed and live.
    const summary = await this.imports.importRecentHistory({
      integration: {
        id: integration.id,
        organizationId: integration.organizationId,
        status: IntegrationStatus.CONNECTED,
      },
      pageId: page.id,
      inboxId,
      accessToken: page.accessToken,
      channel,
    });

    await this.store.discardHandoff(handoffId);

    this.logger.log(
      { integrationId: integration.id, pageId: page.id, inboxId, channel, ...summary },
      'Meta inbox connected via OAuth',
    );

    return { integration, import: summary };
  }
}
