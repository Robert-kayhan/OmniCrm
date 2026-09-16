import { Injectable, Logger } from '@nestjs/common';
import { ChannelRegistryService } from '../../channels/channel-registry.service';
import type { ProviderCredentials } from '../../channels/types';
import { unsubscribePageFromApp } from '../../channels/meta/meta.oauth';
import { CryptoService } from '../../common/crypto/crypto.service';
import type { ClientContext } from '../../common/decorators/client-context.decorator';
import {
  ConflictError,
  IntegrationConfigurationError,
  NotFoundError,
} from '../../common/errors/app.error';
import { PrismaService, type Db } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { IntegrationStatus, IntegrationType } from '../../generated/prisma/enums';
import type { AuthContext } from '../../types/auth';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '../audit-logs/audit-log.actions';
import type {
  ConnectFacebookDto,
  ListIntegrationsQueryDto,
  UpdateIntegrationDto,
} from './dto/integration.dto';

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

/** Human names for the two Meta inboxes, used in conflict and config errors. */
const META_INBOX_LABEL: Partial<Record<IntegrationType, string>> = {
  [IntegrationType.FACEBOOK]: 'Facebook Page',
  [IntegrationType.INSTAGRAM]: 'Instagram account',
};

export interface ConnectMetaInboxInput {
  type: IntegrationType;
  name: string;
  /** The inbox id: a Page id for Messenger, an IG account id for Instagram. */
  inboxId: string;
  accessToken: string;
  /** The Page an Instagram account hangs off; null for Messenger. */
  externalAccountId?: string | null;
  /** Non-secret provider detail shown in the UI (username, linked page, ...). */
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly channels: ChannelRegistryService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async list(
    organizationId: string,
    query: ListIntegrationsQueryDto,
  ): Promise<IntegrationDto[]> {
    const rows = await this.prisma.integration.findMany({
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

  async getById(
    organizationId: string,
    integrationId: string,
  ): Promise<IntegrationDto> {
    const row = await this.prisma.integration.findFirst({
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
  async getChannelCatalogue(organizationId: string) {
    const existing = await this.list(organizationId, {});
    return this.channels.catalogue().map((capability) => ({
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
  async getCredentials(
    organizationId: string,
    integrationId: string,
    db?: Db,
  ): Promise<ProviderCredentials> {
    const row = await (db ?? this.prisma).integration.findFirst({
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
      accessToken: this.crypto.decryptOptionalSecret(row.accessToken),
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
  async findByExternalPageId(
    type: IntegrationType,
    externalPageId: string,
  ) {
    return this.prisma.integration.findUnique({
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

  /**
   * Stores one connected Meta inbox.
   *
   * Shared by Messenger and Instagram Direct because the row is identical apart
   * from its `type` — both are "an inbox id plus a Page token" — and by both the
   * OAuth flow and the manual-token fallback, so a token can only ever be
   * written by this one function.
   */
  async connectMetaInbox(
    actor: AuthContext,
    input: ConnectMetaInboxInput,
    context: ClientContext,
  ): Promise<IntegrationDto> {
    const label = META_INBOX_LABEL[input.type] ?? 'account';

    // Fails fast with the missing variable named, rather than storing a token for
    // an integration that could never send.
    const provider = this.channels.get(this.channels.channelForIntegrationType(input.type));
    if (!provider.isConfigured()) {
      throw new IntegrationConfigurationError(
        `${provider.displayName} is not configured on this server. Set META_APP_ID, META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN, then restart the API.`,
        'META_NOT_CONFIGURED',
      );
    }

    const claimed = await this.prisma.integration.findUnique({
      where: { type_externalPageId: { type: input.type, externalPageId: input.inboxId } },
      select: { id: true, organizationId: true },
    });
    if (claimed && claimed.organizationId !== actor.organizationId) {
      throw new ConflictError(
        `This ${label} is already connected to another workspace`,
        'PAGE_ALREADY_CONNECTED',
      );
    }

    const data = {
      name: input.name,
      status: IntegrationStatus.CONNECTED,
      accessToken: this.crypto.encryptSecret(input.accessToken),
      externalAccountId: input.externalAccountId ?? null,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      lastError: null,
    };

    const saved = claimed
      ? await this.prisma.integration.update({
          where: { id: claimed.id },
          data,
          select: { ...integrationSelect, accessToken: true },
        })
      : await this.prisma.integration.create({
          data: {
            organizationId: actor.organizationId,
            type: input.type,
            externalPageId: input.inboxId,
            ...data,
          },
          select: { ...integrationSelect, accessToken: true },
        });

    await this.auditLogs.record({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: AUDIT_ACTIONS.INTEGRATION_CONNECTED,
      entityType: AUDIT_ENTITIES.INTEGRATION,
      entityId: saved.id,
      // Deliberately records the inbox id and never the token.
      newData: { type: input.type, externalPageId: input.inboxId, name: input.name },
      ...context,
    });

    const { accessToken, ...rest } = saved;
    return toIntegrationDto(rest, Boolean(accessToken));
  }

  /** The manual paste-a-token route for Facebook. */
  async connectFacebook(
    actor: AuthContext,
    input: ConnectFacebookDto,
    context: ClientContext,
  ): Promise<IntegrationDto> {
    return this.connectMetaInbox(
      actor,
      {
        type: IntegrationType.FACEBOOK,
        name: input.name,
        inboxId: input.pageId,
        accessToken: input.pageAccessToken,
        externalAccountId: input.externalAccountId ?? null,
      },
      context,
    );
  }

  async update(
    actor: AuthContext,
    integrationId: string,
    input: UpdateIntegrationDto,
    context: ClientContext,
  ): Promise<IntegrationDto> {
    const existing = await this.prisma.integration.findFirst({
      where: { id: integrationId, organizationId: actor.organizationId },
      select: { id: true, name: true, status: true },
    });
    if (!existing) throw new NotFoundError('Integration', 'INTEGRATION_NOT_FOUND');

    const updated = await this.prisma.integration.update({
      where: { id: integrationId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      select: { ...integrationSelect, accessToken: true },
    });

    await this.auditLogs.record({
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
  async disconnect(
    actor: AuthContext,
    integrationId: string,
    context: ClientContext,
  ): Promise<IntegrationDto> {
    const existing = await this.prisma.integration.findFirst({
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
          this.crypto.decryptOptionalSecret(existing.accessToken) as string,
        );
      } catch (error) {
          this.logger.warn(
          { err: error, integrationId, pageId: existing.externalPageId },
          'Could not unsubscribe the Page from this app; disconnecting locally anyway',
        );
      }
    }

    const updated = await this.prisma.integration.update({
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

    await this.auditLogs.record({
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
  async markError(integrationId: string, message: string): Promise<void> {
    await this.prisma.integration.update({
      where: { id: integrationId },
      data: { status: IntegrationStatus.ERROR, lastError: message.slice(0, 500) },
    });
  }
}
