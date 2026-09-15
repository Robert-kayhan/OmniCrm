import { logger } from '../../config/logger';
import { prisma, type Db } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { IntegrationStatus, IntegrationType } from '../../generated/prisma/enums';
import { ConflictError, IntegrationConfigurationError, NotFoundError } from '../../utils/errors';
import { decryptOptionalSecret, encryptSecret } from '../../utils/crypto';
import { recordAudit } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import type { AuthContext } from '../../types/auth';
import type { ClientContext } from '../auth/auth.service';
import {
  channelCatalogue,
  channelForIntegrationType,
  getProvider,
  type ProviderCredentials,
} from '../../channels';
import { unsubscribePageFromApp } from '../../channels/facebook/facebook.oauth';
import type {
  ConnectFacebookInput,
  ListIntegrationsQuery,
  UpdateIntegrationInput,
} from './integration.schema';

/**
 * The public shape of an integration.
 *
 * `accessToken`, `refreshToken` and `tokenExpiresAt` are deliberately absent:
 * this select is the only one any controller uses, so a token cannot reach a
 * response by accident.
 */
const integrationSelect = {
  id: true,
  organizationId: true,
  type: true,
  name: true,
  status: true,
  externalAccountId: true,
  externalPageId: true,
  metadata: true,
  lastError: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { conversations: true, customerChannels: true } },
} satisfies Prisma.IntegrationSelect;

type IntegrationRow = Prisma.IntegrationGetPayload<{ select: typeof integrationSelect }>;

