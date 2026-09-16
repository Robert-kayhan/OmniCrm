import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Channel, IntegrationType } from '../generated/prisma/enums';
import { facebookProvider } from './facebook/facebook.provider';
import { instagramProvider } from './instagram/instagram.provider';
import {
  channelCatalogue,
  findProvider,
  findProviderBySlug,
  getProvider,
  registerProvider,
  registeredChannels,
  type ChannelCapability,
} from './registry';
import type { MessagingProvider } from './types';

/**
 * The single place channels are wired in.
 *
 * Adding a channel is: implement the provider, import it here, register it in
 * `onModuleInit`. No other file changes — Instagram went in exactly that way,
 * and the conversation system did not move.
 *
 * The lookup table itself stays a module-level map in `registry.ts`: providers
 * are stateless adapters with no dependencies, and keeping them out of the
 * container means a unit test can exercise one without booting Nest. This
 * service is the injectable face of that map, so the code that resolves a
 * channel does so through DI like everything else.
 */
@Injectable()
export class ChannelRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ChannelRegistryService.name);

  onModuleInit(): void {
    // Registration is idempotent: the map is keyed by channel, so a second
    // application instance in the same process (a test) simply overwrites.
    registerProvider(facebookProvider);
    registerProvider(instagramProvider);

    this.logger.log(
      {
        channels: registeredChannels(),
        // Both read the same three Meta variables, so they report together.
        meta: facebookProvider.isConfigured() ? 'configured' : 'credentials missing',
      },
      'Channel providers registered',
    );
  }

  /** Throws a 503 naming the channel when no provider is registered for it. */
  get(channel: Channel): MessagingProvider {
    return getProvider(channel);
  }

  find(channel: Channel): MessagingProvider | null {
    return findProvider(channel);
  }

  /** Providers are looked up by URL slug on the webhook routes: /api/webhooks/facebook. */
  findBySlug(slug: string): MessagingProvider | null {
    return findProviderBySlug(slug);
  }

  /** Catalogue rendered by the integrations screen, including unbuilt channels. */
  catalogue(): ChannelCapability[] {
    return channelCatalogue();
  }

  /** The integration type a channel connects through. They are 1:1 today. */
  integrationTypeForChannel(channel: Channel): IntegrationType {
    return channel as unknown as IntegrationType;
  }

  channelForIntegrationType(type: IntegrationType): Channel {
    return type as unknown as Channel;
  }
}
