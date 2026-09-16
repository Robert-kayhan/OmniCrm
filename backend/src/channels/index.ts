/**
 * The single place channels are wired in.
 *
 * Adding a channel is: implement the provider, import it here, register it with
 * `registerProvider`. No other file changes — Instagram went in exactly that
 * way, and the conversation system did not move.
 */
import { logger } from '../config/logger';
import { facebookProvider } from './facebook/facebook.provider';
import { instagramProvider } from './instagram/instagram.provider';
import { registerProvider, registeredChannels } from './registry';

export * from './types';
export * from './registry';

export function registerChannelProviders(): void {
  registerProvider(facebookProvider);
  registerProvider(instagramProvider);

  logger.info(
    {
      channels: registeredChannels(),
      // Both read the same three Meta variables, so they report together.
      meta: facebookProvider.isConfigured() ? 'configured' : 'credentials missing',
    },
    'Channel providers registered',
  );
}