export interface IntegrationDto {
  id: string;
  organizationId: string;
  type: IntegrationRow['type'];
  name: string;
  status: IntegrationRow['status'];
  externalAccountId: string | null;
  externalPageId: string | null;
  metadata: Prisma.JsonValue | null;
  lastError: string | null;
  lastSyncedAt: Date | null;
  conversationCount: number;
  customerChannelCount: number;
  /** True once a token is stored. The token itself is never exposed. */
  hasCredentials: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toIntegrationDto(row: IntegrationRow, hasCredentials: boolean): IntegrationDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    name: row.name,
    status: row.status,
    externalAccountId: row.externalAccountId,
    externalPageId: row.externalPageId,
    metadata: row.metadata,
    lastError: row.lastError,
    lastSyncedAt: row.lastSyncedAt,
    conversationCount: row._count.conversations,
    customerChannelCount: row._count.customerChannels,
    hasCredentials,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listIntegrations(
  organizationId: string,
  query: ListIntegrationsQuery,
): Promise<IntegrationDto[]> {
  const rows = await prisma.integration.findMany({
    where: {
      organizationId,
      ...(query.type?.length ? { type: { in: query.type } } : {}),
      ...(query.status?.length ? { status: { in: query.status } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    // `accessToken` is selected only to derive the boolean below; it is never
    // returned and never decrypted here.
    select: { ...integrationSelect, accessToken: true },
  });

  return rows.map(({ accessToken, ...row }) => toIntegrationDto(row, Boolean(accessToken)));
}

export async function getIntegrationById(
  organizationId: string,
  integrationId: string,
): Promise<IntegrationDto> {
  const row = await prisma.integration.findFirst({
    where: { id: integrationId, organizationId },
    select: { ...integrationSelect, accessToken: true },
  });
  if (!row) throw new NotFoundError('Integration', 'INTEGRATION_NOT_FOUND');
  const { accessToken, ...rest } = row;
  return toIntegrationDto(rest, Boolean(accessToken));
}

/**
 * The channel catalogue for the settings screen: every channel the product
 * knows about, whether a provider is built, whether the process is configured
 * for it, and which integrations already exist.
 */
export async function getChannelCatalogue(organizationId: string) {
  const existing = await listIntegrations(organizationId, {});
  return channelCatalogue().map((capability) => ({
    ...capability,
    integrations: existing.filter((integration) => integration.type === capability.integrationType),
  }));
}

/**
 * Decrypts an integration's credentials for a single provider call.
 *
 * This is the only function in the codebase that decrypts a provider token.
 * The plaintext is handed straight to a provider and never logged, cached or
 * returned to a controller.
 */
export async function getCredentialsForIntegration(
  organizationId: string,
  integrationId: string,
  db: Db = prisma,
): Promise<ProviderCredentials> {
  const row = await db.integration.findFirst({
    where: { id: integrationId, organizationId },
    select: {
      id: true,
      type: true,
      status: true,
      accessToken: true,
      externalAccountId: true,
      externalPageId: true,
      metadata: true,
    },
  });
  if (!row) throw new NotFoundError('Integration', 'INTEGRATION_NOT_FOUND');

  if (row.status !== IntegrationStatus.CONNECTED) {
    throw new IntegrationConfigurationError(
      `The ${row.type} integration is ${row.status.toLowerCase()}. Reconnect it from Settings, Integrations.`,
      'INTEGRATION_NOT_ACTIVE',
      { integrationId: row.id, status: row.status },
    );
  }

  return {
    integrationId: row.id,
    type: row.type,
    externalPageId: row.externalPageId,
    externalAccountId: row.externalAccountId,
    accessToken: decryptOptionalSecret(row.accessToken),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

/**
 * Resolves an inbound webhook to its integration.
 *
 * The (type, externalPageId) unique index is what makes this safe: one provider
 * inbox maps to exactly one tenant, so a webhook can never be attributed to the
 * wrong organization.
 */
export async function findIntegrationByExternalPageId(
  type: IntegrationType,
  externalPageId: string,
) {
  return prisma.integration.findUnique({
    where: { type_externalPageId: { type, externalPageId } },
    select: {
      id: true,
      organizationId: true,
      type: true,
      status: true,
      externalPageId: true,
      externalAccountId: true,
      accessToken: true,
      metadata: true,
    },
  });
}

export async function connectFacebook(
  actor: AuthContext,
  input: ConnectFacebookInput,
  context: ClientContext,
): Promise<IntegrationDto> {
  // Fails fast with the missing variable named, rather than storing a token for
  // an integration that could never send.
  const provider = getProvider(channelForIntegrationType(IntegrationType.FACEBOOK));
  if (!provider.isConfigured()) {
    throw new IntegrationConfigurationError(
      'Facebook is not configured on this server. Set META_APP_ID, META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN, then restart the API.',
      'FACEBOOK_NOT_CONFIGURED',
    );
  }

  const claimed = await prisma.integration.findUnique({
    where: { type_externalPageId: { type: IntegrationType.FACEBOOK, externalPageId: input.pageId } },
    select: { id: true, organizationId: true },
  });
  if (claimed && claimed.organizationId !== actor.organizationId) {
    throw new ConflictError(
      'This Facebook Page is already connected to another workspace',
      'PAGE_ALREADY_CONNECTED',
    );
  }

  const data = {
    name: input.name,
    status: IntegrationStatus.CONNECTED,
    accessToken: encryptSecret(input.pageAccessToken),
    externalAccountId: input.externalAccountId ?? null,
    lastError: null,
  };

  const saved = claimed
    ? await prisma.integration.update({
        where: { id: claimed.id },
        data,
        select: { ...integrationSelect, accessToken: true },
      })
    : await prisma.integration.create({
        data: {
          organizationId: actor.organizationId,
          type: IntegrationType.FACEBOOK,
          externalPageId: input.pageId,
          ...data,
        },
        select: { ...integrationSelect, accessToken: true },
      });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.INTEGRATION_CONNECTED,
    entityType: AUDIT_ENTITIES.INTEGRATION,
    entityId: saved.id,
    // Deliberately records the Page id and never the token.
    newData: { type: IntegrationType.FACEBOOK, externalPageId: input.pageId, name: input.name },
    ...context,
  });

  const { accessToken, ...rest } = saved;
  return toIntegrationDto(rest, Boolean(accessToken));
}

export async function updateIntegration(
  actor: AuthContext,
  integrationId: string,
  input: UpdateIntegrationInput,
  context: ClientContext,
): Promise<IntegrationDto> {
  const existing = await prisma.integration.findFirst({
    where: { id: integrationId, organizationId: actor.organizationId },
    select: { id: true, name: true, status: true },
  });
  if (!existing) throw new NotFoundError('Integration', 'INTEGRATION_NOT_FOUND');

  const updated = await prisma.integration.update({
    where: { id: integrationId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    select: { ...integrationSelect, accessToken: true },
  });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.INTEGRATION_UPDATED,
    entityType: AUDIT_ENTITIES.INTEGRATION,
    entityId: integrationId,
    oldData: existing,
    newData: input,
    ...context,
  });

  const { accessToken, ...rest } = updated;
  return toIntegrationDto(rest, Boolean(accessToken));
}

/**
 * Disconnects an integration.
 *
 * The row is kept and the token destroyed, rather than deleted outright:
 * conversations and customer identities reference it, and the history of who
 * said what should survive a reconnect.
 */
export async function disconnectIntegration(
  actor: AuthContext,
  integrationId: string,
  context: ClientContext,
): Promise<IntegrationDto> {
  const existing = await prisma.integration.findFirst({
    where: { id: integrationId, organizationId: actor.organizationId },
    select: { id: true, type: true, name: true, externalPageId: true, accessToken: true },
  });
  if (!existing) throw new NotFoundError('Integration', 'INTEGRATION_NOT_FOUND');

  // Tell Meta to stop delivering before the token that authorises saying so is
  // destroyed. Best-effort: a revoked or expired token makes this call fail,
  // and refusing to disconnect because of that would strand the operator with
  // an integration they cannot remove.
  if (existing.type === IntegrationType.FACEBOOK && existing.externalPageId && existing.accessToken) {
    try {
      await unsubscribePageFromApp(
        existing.externalPageId,
        decryptOptionalSecret(existing.accessToken) as string,
      );
    } catch (error) {
      logger.warn(
        { err: error, integrationId, pageId: existing.externalPageId },
        'Could not unsubscribe the Page from this app; disconnecting locally anyway',
      );
    }
  }

  const updated = await prisma.integration.update({
    where: { id: integrationId },
    data: {
      status: IntegrationStatus.DISCONNECTED,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      lastError: null,
    },
    select: { ...integrationSelect, accessToken: true },
  });

  await recordAudit({
    organizationId: actor.organizationId,
    userId: actor.userId,
    action: AUDIT_ACTIONS.INTEGRATION_DISCONNECTED,
    entityType: AUDIT_ENTITIES.INTEGRATION,
    entityId: integrationId,
    // Spread deliberately drops `accessToken`: an audit row must never carry a
    // provider secret, even an encrypted one.
    oldData: {
      id: existing.id,
      type: existing.type,
      name: existing.name,
      externalPageId: existing.externalPageId,
    },
    ...context,
  });

  const { accessToken, ...rest } = updated;
  return toIntegrationDto(rest, Boolean(accessToken));
}

/** Records a provider failure against the integration for the settings screen. */
export async function markIntegrationError(integrationId: string, message: string): Promise<void> {
  await prisma.integration.update({
    where: { id: integrationId },
    data: { status: IntegrationStatus.ERROR, lastError: message.slice(0, 500) },
  });
}
