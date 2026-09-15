import type { Channel, IntegrationType, MessageType } from '../generated/prisma/enums';

/**
 * The channel abstraction.
 *
 * Everything below this line is provider-agnostic. A provider's only job is to
 * translate between its own wire format and these shapes; it never touches the
 * database, never knows about organizations, and never decides how a
 * conversation is threaded. That is what makes "add Instagram" a new file
 * rather than a migration.
 */

export type JsonObject = Record<string, unknown>;

export interface NormalizedAttachment {
  type: MessageType;
  url: string;
  name?: string | null;
  mimeType?: string | null;
  /** Provider attachment id, when one is exposed. */
  externalId?: string | null;
}

/** The customer as the provider knows them. Fields beyond the id are best-effort. */
export interface NormalizedContact {
  /** Provider-scoped identity: Messenger PSID, IG-scoped id, email address, ... */
  externalUserId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  profileUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  locale?: string | null;
}

/**
 * INBOUND  — the customer wrote it.
 * OUTBOUND — the business wrote it. Providers that echo our own sends back to
 *            us (Meta does) report them this way so ingest can reconcile rather
 *            than duplicate.
 */
export type MessageDirection = 'INBOUND' | 'OUTBOUND';

/**
 * A provider message translated into the CRM's vocabulary.
 *
 * Note what is absent: `organizationId`, `integrationId`, `customerId`,
 * `conversationId`. Those are resolved by the ingest service from
 * `externalPageId`, so a provider cannot accidentally address the wrong tenant.
 */
export interface NormalizedMessage {
  channel: Channel;
  /** The provider inbox this arrived for. Resolves to exactly one Integration. */
  externalPageId: string;
  /** Provider message id. Used as the idempotency key for redelivered webhooks. */
  externalMessageId: string | null;
  /** Provider thread id, when the provider threads server-side. */
  externalConversationId?: string | null;
  contact: NormalizedContact;
  direction: MessageDirection;
  messageType: MessageType;
  content: string | null;
  attachments: NormalizedAttachment[];
  sentAt: Date;
  /** Subject line, for channels that have one (email). */
  subject?: string | null;
  metadata?: JsonObject;
}

/**
 * A non-message webhook event a provider wants recorded but that creates no
 * message — delivery receipts, read receipts, opt-ins.
 */
export interface NormalizedEvent {
  channel: Channel;
  externalPageId: string;
  externalEventId: string | null;
  type: 'DELIVERY' | 'READ' | 'ECHO' | 'OTHER';
  /** Provider message ids this receipt refers to. */
  externalMessageIds?: string[];
  occurredAt: Date;
  metadata?: JsonObject;
}

export interface WebhookParseResult {
  messages: NormalizedMessage[];
  events: NormalizedEvent[];
}

/**
 * Credentials handed to a provider for one send. Already decrypted by the
 * integration service — providers never read the database or the environment
 * for a token.
 */
export interface ProviderCredentials {
  integrationId: string;
  type: IntegrationType;
  /** Provider inbox id (Facebook Page id, IG business account id, ...). */
  externalPageId: string | null;
  externalAccountId: string | null;
  accessToken: string | null;
  metadata: JsonObject | null;
}

export interface OutboundAttachment {
  type: MessageType;
  url: string;
  name?: string | null;
}

export interface SendMessageInput {
  credentials: ProviderCredentials;
  /** Provider identity of the customer (CustomerChannel.externalUserId). */
  recipientExternalId: string;
  content: string | null;
  attachments?: OutboundAttachment[];
  /** Local message id, for correlating provider echoes and logs. */
  correlationId?: string;
}

export interface SendMessageResult {
  externalMessageId: string | null;
  externalConversationId?: string | null;
  /** Non-secret provider response detail, stored on Message.metadata. */
  metadata?: JsonObject;
}

export interface FetchProfileInput {
  credentials: ProviderCredentials;
  externalUserId: string;
}

/** Signature material for providers that authenticate their webhooks. */
export interface WebhookSignatureInput {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * The contract every channel implements. Facebook is the first; Instagram,
 * WhatsApp, email and website chat slot in behind the same interface without
 * the conversation system changing.
 */
export interface MessagingProvider {
  readonly channel: Channel;
  readonly integrationType: IntegrationType;

  /** Human-readable name shown on the integrations screen. */
  readonly displayName: string;

  /**
   * Whether the process-level configuration (app id, app secret, ...) is
   * present. False means the integration cannot be connected at all, as
   * opposed to a specific integration row lacking a token.
   */
  isConfigured(): boolean;

  /**
   * Throws `IntegrationConfigurationError` naming the exact missing value.
   * Called before every send so a misconfiguration surfaces as a precise 503
   * rather than a provider 400 much later.
   */
  assertReady(credentials: ProviderCredentials): void;

  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;

  /** Translates one raw webhook body into normalized messages and events. */
  handleWebhook(payload: unknown): Promise<WebhookParseResult>;

  /** Rejects forged webhook deliveries. Providers without signing return true. */
  verifyWebhookSignature(input: WebhookSignatureInput): boolean;

  /** Enriches a bare provider id with a name/avatar, when the API allows it. */
  fetchContactProfile?(input: FetchProfileInput): Promise<Partial<NormalizedContact>>;
}
