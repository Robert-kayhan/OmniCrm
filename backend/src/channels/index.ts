/**
 * The single place channels are wired in.
 *
 * Adding Instagram later is: implement the provider, import it here, register
 * it with `registerProvider`. No other file changes.
 */
import { logger } from '../config/logger';
import { facebookProvider } from './facebook/facebook.provider';
import { registerProvider, registeredChannels } from './registry';

export * from './types';
export * from './registry';

export function registerChannelProviders(): void {
  registerProvider(facebookProvider);

  logger.info(
    {
      channels: registeredChannels(),
      facebook: facebookProvider.isConfigured() ? 'configured' : 'credentials missing',
    },
    'Channel providers registered',
  );
}
