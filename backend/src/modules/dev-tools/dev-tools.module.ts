import { Module } from '@nestjs/common';
import { ConversationIngestModule } from '../conversations/conversation-ingest.module';
import { DevToolsController } from './dev-tools.controller';
import { DevToolsGuard } from './dev-tools.guard';
import { DevToolsService } from './dev-tools.service';

@Module({
  imports: [ConversationIngestModule],
  controllers: [DevToolsController],
  providers: [DevToolsService, DevToolsGuard],
})
export class DevToolsModule {}
