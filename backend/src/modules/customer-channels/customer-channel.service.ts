import { Injectable } from '@nestjs/common';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/app.error';
import { PrismaService, type Db } from '../../database/prisma.service';
import type { Channel } from '../../generated/prisma/enums';
import type { AuthContext } from '../../types/auth';
import { customerChannelSelect, type CustomerChannelRow } from '../customers/customer.select';
import { CustomerService } from '../customers/customer.service';
import type { CreateCustomerChannelDto } from './dto/customer-channel.dto';

@Injectable()
export class CustomerChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomerService,
  ) {}

  async list(organizationId: string, customerId: string): Promise<CustomerChannelRow[]> {
    await this.customers.assertExists(organizationId, customerId);
    return this.prisma.customerChannel.findMany({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
      select: customerChannelSelect,
    });
  }

  /**
   * Resolves a provider identity to its CustomerChannel row.
   *
   * The (integrationId, externalUserId) unique index is what guarantees a single
   * row per provider identity, so this is the only lookup ingest needs — no
   * name matching, no heuristics.
   */
  async findByExternalIdentity(
    integrationId: string,
    externalUserId: string,
    db?: Db,
  ): Promise<{ id: string; customerId: string } | null> {
    return (db ?? this.prisma).customerChannel.findUnique({
      where: { integrationId_externalUserId: { integrationId, externalUserId } },
      select: { id: true, customerId: true },
    });
  }

  async create(
    actor: AuthContext,
    customerId: string,
    input: CreateCustomerChannelDto,
  ): Promise<CustomerChannelRow> {
    await this.customers.assertExists(actor.organizationId, customerId);

    const integration = await this.prisma.integration.findFirst({
      where: { id: input.integrationId, organizationId: actor.organizationId },
      select: { id: true, type: true },
    });
    if (!integration) {
      throw new BadRequestError('Integration not found', 'INTEGRATION_NOT_FOUND');
    }
    // The channel must match the integration it is attached to, or an inbound
    // Facebook message could resolve to a row labelled INSTAGRAM.
    if ((integration.type as string) !== (input.channel as string)) {
      throw new BadRequestError(
        `Channel ${input.channel} does not match the ${integration.type} integration`,
        'CHANNEL_INTEGRATION_MISMATCH',
      );
    }

    const duplicate = await this.findByExternalIdentity(
      input.integrationId,
      input.externalUserId,
    );
    if (duplicate) {
      throw new ConflictError(
        'This identity is already linked to a customer',
        'CUSTOMER_CHANNEL_EXISTS',
        { customerId: duplicate.customerId },
      );
    }

    return this.prisma.customerChannel.create({
      data: {
        customerId,
        integrationId: input.integrationId,
        channel: input.channel as Channel,
        externalUserId: input.externalUserId,
        username: input.username ?? null,
        profileUrl: input.profileUrl ?? null,
        avatar: input.avatar ?? null,
      },
      select: customerChannelSelect,
    });
  }

  async remove(actor: AuthContext, customerId: string, channelId: string): Promise<void> {
    await this.customers.assertExists(actor.organizationId, customerId);
    const existing = await this.prisma.customerChannel.findFirst({
      where: { id: channelId, customerId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError('Customer channel', 'CUSTOMER_CHANNEL_NOT_FOUND');
    // Conversations keep their history; customerChannelId is set null.
    await this.prisma.customerChannel.delete({ where: { id: channelId } });
  }
}
