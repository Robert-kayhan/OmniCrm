import { Global, Module } from '@nestjs/common';
import { ChannelRegistryService } from './channel-registry.service';

/**
 * Global: integrations, messages, webhooks and ingest all resolve providers,
 * and the registry is process-wide infrastructure rather than any one feature's
 * collaborator.
 */
@Global()
@Module({
  providers: [ChannelRegistryService],
  exports: [ChannelRegistryService],
})
export class ChannelModule {}
