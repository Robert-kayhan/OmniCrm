import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { prisma } from '../../database/prisma';
import { IntegrationStatus, IntegrationType } from '../../generated/prisma/enums';
import {
  buildAuthorizeUrl,
  exchangeCodeForUserToken,
  extendUserToken,
  listManagedPages,
  subscribePageToApp,
  type MetaManagedPage,
} from '../../channels/facebook/facebook.oauth';
import { channelForIntegrationType, getProvider } from '../../channels';
import { BadRequestError, IntegrationConfigurationError } from '../../utils/errors';
import type { AuthContext } from '../../types/auth';
import type { ClientContext } from '../auth/auth.service';
import { connectFacebook, type IntegrationDto } from './integration.service';
import { importRecentHistory, type ImportSummary } from './facebook-import.service';
import {
  createState,
  discardHandoff,
  readHandoff,
  readState,
  saveHandoff,
} from './facebook-oauth.store';

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

/** A Page as the picker shows it. Note the absence of any token field. */
export interface SelectablePage {
  id: string;
  name: string;
  category: string | null;
  pictureUrl: string | null;
  /** Already delivering to this app's webhook. Reconnecting is still allowed. */
  alreadySubscribed: boolean;
  /** Connected to a different workspace, so this operator cannot claim it. */
  unavailable: boolean;
  /** Already connected to *this* workspace. */
  connectedHere: boolean;
}

export interface FacebookLoginResult {
  handoffId: string;
  pages: SelectablePage[];
}

export interface ConnectPageResult {
  integration: IntegrationDto;
  import: ImportSummary;
}

/**
 * Guards the whole flow.
 *
 * The provider's own check covers the webhook credentials; this adds the OAuth
 * pair, so a half-configured server names the exact missing variable instead of
 * failing at Meta's dialog.
 */
function assertConnectable(): void {
  const provider = getProvider(channelForIntegrationType(IntegrationType.FACEBOOK));
  if (!provider.isConfigured() || !env.META_APP_ID || !env.META_APP_SECRET) {
    throw new IntegrationConfigurationError(
      'Facebook is not configured on this server. Set META_APP_ID, META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN, then restart the API.',
      'FACEBOOK_NOT_CONFIGURED',
    );
  }
}

/** Step one: where to send the operator's browser. */
export function startFacebookLogin(actor: AuthContext): { authorizeUrl: string } {
  assertConnectable();
  const state = createState(actor.organizationId, actor.userId);
  return { authorizeUrl: buildAuthorizeUrl(state) };
}

/**
 * Step two: Meta has sent the browser back with a code.
 *
 * Runs unauthenticated — the browser arrives from facebook.com with no bearer
 * token — so the signed `state` is the only thing establishing who this is.
 * It is verified before the code is spent.
 */
export async function completeFacebookLogin(
  code: string,
  state: string | undefined,
): Promise<FacebookLoginResult & { organizationId: string; userId: string }> {
  assertConnectable();

  const identity = readState(state);

  const shortLived = await exchangeCodeForUserToken(code);
  const userToken = await extendUserToken(shortLived);
  const pages = await listManagedPages(userToken);

  if (pages.length === 0) {
    throw new BadRequestError(
      'That Facebook account does not administer any Pages. Create a Page, or log in with an account that manages one.',
      'FACEBOOK_NO_PAGES',
    );
  }

  const handoffId = await saveHandoff({
    organizationId: identity.organizationId,
    userId: identity.userId,
    pages,
  });

  return {
    organizationId: identity.organizationId,
    userId: identity.userId,
    handoffId,
    pages: await toSelectablePages(identity.organizationId, pages),
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
export async function listHandoffPages(
  actor: AuthContext,
  handoffId: string,
): Promise<FacebookLoginResult> {
  const handoff = await readHandoff(handoffId);
  if (!handoff || handoff.organizationId !== actor.organizationId) {
    throw new BadRequestError(
      'This Facebook login has expired. Start the connection again.',
      'FACEBOOK_OAUTH_HANDOFF_EXPIRED',
    );
  }

  return {
    handoffId,
    pages: await toSelectablePages(actor.organizationId, handoff.pages),
  };
}

/**
 * Annotates raw Pages with what this workspace may do with them.
 *
 * One query answers "can this operator claim it" for every Page at once, so
 * the picker can disable the ones another workspace already owns rather than
 * failing on click.
 */
async function toSelectablePages(
  organizationId: string,
  pages: MetaManagedPage[],
): Promise<SelectablePage[]> {
  const claimed = await prisma.integration.findMany({
    where: {
      type: IntegrationType.FACEBOOK,
      externalPageId: { in: pages.map((page) => page.id) },
    },
    select: { externalPageId: true, organizationId: true, status: true },
  });
  const claimedBy = new Map(claimed.map((row) => [row.externalPageId, row]));

  return pages.map((page) => {
    const owner = claimedBy.get(page.id);
    const ownedElsewhere = Boolean(owner && owner.organizationId !== organizationId);
    return {
      id: page.id,
      name: page.name,
      category: page.category,
      pictureUrl: page.pictureUrl,
      alreadySubscribed: page.alreadySubscribed,
      unavailable: ownedElsewhere,
      connectedHere:
        Boolean(owner) && !ownedElsewhere && owner?.status === IntegrationStatus.CONNECTED,
    };
  });
}

/**
 * Step three: the operator picked a Page.
 *
 * Ordered so a failure leaves nothing half-built: the webhook subscription is
 * established first, because a stored integration that Meta is not delivering
 * to looks connected in the UI while being inert. Only once Meta has accepted
 * the subscription is the token persisted.
 */
export async function connectPageFromHandoff(
  actor: AuthContext,
  handoffId: string,
  pageId: string,
  displayName: string | undefined,
  context: ClientContext,
): Promise<ConnectPageResult> {
  assertConnectable();

  const handoff = await readHandoff(handoffId);
  if (!handoff) {
    throw new BadRequestError(
      'This Facebook login has expired. Start the connection again.',
      'FACEBOOK_OAUTH_HANDOFF_EXPIRED',
    );
  }

  // The handoff records who logged in; a token minted for one workspace must
  // not be spendable by another.
  if (handoff.organizationId !== actor.organizationId) {
    throw new BadRequestError(
      'This Facebook login does not belong to your workspace.',
      'FACEBOOK_OAUTH_HANDOFF_FOREIGN',
    );
  }

  const page = handoff.pages.find((candidate) => candidate.id === pageId);
  if (!page) {
    throw new BadRequestError(
      'That Page was not part of this Facebook login.',
      'FACEBOOK_PAGE_NOT_IN_HANDOFF',
    );
  }

  // Without this Meta never calls the webhook, and the inbox stays silent.
  await subscribePageToApp(page.id, page.accessToken);

  const integration = await connectFacebook(
    actor,
    {
      name: displayName?.trim() || page.name,
      pageId: page.id,
      pageAccessToken: page.accessToken,
      externalAccountId: undefined,
    },
    context,
  );

  // History is a convenience, not part of a successful connect — a rate limit
  // here must not undo a Page that is now correctly subscribed and live.
  const summary = await importRecentHistory(
    {
      id: integration.id,
      organizationId: integration.organizationId,
      status: IntegrationStatus.CONNECTED,
    },
    page.id,
    page.accessToken,
  );

  await discardHandoff(handoffId);

  logger.info(
    { integrationId: integration.id, pageId: page.id, ...summary },
    'Facebook Page connected via OAuth',
  );

  return { integration, import: summary };
}
