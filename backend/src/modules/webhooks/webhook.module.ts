import { Module } from '@nestjs/common';
import { ConversationIngestModule } from '../conversations/conversation-ingest.module';
import { IntegrationModule } from '../integrations/integration.module';
import { NotificationModule } from '../notifications/notification.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [ConversationIngestModule, IntegrationModule, NotificationModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
