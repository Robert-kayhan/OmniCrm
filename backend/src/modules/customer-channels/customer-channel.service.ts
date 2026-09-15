import { prisma } from '../../database/prisma';
import type { Db } from '../../database/prisma';
import type { Channel } from '../../generated/prisma/enums';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import type { AuthContext } from '../../types/auth';
import {
  customerChannelSelect,
  type CustomerChannelRow,
} from '../customers/customer.select';
import { assertCustomerExists } from '../customers/customer.service';
import type { CreateCustomerChannelInput } from './customer-channel.schema';

export async function listCustomerChannels(
  organizationId: string,
  customerId: string,
): Promise<CustomerChannelRow[]> {
  await assertCustomerExists(organizationId, customerId);
  return prisma.customerChannel.findMany({
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
export async function findByExternalIdentity(
  integrationId: string,
  externalUserId: string,
  db: Db = prisma,
): Promise<{ id: string; customerId: string } | null> {
  return db.customerChannel.findUnique({
    where: { integrationId_externalUserId: { integrationId, externalUserId } },
    select: { id: true, customerId: true },
  });
}

export async function createCustomerChannel(
  actor: AuthContext,
  customerId: string,
  input: CreateCustomerChannelInput,
): Promise<CustomerChannelRow> {
  await assertCustomerExists(actor.organizationId, customerId);

  const integration = await prisma.integration.findFirst({
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

  const duplicate = await findByExternalIdentity(input.integrationId, input.externalUserId);
  if (duplicate) {
    throw new ConflictError(
      'This identity is already linked to a customer',
      'CUSTOMER_CHANNEL_EXISTS',
      { customerId: duplicate.customerId },
    );
  }

  return prisma.customerChannel.create({
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

export async function deleteCustomerChannel(
  actor: AuthContext,
  customerId: string,
  channelId: string,
): Promise<void> {
  await assertCustomerExists(actor.organizationId, customerId);
  const existing = await prisma.customerChannel.findFirst({
    where: { id: channelId, customerId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError('Customer channel', 'CUSTOMER_CHANNEL_NOT_FOUND');
  // Conversations keep their history; customerChannelId is set null.
  await prisma.customerChannel.delete({ where: { id: channelId } });
}
