import { Module } from '@nestjs/common';
import { ConversationIngestService } from './conversation.ingest';

/**
 * The intake path, in its own module.
 *
 * Webhooks, the Meta history import and the dev simulator all write inbound
 * messages through it, and none of them needs the rest of the conversation
 * feature — keeping it separate is what stops those three from depending on
 * the controller-facing ConversationModule.
 */
@Module({
  providers: [ConversationIngestService],
  exports: [ConversationIngestService],
})
export class ConversationIngestModule {}
