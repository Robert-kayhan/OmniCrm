import { Module } from '@nestjs/common';
import { ConversationIngestModule } from '../conversations/conversation-ingest.module';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { MetaImportService } from './meta-import.service';
import { MetaOAuthService } from './meta-oauth.service';
import { MetaOAuthStore } from './meta-oauth.store';

@Module({
  // The history backfill replays Meta threads through the same intake path a
  // webhook uses, so it needs the ingest service rather than a private copy.
  imports: [ConversationIngestModule],
  controllers: [IntegrationController],
  providers: [IntegrationService, MetaOAuthService, MetaOAuthStore, MetaImportService],
  exports: [IntegrationService],
})
export class IntegrationModule {}
