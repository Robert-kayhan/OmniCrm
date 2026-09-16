/**
 * The channel abstraction's public surface.
 *
 * Nothing outside this folder may import a concrete provider: resolve one
 * through `ChannelRegistryService` so an unimplemented channel fails with a
 * clear 503 instead of a crash, and so adding a channel touches one file.
 */
export * from './types';
export * from './registry';
export * from './channel-registry.service';
export * from './channel.module';
