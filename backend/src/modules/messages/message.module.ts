import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversations/conversation.module';
import { IntegrationModule } from '../integrations/integration.module';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';

@Module({
  // ConversationModule for the visibility check, IntegrationModule because
  // delivering a reply needs the channel's decrypted credentials.
  imports: [ConversationModule, IntegrationModule],
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessageModule {}
