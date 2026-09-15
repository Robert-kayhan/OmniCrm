import { Channel, IntegrationType } from '../generated/prisma/enums';
import { IntegrationConfigurationError } from '../utils/errors';
import type { MessagingProvider } from './types';

/**
 * Provider lookup, keyed by channel.
 *
 * Registration happens once at startup (see ./index.ts). Nothing else in the
 * codebase may import a concrete provider — call `getProvider(channel)` so that
 * an unimplemented channel fails with a clear 503 instead of a crash, and so
 * adding a channel touches exactly one file.
 */
const providers = new Map<Channel, MessagingProvider>();

export function registerProvider(provider: MessagingProvider): void {
  providers.set(provider.channel, provider);
}

export function findProvider(channel: Channel): MessagingProvider | null {
  return providers.get(channel) ?? null;
}

/** Throws a 503 naming the channel when no provider is registered for it. */
export function getProvider(channel: Channel): MessagingProvider {
  const provider = providers.get(channel);
  if (!provider) {
    throw new IntegrationConfigurationError(
      `The ${channel} channel is not available in this build yet. Messages can be read but not sent.`,
      'CHANNEL_NOT_SUPPORTED',
      { channel },
    );
  }
  return provider;
}

export function registeredChannels(): Channel[] {
  return Array.from(providers.keys());
}

/** Providers are looked up by URL slug on the webhook routes: /api/webhooks/facebook. */
export function findProviderBySlug(slug: string): MessagingProvider | null {
  const normalized = slug.trim().toUpperCase();
  if (!(normalized in Channel)) return null;
  return findProvider(normalized as Channel);
}

/** The integration type a channel connects through. They are 1:1 today. */
export function integrationTypeForChannel(channel: Channel): IntegrationType {
  return channel as unknown as IntegrationType;
}

export function channelForIntegrationType(type: IntegrationType): Channel {
  return type as unknown as Channel;
}

/** Catalogue rendered by the integrations screen, including unbuilt channels. */
export interface ChannelCapability {
  channel: Channel;
  integrationType: IntegrationType;
  displayName: string;
  /** A provider exists in this build. */
  available: boolean;
  /** Process-level credentials are present, so it can actually be connected. */
  configured: boolean;
}

const CHANNEL_LABELS: Record<Channel, string> = {
  [Channel.FACEBOOK]: 'Facebook Messenger',
  [Channel.INSTAGRAM]: 'Instagram Direct',
  [Channel.EMAIL]: 'Email',
  [Channel.WEBSITE]: 'Website Chat',
  [Channel.WHATSAPP]: 'WhatsApp',
};

export function channelCatalogue(): ChannelCapability[] {
  return Object.values(Channel).map((channel) => {
    const provider = providers.get(channel);
    return {
      channel,
      integrationType: integrationTypeForChannel(channel),
      displayName: provider?.displayName ?? CHANNEL_LABELS[channel],
      available: Boolean(provider),
      configured: provider?.isConfigured() ?? false,
    };
  });
}
