import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversations/conversation.module';
import { NotificationModule } from '../notifications/notification.module';
import { AssignmentLedgerModule } from './assignment-ledger.module';
import { AssignmentController } from './assignment.controller';
import { AssignmentService } from './assignment.service';

@Module({
  imports: [ConversationModule, AssignmentLedgerModule, NotificationModule],
  controllers: [AssignmentController],
  providers: [AssignmentService],
  exports: [AssignmentService],
})
export class AssignmentModule {}
