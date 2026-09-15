import { z } from 'zod';
import { IntegrationStatus, IntegrationType } from '../../generated/prisma/enums';
import { cleanText, csvOf } from '../../utils/validation';

export const listIntegrationsQuerySchema = z.object({
  type: csvOf(z.enum(IntegrationType)).optional(),
  status: csvOf(z.enum(IntegrationStatus)).optional(),
});

/**
 * Connecting a Facebook Page.
 *
 * The Page access token is supplied by the operator (from the Meta app
 * dashboard or an OAuth exchange) and is encrypted before it is stored. It is
 * write-only: no endpoint ever returns it.
 */
export const connectFacebookSchema = z.object({
  name: cleanText(120, 1),
  pageId: z.string().trim().min(1).max(64).regex(/^\d+$/, 'Facebook Page id must be numeric'),
  pageAccessToken: z.string().trim().min(20, 'Page access token looks too short').max(1024),
  /** Optional: the Meta business/app-scoped account the Page belongs to. */
  externalAccountId: z.string().trim().max(64).optional(),
});

export const updateIntegrationSchema = z
  .object({
    name: cleanText(120, 1).optional(),
    status: z.enum([IntegrationStatus.CONNECTED, IntegrationStatus.DISCONNECTED]).optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'At least one field must be provided',
  });

export type ListIntegrationsQuery = z.infer<typeof listIntegrationsQuerySchema>;
export type ConnectFacebookInput = z.infer<typeof connectFacebookSchema>;
export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>;
