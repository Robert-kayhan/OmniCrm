import { Module } from '@nestjs/common';
import { AssignmentLedgerModule } from '../assignments/assignment-ledger.module';
import { CustomerModule } from '../customers/customer.module';
import { TagModule } from '../tags/tag.module';
import { ConversationAccessService } from './conversation.access';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';

@Module({
  imports: [CustomerModule, TagModule, AssignmentLedgerModule],
  controllers: [ConversationController],
  providers: [ConversationAccessService, ConversationService],
  // ConversationAccessService is exported on its own because messages, notes
  // and assignments each need the visibility check without needing the rest of
  // the conversation service.
  exports: [ConversationService, ConversationAccessService],
})
export class ConversationModule {}
