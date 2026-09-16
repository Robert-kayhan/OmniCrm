import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Global because emitting is cross-cutting: conversations, messages,
 * assignments and notifications all broadcast, and none of them should have to
 * declare a dependency on the transport to do it.
 */
@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
