import { z } from 'zod';
import { Channel, MessageType } from '../../generated/prisma/enums';
import { cleanText, idSchema, optionalCleanText } from '../../utils/validation';

/**
 * Development-mode simulation.
 *
 * These endpoints drive the same `ingestNormalizedMessage` path a real webhook
 * uses, so the inbox can be built and demoed before Meta App Review without a
 * second, divergent code path to maintain.
 */
export const simulateInboundSchema = z.object({
  /** Defaults to a sandbox integration created on demand. */
  integrationId: idSchema.optional(),
  channel: z.enum(Channel).default(Channel.FACEBOOK),
  /** Reuse an id to continue an existing simulated thread. */
  externalUserId: z.string().trim().min(1).max(191).optional(),
  name: optionalCleanText(120),
  content: cleanText(2000, 1),
  messageType: z.enum(MessageType).default(MessageType.TEXT),
});

export const seedSampleDataSchema = z.object({
  conversations: z.coerce.number().int().min(1).max(25).default(5),
  messagesPerConversation: z.coerce.number().int().min(1).max(30).default(6),
});

export type SimulateInboundInput = z.infer<typeof simulateInboundSchema>;
export type SeedSampleDataInput = z.infer<typeof seedSampleDataSchema>;
