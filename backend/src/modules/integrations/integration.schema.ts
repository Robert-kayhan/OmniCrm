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

/**
 * Meta's redirect back from the login dialog.
 *
 * Everything is optional because the operator may have cancelled, in which
 * case Meta returns `error`/`error_description` and no code. The handler turns
 * that into a friendly redirect rather than a validation failure.
 */
export const facebookOAuthCallbackSchema = z.object({
  code: z.string().trim().min(1).max(1024).optional(),
  state: z.string().trim().min(1).max(2048).optional(),
  error: z.string().trim().max(256).optional(),
  error_reason: z.string().trim().max(256).optional(),
  error_description: z.string().trim().max(512).optional(),
});

/**
 * Picking one inbox out of the ones the login returned.
 *
 * `pageId` always identifies the Facebook Page, for both channels: Instagram
 * Direct is reached through the Page it is linked to, and `channel` selects
 * which of the Page's two inboxes is connected.
 */
export const connectFacebookPageSchema = z.object({
  handoffId: z.string().trim().min(1).max(256),
  pageId: z.string().trim().min(1).max(64).regex(/^\d+$/, 'Facebook Page id must be numeric'),
  channel: z
    .enum([IntegrationType.FACEBOOK, IntegrationType.INSTAGRAM])
    .default(IntegrationType.FACEBOOK),
  /** Defaults to the Page or Instagram handle when omitted. */
  name: cleanText(120, 1).optional(),
});

export type FacebookOAuthCallbackQuery = z.infer<typeof facebookOAuthCallbackSchema>;
export type ConnectFacebookPageInput = z.infer<typeof connectFacebookPageSchema>;

/** Reading back the Pages from a completed login. */
export const facebookOAuthPagesQuerySchema = z.object({
  handoffId: z.string().trim().min(1).max(256),
});
